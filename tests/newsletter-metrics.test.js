const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  buildNewsletterLifecycleFact,
  createNewsletterCampaignKey,
  createNewsletterLifecycleEventId,
  observeNewsletterLifecycle,
  postNewsletterLifecycleFact,
  validateNewsletterLifecycleFact
} = require("../lib/newsletter-metrics");

const signingSecret = "newsletter-signing-test-secret-with-32-bytes";
const idSecret = "newsletter-identifier-test-secret-with-32-bytes";

const metricsResponse = (status = 202) => ({
  ok: status >= 200 && status < 300,
  status
});

const withMetricsEnv = async (values, operation) => {
  const keys = [
    "RADAR_NEWSLETTER_METRICS_ENDPOINT",
    "NEWSLETTER_METRICS_WEBHOOK_SECRET",
    "NEWSLETTER_METRICS_ID_SECRET",
    "RADAR_NEWSLETTER_METRICS_TIMEOUT_MS"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
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

test("lifecycle facts expose only the strict pseudonymous schema and use the identifier secret", () => {
  const privateSource = "reader@example.test:contact_secret:token_secret";
  const broadcastId = "broadcast_provider_secret";
  const observation = {
    type: "broadcast.accepted",
    occurredAt: "2026-07-18T08:09:10.000Z",
    eventSource: privateSource,
    issueId: "2026-07",
    campaignSource: broadcastId,
    email: "must-not-pass@example.test"
  };
  const fact = buildNewsletterLifecycleFact(observation, idSecret);
  const repeat = buildNewsletterLifecycleFact(observation, idSecret);
  const expectedEventId = `nle_${crypto.createHmac("sha256", idSecret)
    .update(`newsletter-event:${JSON.stringify([observation.type, privateSource])}`)
    .digest("hex")}`;
  const expectedCampaignKey = `nlc_${crypto.createHmac("sha256", idSecret)
    .update(`newsletter-campaign:${broadcastId}`)
    .digest("hex")}`;

  assert.deepEqual(fact, {
    schema_version: 1,
    event_type: "newsletter.lifecycle.observed",
    event_id: expectedEventId,
    type: "broadcast.accepted",
    occurred_at: "2026-07-18T08:09:10.000Z",
    issue_id: "2026-07",
    campaign_key: expectedCampaignKey
  });
  assert.deepEqual(repeat, fact);
  assert.equal(createNewsletterLifecycleEventId(observation.type, privateSource, idSecret), expectedEventId);
  assert.equal(createNewsletterCampaignKey(broadcastId, idSecret), expectedCampaignKey);
  assert.notEqual(
    createNewsletterLifecycleEventId(observation.type, privateSource, signingSecret),
    expectedEventId
  );
  const serialized = JSON.stringify(fact);
  for (const forbidden of [privateSource, broadcastId, "must-not-pass@example.test"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("the metrics transport signs the exact body only with the signing secret", async () => {
  const fact = buildNewsletterLifecycleFact({
    type: "subscription.confirmed",
    occurredAt: "2026-07-18T09:00:00.000Z",
    eventSource: "private-confirmation-source"
  }, idSecret);
  const nowMs = Date.parse("2026-07-18T09:01:02.000Z");
  let captured;

  const result = await postNewsletterLifecycleFact(fact, {
    nowMs,
    config: {
      endpoint: "https://radar.example.test/api/integrations/newsletter/events",
      signingSecret,
      idSecret,
      timeoutMs: 1000
    },
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return metricsResponse(201);
    }
  });

  const timestamp = String(Math.floor(nowMs / 1000));
  const expectedSignature = crypto.createHmac("sha256", signingSecret)
    .update(`${timestamp}.${captured.options.body}`)
    .digest("hex");
  const identifierSignature = crypto.createHmac("sha256", idSecret)
    .update(`${timestamp}.${captured.options.body}`)
    .digest("hex");
  assert.deepEqual(result, { ok: true, statusCode: 201 });
  assert.equal(captured.url, "https://radar.example.test/api/integrations/newsletter/events");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.headers["idempotency-key"], fact.event_id);
  assert.equal(captured.options.headers["x-davide-timestamp"], timestamp);
  assert.equal(captured.options.headers["x-davide-signature"], `sha256=${expectedSignature}`);
  assert.notEqual(captured.options.headers["x-davide-signature"], `sha256=${identifierSignature}`);
  assert.equal(captured.options.body, JSON.stringify(fact));
});

test("enabled lifecycle delivery requires separate strong signing and identifier secrets", async () => {
  const fact = buildNewsletterLifecycleFact({
    type: "subscription.topic_opted_out",
    occurredAt: "2026-07-18T09:00:00.000Z",
    eventSource: "stable-preference-token-source"
  }, idSecret);
  const baseConfig = {
    endpoint: "https://radar.example.test/api/integrations/newsletter/events",
    signingSecret,
    idSecret,
    timeoutMs: 1000
  };

  for (const config of [
    { ...baseConfig, signingSecret: "" },
    { ...baseConfig, idSecret: "" },
    { ...baseConfig, idSecret: signingSecret.slice(0, 12) },
    { ...baseConfig, idSecret: signingSecret }
  ]) {
    await assert.rejects(
      postNewsletterLifecycleFact(fact, {
        config,
        fetchImpl: async () => metricsResponse()
      }),
      (error) => error.code === "configuration_invalid"
        && error.message === "Newsletter lifecycle metrics could not be delivered."
    );
  }
});

test("the transport rejects unsafe facts and destinations and logs no private observation data", async () => {
  const fact = buildNewsletterLifecycleFact({
    type: "subscription.global_unsubscribed",
    occurredAt: "2026-07-18T09:00:00.000Z",
    eventSource: "private-contact-and-preference-token"
  }, idSecret);

  assert.throws(
    () => validateNewsletterLifecycleFact({ ...fact, email: "reader@example.test" }),
    (error) => error.code === "fact_invalid"
  );
  await assert.rejects(
    postNewsletterLifecycleFact(fact, {
      config: {
        endpoint: "http://radar.example.test/api/integrations/newsletter/events",
        signingSecret,
        idSecret,
        timeoutMs: 1000
      },
      fetchImpl: async () => metricsResponse()
    }),
    (error) => error.code === "endpoint_invalid"
  );

  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const logs = [];
  global.fetch = async () => metricsResponse(503);
  console.error = (...args) => logs.push(args);
  try {
    await withMetricsEnv({
      RADAR_NEWSLETTER_METRICS_ENDPOINT: "https://radar.example.test/api/integrations/newsletter/events",
      NEWSLETTER_METRICS_WEBHOOK_SECRET: signingSecret,
      NEWSLETTER_METRICS_ID_SECRET: idSecret
    }, async () => {
      const result = await observeNewsletterLifecycle({
        type: "subscription.global_unsubscribed",
        occurredAt: "2026-07-18T09:00:00.000Z",
        eventSource: "contact_private@example.test:provider_contact_id:preference_token"
      });
      assert.deepEqual(result, { delivered: false, code: "request_rejected" });
    });
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  assert.deepEqual(logs, [[
    "Newsletter lifecycle metric failed",
    { type: "subscription.global_unsubscribed", code: "request_rejected" }
  ]]);
  const serializedLogs = JSON.stringify(logs);
  for (const forbidden of ["contact_private@example.test", "provider_contact_id", "preference_token"]) {
    assert.equal(serializedLogs.includes(forbidden), false);
  }
});

test("a fully absent metrics configuration is a quiet no-op while partial configuration fails generically", async () => {
  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await withMetricsEnv({}, async () => {
      assert.deepEqual(await observeNewsletterLifecycle({
        type: "subscription.confirmed",
        occurredAt: "2026-07-18T09:00:00.000Z",
        eventSource: "not-sent"
      }), { delivered: false, code: "not_configured" });
    });
    await withMetricsEnv({
      RADAR_NEWSLETTER_METRICS_ENDPOINT: "https://radar.example.test/api/integrations/newsletter/events",
      NEWSLETTER_METRICS_WEBHOOK_SECRET: signingSecret
    }, async () => {
      assert.deepEqual(await observeNewsletterLifecycle({
        type: "subscription.confirmed",
        occurredAt: "2026-07-18T09:00:00.000Z",
        eventSource: "not-sent"
      }), { delivered: false, code: "configuration_invalid" });
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(logs, [[
    "Newsletter lifecycle metric failed",
    { type: "subscription.confirmed", code: "configuration_invalid" }
  ]]);
});
