const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  buildNewsletterLifecycleFact,
  createNewsletterCampaignKey,
  observeNewsletterLifecycle,
  postNewsletterLifecycleFact,
  validateNewsletterLifecycleFact
} = require("../lib/newsletter-metrics");

const metricsSecret = "newsletter-metrics-test-secret-with-32-bytes";

const metricsResponse = (status = 202) => ({
  ok: status >= 200 && status < 300,
  status
});

const withMetricsEnv = async (values, operation) => {
  const keys = [
    "RADAR_NEWSLETTER_METRICS_ENDPOINT",
    "NEWSLETTER_METRICS_WEBHOOK_SECRET",
    "RADAR_NEWSLETTER_METRICS_TIMEOUT_MS"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("lifecycle facts expose only the strict anonymous schema and deterministic HMAC keys", () => {
  const privateSource = "reader@example.test:contact_secret:token_secret";
  const broadcastId = "broadcast_provider_secret";
  const observation = {
    type: "broadcast.accepted",
    occurredAt: "2026-07-15T08:09:10.000Z",
    eventSource: privateSource,
    issueId: "2026-07",
    campaignSource: broadcastId,
    email: "must-not-pass@example.test"
  };
  const fact = buildNewsletterLifecycleFact(observation, metricsSecret);
  const repeat = buildNewsletterLifecycleFact(observation, metricsSecret);
  const expectedCampaignKey = `nlc_${crypto.createHmac("sha256", metricsSecret)
    .update(`newsletter-campaign:${broadcastId}`)
    .digest("hex")}`;

  assert.deepEqual(fact, {
    schema_version: 1,
    event_type: "newsletter.lifecycle.observed",
    event_id: fact.event_id,
    type: "broadcast.accepted",
    occurred_at: "2026-07-15T08:09:10.000Z",
    issue_id: "2026-07",
    campaign_key: expectedCampaignKey
  });
  assert.match(fact.event_id, /^nle_[a-f0-9]{64}$/);
  assert.equal(fact.event_id, repeat.event_id);
  assert.equal(createNewsletterCampaignKey(broadcastId, metricsSecret), expectedCampaignKey);
  assert.equal(JSON.stringify(fact).includes(privateSource), false);
  assert.equal(JSON.stringify(fact).includes(broadcastId), false);
  assert.equal(JSON.stringify(fact).includes("must-not-pass@example.test"), false);
});

test("the metrics transport signs the exact body and uses event ID for idempotency", async () => {
  const fact = buildNewsletterLifecycleFact({
    type: "subscription.confirmed",
    occurredAt: "2026-07-15T09:00:00.000Z",
    eventSource: "private-confirmation-source"
  }, metricsSecret);
  const nowMs = Date.parse("2026-07-15T09:01:02.000Z");
  let captured;

  const result = await postNewsletterLifecycleFact(fact, {
    nowMs,
    config: {
      endpoint: "https://radar.example.test/api/integrations/newsletter/events",
      secret: metricsSecret,
      timeoutMs: 1000
    },
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return metricsResponse(201);
    }
  });

  const timestamp = String(Math.floor(nowMs / 1000));
  const expectedSignature = crypto.createHmac("sha256", metricsSecret)
    .update(`${timestamp}.${captured.options.body}`)
    .digest("hex");
  assert.deepEqual(result, { ok: true, statusCode: 201 });
  assert.equal(captured.url, "https://radar.example.test/api/integrations/newsletter/events");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.headers["idempotency-key"], fact.event_id);
  assert.equal(captured.options.headers["x-davide-timestamp"], timestamp);
  assert.equal(captured.options.headers["x-davide-signature"], `sha256=${expectedSignature}`);
  assert.equal(captured.options.body, JSON.stringify(fact));
});

test("the transport rejects unsafe endpoints, extra fields, and bounds timeout failures generically", async () => {
  const fact = buildNewsletterLifecycleFact({
    type: "subscription.topic_opted_out",
    occurredAt: "2026-07-15T09:00:00.000Z",
    eventSource: "private-topic-transition"
  }, metricsSecret);

  await assert.rejects(
    postNewsletterLifecycleFact(fact, {
      config: {
        endpoint: "http://radar.example.test/api/integrations/newsletter/events",
        secret: metricsSecret,
        timeoutMs: 1000
      },
      fetchImpl: async () => metricsResponse()
    }),
    (error) => error.code === "endpoint_invalid"
      && error.message === "Newsletter lifecycle metrics could not be delivered."
  );

  assert.throws(
    () => validateNewsletterLifecycleFact({ ...fact, email: "reader@example.test" }),
    (error) => error.code === "fact_invalid"
  );

  await assert.rejects(
    postNewsletterLifecycleFact(fact, {
      config: {
        endpoint: "http://127.0.0.1:4173/api/integrations/newsletter/events",
        secret: metricsSecret,
        timeoutMs: 5
      },
      fetchImpl: async (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("private timeout detail");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      })
    }),
    (error) => error.code === "request_timeout"
      && error.message === "Newsletter lifecycle metrics could not be delivered."
  );
});

test("best-effort failures log only lifecycle type and generic code", async () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const logs = [];
  global.fetch = async () => metricsResponse(503);
  console.error = (...args) => logs.push(args);

  try {
    await withMetricsEnv({
      RADAR_NEWSLETTER_METRICS_ENDPOINT: "https://radar.example.test/api/integrations/newsletter/events",
      NEWSLETTER_METRICS_WEBHOOK_SECRET: metricsSecret
    }, async () => {
      const result = await observeNewsletterLifecycle({
        type: "subscription.global_unsubscribed",
        occurredAt: "2026-07-15T09:00:00.000Z",
        eventSource: "contact_private@example.test:provider_contact_id:preference_token"
      });
      assert.deepEqual(result, { delivered: false, code: "request_rejected" });
    });
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], [
    "Newsletter lifecycle metric failed",
    { type: "subscription.global_unsubscribed", code: "request_rejected" }
  ]);
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes("contact_private@example.test"), false);
  assert.equal(serializedLogs.includes("provider_contact_id"), false);
  assert.equal(serializedLogs.includes("preference_token"), false);
});
