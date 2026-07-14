const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const { Readable } = require("node:stream");
const test = require("node:test");

const fixture = require("./fixtures/website-enquiry-event.json");
const {
  buildWebsiteEnquiryEvent,
  createContactHandler,
  normalizeAttribution,
  sendEnquiry,
  syncEnquiryNotificationToRadar,
  syncEnquiryToRadar
} = require("../lib/contact");

const request = (body) => {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = "POST";
  req.headers = { "x-forwarded-for": `fixture-${Math.random()}` };
  return req;
};

const response = () => {
  const headers = {};
  return {
    statusCode: 0,
    body: "",
    headers,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    end(value) { this.body = String(value || ""); }
  };
};

const bodyFor = (overrides = {}) => ({
  enquiry_id: fixture.enquiry_id,
  submitted_at: fixture.submitted_at,
  name: fixture.contact.name,
  email: fixture.contact.email,
  project: fixture.project.type,
  message: fixture.project.message,
  website: "",
  attribution: fixture.attribution,
  ...overrides
});

const allow = () => ({ allowed: true, retryAfter: 0 });

const withRadarServer = async (responder, operation) => {
  const server = http.createServer(responder);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = {
    endpoint: process.env.RADAR_ENQUIRY_ENDPOINT,
    secret: process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET,
    timeout: process.env.RADAR_ENQUIRY_TIMEOUT_MS
  };
  process.env.RADAR_ENQUIRY_ENDPOINT = `http://127.0.0.1:${server.address().port}/api/integrations/website/enquiries`;
  process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET = "fixture-transport-secret";
  try {
    return await operation();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries({
      RADAR_ENQUIRY_ENDPOINT: previous.endpoint,
      WEBSITE_ENQUIRY_WEBHOOK_SECRET: previous.secret,
      RADAR_ENQUIRY_TIMEOUT_MS: previous.timeout
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("the controlled enquiry is persisted before mail and emits the shared contract", async () => {
  const order = [];
  let capturedEvent;
  const handler = createContactHandler({
    now: () => new Date(fixture.submitted_at),
    rateLimit: allow,
    sync: async (event) => {
      order.push("persist");
      capturedEvent = event;
      return {
        configured: true,
        receipt_created: true,
        notification_status: "pending",
        notification_attempts: 0
      };
    },
    send: async () => {
      order.push("email");
      return { provider: "fixture", message_id: "fixture-message" };
    },
    notify: async (notification) => {
      order.push("notify");
      assert.equal(notification.status, "accepted");
      assert.equal(notification.messageId, "fixture-message");
    }
  });
  const res = response();

  await handler(request(bodyFor()), res);

  assert.deepEqual(order, ["persist", "email", "notify"]);
  assert.deepEqual(capturedEvent, fixture);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, enquiry_id: fixture.enquiry_id });
  assert.equal(res.body.includes(fixture.contact.email), false);
  assert.equal(res.body.includes(fixture.project.message), false);
});

test("an accepted notification is not resent on enquiry replay", async () => {
  let sent = 0;
  const handler = createContactHandler({
    rateLimit: allow,
    sync: async () => ({
      configured: true,
      receipt_created: false,
      notification_status: "accepted",
      notification_attempts: 1
    }),
    send: async () => { sent += 1; }
  });
  const res = response();

  await handler(request(bodyFor()), res);

  assert.equal(res.statusCode, 200);
  assert.equal(sent, 0);
});

test("provider acceptance is not acknowledged until Radar records it and remains retryable", async () => {
  const sentEnquiryIds = [];
  let notificationAttempts = 0;
  const handler = createContactHandler({
    now: () => new Date(fixture.submitted_at),
    rateLimit: allow,
    sync: async () => ({
      configured: true,
      receipt_created: true,
      notification_status: "pending",
      notification_attempts: 0
    }),
    send: async (enquiry) => {
      sentEnquiryIds.push(enquiry.enquiryId);
      return { provider: "resend", message_id: "fixture-message" };
    },
    notify: async () => {
      notificationAttempts += 1;
      if (notificationAttempts > 1) return;
      const error = new Error("fixture Radar write failed");
      error.statusCode = 503;
      throw error;
    }
  });
  const res = response();

  await handler(request(bodyFor()), res);

  assert.deepEqual(sentEnquiryIds, [fixture.enquiry_id]);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(JSON.parse(res.body), {
    error: "Sorry, the message could not be sent right now."
  });
  assert.equal(res.body.includes(fixture.enquiry_id), false);
  assert.equal(res.body.includes(fixture.contact.email), false);
  assert.equal(res.body.includes(fixture.project.message), false);

  const retryResponse = response();
  await handler(request(bodyFor()), retryResponse);

  assert.deepEqual(sentEnquiryIds, [fixture.enquiry_id, fixture.enquiry_id]);
  assert.equal(notificationAttempts, 2);
  assert.equal(retryResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(retryResponse.body), {
    ok: true,
    enquiry_id: fixture.enquiry_id
  });
});

test("ID-bearing enquiries use a stable Resend idempotency key even when SMTP is configured", async () => {
  const previous = {
    fetch: global.fetch,
    apiKey: process.env.RESEND_API_KEY,
    toEmail: process.env.CONTACT_TO_EMAIL,
    fromEmail: process.env.CONTACT_FROM_EMAIL,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS
  };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ id: "fixture-resend-message" })
    };
  };
  process.env.RESEND_API_KEY = "fixture-resend-key";
  process.env.CONTACT_TO_EMAIL = "studio@example.test";
  process.env.CONTACT_FROM_EMAIL = "Davide Studios <studio@example.test>";
  process.env.SMTP_USER = "configured-smtp@example.test";
  process.env.SMTP_PASS = "configured-smtp-password";
  const enquiry = {
    enquiryId: fixture.enquiry_id,
    submittedAt: fixture.submitted_at,
    name: fixture.contact.name,
    email: fixture.contact.email,
    project: fixture.project.type,
    message: fixture.project.message,
    attribution: fixture.attribution
  };

  try {
    await sendEnquiry(enquiry);
    await sendEnquiry(enquiry);
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of Object.entries({
      RESEND_API_KEY: previous.apiKey,
      CONTACT_TO_EMAIL: previous.toEmail,
      CONTACT_FROM_EMAIL: previous.fromEmail,
      SMTP_USER: previous.smtpUser,
      SMTP_PASS: previous.smtpPass
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url === "https://api.resend.com/emails"));
  assert.deepEqual(
    calls.map((call) => call.options.headers["idempotency-key"]),
    [`website-enquiry/${fixture.enquiry_id}`, `website-enquiry/${fixture.enquiry_id}`]
  );
  assert.ok(calls.every((call) => call.options.headers.authorization === "Bearer fixture-resend-key"));
});

test("a failed notification remains retryable and is recorded after acceptance", async () => {
  const notifications = [];
  const failedHandler = createContactHandler({
    now: () => new Date(fixture.submitted_at),
    rateLimit: allow,
    sync: async () => ({
      configured: true,
      receipt_created: true,
      notification_status: "pending",
      notification_attempts: 0
    }),
    send: async () => {
      const error = new Error("provider failure");
      error.name = "DeliveryError";
      throw error;
    },
    notify: async (notification) => { notifications.push(notification); }
  });
  const failedResponse = response();
  await failedHandler(request(bodyFor()), failedResponse);
  assert.equal(failedResponse.statusCode, 500);
  assert.equal(notifications[0].status, "failed");
  assert.equal(notifications[0].errorCode, "DeliveryError");

  let sent = 0;
  const retryHandler = createContactHandler({
    now: () => new Date(fixture.submitted_at),
    rateLimit: allow,
    sync: async () => ({
      configured: true,
      receipt_created: false,
      notification_status: "failed",
      notification_attempts: 1
    }),
    send: async () => {
      sent += 1;
      return { provider: "fixture", message_id: "retry-message" };
    },
    notify: async (notification) => { notifications.push(notification); }
  });
  const retryResponse = response();
  await retryHandler(request(bodyFor()), retryResponse);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(sent, 1);
  assert.equal(notifications.at(-1).status, "accepted");
});

test("the honeypot causes neither persistence nor email and returns no analytics ID", async () => {
  let operations = 0;
  const handler = createContactHandler({
    rateLimit: allow,
    sync: async () => { operations += 1; },
    send: async () => { operations += 1; }
  });
  const res = response();

  await handler(request(bodyFor({ website: "https://spam.invalid" })), res);

  assert.equal(operations, 0);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test("a persistence failure prevents email delivery", async () => {
  let sent = 0;
  const handler = createContactHandler({
    rateLimit: allow,
    sync: async () => { throw new Error("fixture store unavailable"); },
    send: async () => { sent += 1; }
  });
  const res = response();

  await handler(request(bodyFor()), res);

  assert.equal(res.statusCode, 500);
  assert.equal(sent, 0);
  assert.equal(res.body.includes("fixture"), false);
  assert.equal(res.body.includes(fixture.contact.email), false);
});

test("a browser enquiry fails closed when durable intake is not configured", async () => {
  const previousEndpoint = process.env.RADAR_ENQUIRY_ENDPOINT;
  const previousSecret = process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET;
  delete process.env.RADAR_ENQUIRY_ENDPOINT;
  delete process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET;
  let sent = 0;
  const handler = createContactHandler({
    rateLimit: allow,
    send: async () => { sent += 1; }
  });
  const res = response();
  try {
    await handler(request(bodyFor()), res);
  } finally {
    if (previousEndpoint === undefined) delete process.env.RADAR_ENQUIRY_ENDPOINT;
    else process.env.RADAR_ENQUIRY_ENDPOINT = previousEndpoint;
    if (previousSecret === undefined) delete process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET;
    else process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET = previousSecret;
  }

  assert.equal(res.statusCode, 503);
  assert.equal(sent, 0);
  assert.equal(res.body.includes("Radar"), false);
  assert.equal(res.body.includes(fixture.contact.email), false);
});

test("legacy internal contact notifications cannot loop back into Radar", async () => {
  let synced = 0;
  let sent = 0;
  const handler = createContactHandler({
    rateLimit: allow,
    sync: async () => { synced += 1; },
    send: async () => { sent += 1; }
  });
  const res = response();

  await handler(request(bodyFor({ enquiry_id: "", submitted_at: "" })), res);

  assert.equal(res.statusCode, 200);
  assert.equal(synced, 0);
  assert.equal(sent, 1);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test("attribution is allowlisted and excludes click IDs and full URLs", () => {
  const result = normalizeAttribution({
    landing_path: "/?utm_source=secret#fragment",
    referrer_host: "https://instagram.com/private/path",
    utm_source: "instagram",
    gclid: "must-not-survive",
    fbclid: "must-not-survive"
  });

  assert.equal(result.landing_path, "/");
  assert.equal(result.referrer_host, "");
  assert.equal(Object.hasOwn(result, "gclid"), false);
  assert.equal(Object.hasOwn(result, "fbclid"), false);
});

test("analytics consent context is allowlisted and fails closed", () => {
  assert.equal(normalizeAttribution({ consent_state: "granted" }).consent_state, "granted");
  assert.equal(normalizeAttribution({ consent_state: "denied" }).consent_state, "denied");
  assert.equal(normalizeAttribution({ consent_state: "unexpected" }).consent_state, "unset");
});

test("event construction never adds analytics or transport metadata", () => {
  const event = buildWebsiteEnquiryEvent({
    enquiryId: fixture.enquiry_id,
    submittedAt: fixture.submitted_at,
    name: fixture.contact.name,
    email: fixture.contact.email,
    project: fixture.project.type,
    message: fixture.project.message,
    attribution: fixture.attribution
  });
  assert.deepEqual(event, fixture);
  assert.equal(JSON.stringify(event).includes("gclid"), false);
  assert.equal(JSON.stringify(event).includes("user_agent"), false);
  assert.equal(JSON.stringify(event).includes("ip_address"), false);
});

test("the real transport signs the exact body and tolerates an invalid timeout setting", async () => {
  let captured;
  await withRadarServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      captured = { headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        enquiry_id: fixture.enquiry_id,
        receipt_created: true,
        enquiry_created: true,
        notification_status: "pending",
        notification_attempts: 0
      }));
    });
  }, async () => {
    process.env.RADAR_ENQUIRY_TIMEOUT_MS = "not-a-number";
    const result = await syncEnquiryToRadar(fixture);
    assert.equal(result.receipt_created, true);
  });

  assert.equal(captured.body, JSON.stringify(fixture));
  assert.equal(captured.headers["idempotency-key"], fixture.enquiry_id);
  const expected = crypto.createHmac("sha256", "fixture-transport-secret")
    .update(`${captured.headers["x-davide-timestamp"]}.${captured.body}`)
    .digest("hex");
  assert.equal(captured.headers["x-davide-signature"], `sha256=${expected}`);
});

test("the notification transport uses its immutable attempt ID as idempotency key", async () => {
  const attemptId = "nat_transportaccepted00000001";
  let captured;
  await withRadarServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      captured = { headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        enquiry_id: fixture.enquiry_id,
        notification_status: "accepted",
        notification_attempts: 1
      }));
    });
  }, async () => {
    await syncEnquiryNotificationToRadar({
      enquiryId: fixture.enquiry_id,
      attemptId,
      status: "accepted",
      provider: "resend",
      messageId: "fixture-message",
      attemptedAt: fixture.submitted_at
    });
  });

  assert.equal(captured.headers["idempotency-key"], attemptId);
  assert.equal(JSON.parse(captured.body).attempt_id, attemptId);
});

test("the real transport rejects malformed successful responses", async () => {
  await withRadarServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  }, async () => {
    await assert.rejects(syncEnquiryToRadar(fixture), /invalid enquiry receipt/);
  });
});

test("the real transport refuses redirects for the signed PII body", async () => {
  let requests = 0;
  await withRadarServer((req, res) => {
    requests += 1;
    req.resume();
    res.writeHead(307, { location: "/unexpected-target" });
    res.end();
  }, async () => {
    await assert.rejects(syncEnquiryToRadar(fixture));
  });
  assert.equal(requests, 1);
});

test("the homepage cache keys include the current script and stylesheet revisions", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /script\.js\?v=30/);
  assert.match(html, /styles\.css\?v=29/);
  assert.match(html, /privacy-consent\.js\?v=1/);
  assert.match(html, /google-tag\.js\?v=3/);
});
