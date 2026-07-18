const crypto = require("crypto");

const newsletterLifecycleEventType = "newsletter.lifecycle.observed";
const newsletterLifecycleTypes = new Set([
  "subscription.confirmed",
  "subscription.topic_opted_out",
  "subscription.global_unsubscribed",
  "broadcast.accepted"
]);
const eventIdPattern = /^nle_[a-f0-9]{64}$/;
const campaignKeyPattern = /^nlc_[a-f0-9]{64}$/;
const issueIdPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const minimumSecretBytes = 32;
const defaultTimeoutMs = 4000;
const safeErrorCodes = new Set([
  "configuration_invalid",
  "endpoint_invalid",
  "fact_invalid",
  "request_rejected",
  "request_timeout",
  "transport_failed"
]);

class NewsletterMetricsError extends Error {
  constructor(code) {
    super("Newsletter lifecycle metrics could not be delivered.");
    this.name = "NewsletterMetricsError";
    this.code = safeErrorCodes.has(code) ? code : "transport_failed";
  }
}

const fail = (code) => {
  throw new NewsletterMetricsError(code);
};

const hasStrongSecret = (secret) => Buffer.byteLength(String(secret || ""), "utf8") >= minimumSecretBytes;

const requireStrongSecret = (secret) => {
  if (!hasStrongSecret(secret)) fail("configuration_invalid");
  return String(secret);
};

const privateSource = (value) => {
  const source = String(value || "").trim();
  if (!source || Buffer.byteLength(source, "utf8") > 2048) fail("fact_invalid");
  return source;
};

const hmacHex = (secret, value) => crypto
  .createHmac("sha256", requireStrongSecret(secret))
  .update(value, "utf8")
  .digest("hex");

const createNewsletterCampaignKey = (
  rawResendBroadcastId,
  secret = process.env.NEWSLETTER_METRICS_ID_SECRET
) => `nlc_${hmacHex(secret, `newsletter-campaign:${privateSource(rawResendBroadcastId)}`)}`;

const createNewsletterLifecycleEventId = (
  type,
  eventSource,
  secret = process.env.NEWSLETTER_METRICS_ID_SECRET
) => {
  if (!newsletterLifecycleTypes.has(type)) fail("fact_invalid");
  const source = privateSource(eventSource);
  return `nle_${hmacHex(secret, `newsletter-event:${JSON.stringify([type, source])}`)}`;
};

const normalizeOccurredAt = (value) => {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) fail("fact_invalid");
  return new Date(timestamp).toISOString();
};

const buildNewsletterLifecycleFact = (
  observation,
  secret = process.env.NEWSLETTER_METRICS_ID_SECRET
) => {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    fail("fact_invalid");
  }

  const type = String(observation.type || "");
  if (!newsletterLifecycleTypes.has(type)) fail("fact_invalid");

  const isBroadcast = type === "broadcast.accepted";
  if (isBroadcast !== (observation.issueId !== undefined)
    || isBroadcast !== (observation.campaignSource !== undefined)) {
    fail("fact_invalid");
  }

  const fact = {
    schema_version: 1,
    event_type: newsletterLifecycleEventType,
    event_id: createNewsletterLifecycleEventId(type, observation.eventSource, secret),
    type,
    occurred_at: normalizeOccurredAt(observation.occurredAt)
  };

  if (isBroadcast) {
    const issueId = String(observation.issueId || "");
    if (!issueIdPattern.test(issueId)) fail("fact_invalid");
    fact.issue_id = issueId;
    fact.campaign_key = createNewsletterCampaignKey(observation.campaignSource, secret);
  }

  return fact;
};

const validateNewsletterLifecycleFact = (fact) => {
  if (!fact || typeof fact !== "object" || Array.isArray(fact)) fail("fact_invalid");

  const allowedKeys = new Set([
    "schema_version",
    "event_type",
    "event_id",
    "type",
    "occurred_at",
    "issue_id",
    "campaign_key"
  ]);
  if (Object.keys(fact).some((key) => !allowedKeys.has(key))) fail("fact_invalid");

  const isBroadcast = fact.type === "broadcast.accepted";
  const hasIssue = Object.hasOwn(fact, "issue_id");
  const hasCampaign = Object.hasOwn(fact, "campaign_key");
  if (fact.schema_version !== 1
    || fact.event_type !== newsletterLifecycleEventType
    || !eventIdPattern.test(String(fact.event_id || ""))
    || !newsletterLifecycleTypes.has(fact.type)
    || normalizeOccurredAt(fact.occurred_at) !== fact.occurred_at
    || isBroadcast !== hasIssue
    || isBroadcast !== hasCampaign
    || (hasIssue && !issueIdPattern.test(String(fact.issue_id)))
    || (hasCampaign && !campaignKeyPattern.test(String(fact.campaign_key)))) {
    fail("fact_invalid");
  }

  return fact;
};

const newsletterMetricsConfig = () => {
  const configuredTimeout = Number(process.env.RADAR_NEWSLETTER_METRICS_TIMEOUT_MS || defaultTimeoutMs);
  return {
    endpoint: String(process.env.RADAR_NEWSLETTER_METRICS_ENDPOINT || "").trim(),
    signingSecret: String(process.env.NEWSLETTER_METRICS_WEBHOOK_SECRET || ""),
    idSecret: String(process.env.NEWSLETTER_METRICS_ID_SECRET || ""),
    timeoutMs: Number.isFinite(configuredTimeout)
      ? Math.max(1000, Math.min(10000, configuredTimeout))
      : defaultTimeoutMs
  };
};

const resolveMetricsEndpoint = (config) => {
  if (!config.endpoint
    || !hasStrongSecret(config.signingSecret)
    || !hasStrongSecret(config.idSecret)
    || config.signingSecret === config.idSecret) {
    fail("configuration_invalid");
  }

  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch (error) {
    fail("endpoint_invalid");
  }

  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  const secure = endpoint.protocol === "https:";
  if ((!secure && !(endpoint.protocol === "http:" && localhost))
    || endpoint.username
    || endpoint.password) {
    fail("endpoint_invalid");
  }
  return endpoint;
};

const postNewsletterLifecycleFact = async (fact, options = {}) => {
  validateNewsletterLifecycleFact(fact);
  const config = options.config || newsletterMetricsConfig();
  const endpoint = resolveMetricsEndpoint(config);
  const body = JSON.stringify(fact);
  const timestamp = String(Math.floor((options.nowMs ?? Date.now()) / 1000));
  const signature = hmacHex(config.signingSecret, `${timestamp}.${body}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "idempotency-key": fact.event_id,
        "user-agent": "davide-solla-portfolio/1.0",
        "x-davide-timestamp": timestamp,
        "x-davide-signature": `sha256=${signature}`
      },
      body,
      signal: controller.signal
    });

    if (!response.ok) fail("request_rejected");
    return { ok: true, statusCode: response.status };
  } catch (error) {
    if (error instanceof NewsletterMetricsError) throw error;
    if (error?.name === "AbortError") fail("request_timeout");
    fail("transport_failed");
  } finally {
    clearTimeout(timeout);
  }
};

const safeObservationType = (value) => (
  newsletterLifecycleTypes.has(value) ? value : "newsletter.lifecycle.invalid"
);

const observeNewsletterLifecycle = async (observation) => {
  const config = newsletterMetricsConfig();
  if (!config.endpoint && !config.signingSecret && !config.idSecret) {
    return { delivered: false, code: "not_configured" };
  }

  try {
    const fact = buildNewsletterLifecycleFact(observation, config.idSecret);
    await postNewsletterLifecycleFact(fact, { config });
    return { delivered: true, eventId: fact.event_id };
  } catch (error) {
    const code = safeErrorCodes.has(error?.code) ? error.code : "transport_failed";
    console.error("Newsletter lifecycle metric failed", {
      type: safeObservationType(observation?.type),
      code
    });
    return { delivered: false, code };
  }
};

module.exports = {
  buildNewsletterLifecycleFact,
  createNewsletterCampaignKey,
  createNewsletterLifecycleEventId,
  newsletterLifecycleEventType,
  newsletterLifecycleTypes,
  observeNewsletterLifecycle,
  postNewsletterLifecycleFact,
  validateNewsletterLifecycleFact
};
