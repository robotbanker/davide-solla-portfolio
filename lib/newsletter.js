const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { observeNewsletterLifecycle } = require("./newsletter-metrics");
const { rateLimitRequest, timingSafeStringEqual } = require("./security");

const maxBodyBytes = 16 * 1024;
const confirmationTokenTtlMs = 24 * 60 * 60 * 1000;
const preferencesTokenTtlMs = 30 * 60 * 1000;
const preferencesIdempotencyWindowMs = 10 * 60 * 1000;
const preferencesResponseFloorMs = 500;
const encryptedTokenVersion = "v1";
const resendBaseUrl = "https://api.resend.com";
const consentText = "I agree to receive Field Notes emails from Davide Solla Photography. I can unsubscribe at any time.";
const preferencesResponseMessage = "If that address is subscribed, a secure preferences link is on its way.";

const jsonResponse = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};

const htmlResponse = (res, statusCode, { title, heading, message, actionHtml = "" }) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/png" href="/assets/images/favicon.png">
    <link rel="stylesheet" href="/styles.css?v=30">
  </head>
  <body>
    <main class="newsletter-confirmation">
      <section>
        <p class="section-kicker">Field Notes</p>
        <h1>${escapeHtml(heading)}</h1>
        <p>${escapeHtml(message)}</p>
        ${actionHtml || '<a class="text-link text-link-light" href="/field-notes">Read the latest issue</a>'}
      </section>
    </main>
  </body>
</html>`);
};

const readRequestBody = (req) => new Promise((resolve, reject) => {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;

    if (body.length > maxBodyBytes) {
      reject(new Error("Request body is too large"));
      req.destroy();
    }
  });

  req.on("end", () => {
    try {
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!body) {
        resolve({});
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        resolve(Object.fromEntries(new URLSearchParams(body)));
      } else {
        resolve(JSON.parse(body));
      }
    } catch (error) {
      reject(new Error("Invalid request body"));
    }
  });

  req.on("error", reject);
});

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const hasStrongTokenSecret = (value) => Buffer.byteLength(String(value || ""), "utf8") >= 32;

const monotonicTimeMs = () => Number(process.hrtime.bigint()) / 1_000_000;

const waitForPublicResponseFloor = async (startedAt) => {
  const remainingMs = preferencesResponseFloorMs - (monotonicTimeMs() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
};

const envBoolean = (value, fallback) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
};

const newsletterConfig = (req) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:4173");
  const protocol = String(req.headers["x-forwarded-proto"] || "http").split(",")[0] || "http";
  const hostedDefault = process.env.VERCEL ? "https://www.davidesolla.com" : `${protocol}://${host}`;
  const baseUrl = String(process.env.PUBLIC_SITE_URL || hostedDefault).replace(/\/+$/, "");

  return {
    baseUrl,
    brandName: process.env.NEWSLETTER_BRAND_NAME || "Davide Studios",
    listName: process.env.NEWSLETTER_LIST_NAME || "Field Notes",
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendSegmentId: process.env.NEWSLETTER_RESEND_SEGMENT_ID || "",
    resendTopicId: process.env.NEWSLETTER_RESEND_TOPIC_ID || "",
    doubleOptIn: envBoolean(process.env.NEWSLETTER_DOUBLE_OPT_IN ?? process.env.NEWSLETTER_REQUIRE_CONFIRMATION, true),
    tokenSecret: process.env.NEWSLETTER_TOKEN_SECRET || "",
    fromEmail: process.env.NEWSLETTER_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "",
    replyToEmail: process.env.NEWSLETTER_REPLY_TO_EMAIL || process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER || "",
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== "false" : true,
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || ""
  };
};

const ensureConfigured = (config) => {
  if (!config.resendApiKey) {
    const error = new Error("Newsletter signup is not configured yet.");
    error.statusCode = 503;
    throw error;
  }

  if (!config.resendSegmentId || !config.resendTopicId) {
    const error = new Error("Field Notes audience configuration is not ready yet.");
    error.statusCode = 503;
    throw error;
  }

  if (config.doubleOptIn && !hasStrongTokenSecret(config.tokenSecret)) {
    const error = new Error("Newsletter confirmation is not configured yet.");
    error.statusCode = 503;
    throw error;
  }

  if (config.doubleOptIn && !config.fromEmail) {
    const error = new Error("Newsletter confirmation sender is not configured yet.");
    error.statusCode = 503;
    throw error;
  }
};

const resendRequest = async (path, { method = "POST", body, headers = {} } = {}, config) => {
  const response = await fetch(`${resendBaseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      "content-type": "application/json",
      "user-agent": "davide-solla-portfolio/1.0",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { message: text };
  }

  if (!response.ok) {
    const error = new Error(data.message || data.error || "Email provider rejected the request.");
    error.statusCode = response.status;
    error.body = data;
    throw error;
  }

  return data;
};

const contactProperties = ({ source, consentAt, confirmedAt, consentMethod }) => {
  const properties = {
    source: cleanText(source || "website", 120),
    consent_at: consentAt,
    consent_method: consentMethod,
    consent_text: consentText,
    confirmed_at: confirmedAt,
    website: "davidesolla.com"
  };

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)])
  );
};

const contactPayload = (subscriber, config, options = {}) => {
  const payload = {
    email: subscriber.email,
    unsubscribed: false
  };

  if (subscriber.firstName) {
    payload.first_name = cleanText(subscriber.firstName, 80);
  }

  if (options.includeProperties !== false) {
    payload.properties = contactProperties(subscriber);
  }

  if (config.resendSegmentId) {
    payload.segments = [{ id: config.resendSegmentId }];
  }

  if (config.resendTopicId) {
    payload.topics = [{ id: config.resendTopicId, subscription: "opt_in" }];
  }

  return payload;
};

const isDuplicateContactError = (error) => {
  const message = JSON.stringify(error.body || error.message || "");
  return [400, 409, 422].includes(error.statusCode) && /already|duplicate|exists|unique/i.test(message);
};

const isMissingContactPropertyError = (error) => {
  const message = JSON.stringify(error.body || error.message || "");
  return error.statusCode === 422 && /properties.*exist|reserved key/i.test(message);
};

const addContactToSegment = async (subscriber, config) => {
  if (!config.resendSegmentId) {
    return null;
  }

  return resendRequest(
    `/contacts/${encodeURIComponent(subscriber.email)}/segments/${encodeURIComponent(config.resendSegmentId)}`,
    { method: "POST" },
    config
  );
};

const updateContactTopic = async (identifier, config, subscription = "opt_in") => {
  if (!config.resendTopicId) {
    return null;
  }

  return resendRequest(
    `/contacts/${encodeURIComponent(identifier)}/topics`,
    {
      method: "PATCH",
      body: {
        topics: [{ id: config.resendTopicId, subscription }]
      }
    },
    config
  );
};

const getResendContact = (identifier, config) => resendRequest(
  `/contacts/${encodeURIComponent(identifier)}`,
  { method: "GET" },
  config
);

const ensureDuplicateContactCanBeUpdated = async (subscriber, config) => {
  const contact = await getResendContact(subscriber.email, config);
  const previousConsentAt = Date.parse(String(contact.properties?.consent_at || ""));
  const nextConsentAt = Date.parse(String(subscriber.consentAt || ""));

  if (!Number.isFinite(previousConsentAt)
    || !Number.isFinite(nextConsentAt)
    || nextConsentAt <= previousConsentAt) {
    const error = new Error("This confirmation link has already been used. Please start a new signup to confirm fresh consent.");
    error.statusCode = 409;
    throw error;
  }

  return contact;
};

const upsertResendContact = async (subscriber, config) => {
  const payload = contactPayload(subscriber, config);

  try {
    return await resendRequest("/contacts", { method: "POST", body: payload }, config);
  } catch (error) {
    if (isMissingContactPropertyError(error)) {
      const fallbackPayload = contactPayload(subscriber, config, { includeProperties: false });

      try {
        return await resendRequest("/contacts", { method: "POST", body: fallbackPayload }, config);
      } catch (fallbackError) {
        if (!isDuplicateContactError(fallbackError)) {
          throw fallbackError;
        }

        await ensureDuplicateContactCanBeUpdated(subscriber, config);
        const updated = await resendRequest(`/contacts/${encodeURIComponent(subscriber.email)}`, {
          method: "PATCH",
          body: {
            unsubscribed: false,
            first_name: fallbackPayload.first_name
          }
        }, config);

        await addContactToSegment(subscriber, config);
        await updateContactTopic(subscriber.email, config);
        return updated;
      }
    }

    if (!isDuplicateContactError(error)) {
      throw error;
    }

    await ensureDuplicateContactCanBeUpdated(subscriber, config);
    let updated;

    try {
      updated = await resendRequest(`/contacts/${encodeURIComponent(subscriber.email)}`, {
        method: "PATCH",
        body: {
          unsubscribed: false,
          first_name: payload.first_name,
          properties: payload.properties
        }
      }, config);
    } catch (patchError) {
      if (!isMissingContactPropertyError(patchError)) {
        throw patchError;
      }

      updated = await resendRequest(`/contacts/${encodeURIComponent(subscriber.email)}`, {
        method: "PATCH",
        body: {
          unsubscribed: false,
          first_name: payload.first_name
        }
      }, config);
    }

    await addContactToSegment(subscriber, config);
    await updateContactTopic(subscriber.email, config);
    return updated;
  }
};

const tokenSignature = (payload, secret) => crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("base64url");

const createSignedToken = (claims, purpose, ttlMs, config, options = {}) => {
  const issuedAt = Number.isFinite(options.issuedAt) ? options.issuedAt : Date.now();
  const nonce = options.nonce || crypto.randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    purpose,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    nonce
  })).toString("base64url");

  return `${payload}.${tokenSignature(payload, config.tokenSecret)}`;
};

const encryptedTokenContext = (purpose) => `davide-studios-newsletter:${purpose}:${encryptedTokenVersion}`;

const encryptedTokenKey = (secret, purpose) => crypto
  .createHmac("sha256", secret)
  .update(encryptedTokenContext(purpose))
  .digest();

const createEncryptedToken = (claims, purpose, ttlMs, config) => {
  const issuedAt = Date.now();
  const plaintext = Buffer.from(JSON.stringify({
    ...claims,
    purpose,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    nonce: crypto.randomBytes(16).toString("base64url")
  }), "utf8");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptedTokenKey(config.tokenSecret, purpose), iv);
  cipher.setAAD(Buffer.from(encryptedTokenContext(purpose), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    encryptedTokenVersion,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url")
  ].join(".");
};

const verifyEncryptedToken = (token, purpose, config) => {
  const parts = String(token || "").split(".");

  try {
    if (parts.length !== 4 || parts[0] !== encryptedTokenVersion) {
      throw new Error("invalid token format");
    }

    const iv = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > 4096) {
      throw new Error("invalid token shape");
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptedTokenKey(config.tokenSecret, purpose), iv);
    decipher.setAAD(Buffer.from(encryptedTokenContext(purpose), "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const claims = JSON.parse(plaintext.toString("utf8"));

    if (claims.purpose !== purpose || !claims.expiresAt || claims.expiresAt < Date.now()) {
      throw new Error("invalid token claims");
    }

    return claims;
  } catch (cause) {
    const error = new Error("This secure link has expired or is invalid.");
    error.statusCode = 400;
    throw error;
  }
};

const verifySignedToken = (token, purpose, config) => {
  const [payload, signature] = String(token || "").split(".");

  if (!payload || !signature || payload.length > 4096) {
    const error = new Error("This secure link is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const expected = tokenSignature(payload, config.tokenSecret);

  if (!timingSafeStringEqual(signature, expected)) {
    const error = new Error("This secure link is invalid.");
    error.statusCode = 400;
    throw error;
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (cause) {
    const error = new Error("This secure link is invalid.");
    error.statusCode = 400;
    throw error;
  }

  if (claims.purpose !== purpose || !claims.expiresAt || claims.expiresAt < Date.now()) {
    const error = new Error("This secure link has expired or is invalid.");
    error.statusCode = 400;
    throw error;
  }

  return claims;
};

const createConfirmationToken = (subscriber, config) => createEncryptedToken({
  email: subscriber.email,
  firstName: subscriber.firstName,
  source: subscriber.source,
  consentAt: subscriber.consentAt
}, "confirm-subscription", confirmationTokenTtlMs, config);

const verifyConfirmationToken = (token, config) => {
  const subscriber = verifyEncryptedToken(token, "confirm-subscription", config);

  if (!subscriber.email) {
    const error = new Error("This confirmation link is invalid.");
    error.statusCode = 400;
    throw error;
  }

  subscriber.firstName = cleanText(subscriber.firstName, 80);
  subscriber.email = cleanText(subscriber.email, 160).toLowerCase();
  subscriber.source = cleanText(subscriber.source, 120);
  subscriber.confirmedAt = new Date().toISOString();
  subscriber.consentMethod = "website_double_opt_in";
  return subscriber;
};

const createPreferencesToken = (contactId, config, options = {}) => createSignedToken(
  { contactId: cleanText(contactId, 160) },
  "manage-preferences",
  preferencesTokenTtlMs,
  config,
  options
);

const verifyPreferencesToken = (token, config) => {
  const claims = verifySignedToken(token, "manage-preferences", config);
  const contactId = cleanText(claims.contactId, 160);
  if (!contactId) {
    const error = new Error("This preferences link is invalid.");
    error.statusCode = 400;
    throw error;
  }
  return contactId;
};

const confirmationUrl = (token, config) => `${config.baseUrl}/api/newsletter?action=confirm&token=${encodeURIComponent(token)}`;

const confirmationText = (url, config) => [
  `Confirm your ${config.listName} subscription`,
  "",
  `Please confirm that you want to receive ${config.listName} emails from ${config.brandName}:`,
  url,
  "",
  "If this was not you, you can ignore this email."
].join("\n");

const confirmationHtml = (url, config) => `
  <div style="background:#0b0a09;color:#f1ede6;font-family:Avenir Next,Helvetica,Arial,sans-serif;margin:0;padding:32px;">
    <div style="margin:0 auto;max-width:560px;">
      <p style="color:#bca66e;font-size:12px;font-weight:700;margin:0 0 16px;text-transform:uppercase;">${escapeHtml(config.listName)}</p>
      <h1 style="font-family:Georgia,Times New Roman,serif;font-size:34px;font-weight:400;line-height:1.1;margin:0 0 18px;">Confirm your subscription</h1>
      <p style="color:#cfc6bb;font-size:16px;line-height:1.65;margin:0 0 24px;">Please confirm that you want to receive ${escapeHtml(config.listName)} emails from ${escapeHtml(config.brandName)}.</p>
      <p style="margin:0 0 28px;"><a href="${escapeHtml(url)}" style="border:1px solid rgba(241,237,230,0.48);color:#f1ede6;display:inline-block;font-size:12px;font-weight:700;padding:14px 18px;text-decoration:none;text-transform:uppercase;">Confirm subscription</a></p>
      <p style="color:#a9a29a;font-size:13px;line-height:1.6;margin:0;">If this was not you, you can ignore this email.</p>
    </div>
  </div>
`;

const sendConfirmationEmail = async (subscriber, config) => {
  const token = createConfirmationToken(subscriber, config);
  const url = confirmationUrl(token, config);
  const subject = `Confirm your ${config.listName} subscription`;

  if (config.smtpUser && config.smtpPass) {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    });

    await transporter.sendMail({
      from: config.fromEmail,
      to: subscriber.email,
      replyTo: config.replyToEmail || undefined,
      subject,
      text: confirmationText(url, config),
      html: confirmationHtml(url, config)
    });
    return;
  }

  await resendRequest("/emails", {
    method: "POST",
    body: {
      from: config.fromEmail,
      to: [subscriber.email],
      reply_to: config.replyToEmail || undefined,
      subject,
      text: confirmationText(url, config),
      html: confirmationHtml(url, config),
      tags: [{ name: "message_type", value: "field_notes_confirmation" }]
    }
  }, config);
};

const ensurePreferencesConfigured = (config) => {
  if (!config.resendApiKey || !hasStrongTokenSecret(config.tokenSecret) || !config.fromEmail) {
    const error = new Error("Newsletter preferences are not configured yet.");
    error.statusCode = 503;
    throw error;
  }
};

const isMissingContactError = (error) => error?.statusCode === 404;

const getResendContactTopics = (identifier, config) => resendRequest(
  `/contacts/${encodeURIComponent(identifier)}/topics`,
  { method: "GET" },
  config
);

const getFieldNotesPreference = async (identifier, config) => {
  if (!config.resendTopicId) {
    return { fieldNotes: null, topicConfigured: false };
  }

  const topics = await getResendContactTopics(identifier, config);
  const topic = (topics.data || []).find((item) => item.id === config.resendTopicId);
  if (!topic || !["opt_in", "opt_out"].includes(topic.subscription)) {
    return { fieldNotes: null, topicConfigured: false };
  }

  return {
    fieldNotes: topic.subscription === "opt_in",
    topicConfigured: true
  };
};

const preferencesUrl = (token, config) => `${config.baseUrl}/preferences#token=${encodeURIComponent(token)}`;

const preferencesEmailHtml = (url, config) => `
  <div style="background:#0b0a09;color:#f1ede6;font-family:Avenir Next,Helvetica,Arial,sans-serif;margin:0;padding:32px;">
    <div style="margin:0 auto;max-width:560px;">
      <p style="color:#bca66e;font-size:12px;font-weight:700;margin:0 0 16px;text-transform:uppercase;">${escapeHtml(config.listName)}</p>
      <h1 style="font-family:Georgia,Times New Roman,serif;font-size:34px;font-weight:400;line-height:1.1;margin:0 0 18px;">Manage your email preferences</h1>
      <p style="color:#cfc6bb;font-size:16px;line-height:1.65;margin:0 0 24px;">Use this private link to review or change your ${escapeHtml(config.listName)} subscription. It expires in 30 minutes.</p>
      <p style="margin:0 0 28px;"><a href="${escapeHtml(url)}" style="border:1px solid rgba(241,237,230,0.48);color:#f1ede6;display:inline-block;font-size:12px;font-weight:700;padding:14px 18px;text-decoration:none;text-transform:uppercase;">Open preferences</a></p>
      <p style="color:#a9a29a;font-size:13px;line-height:1.6;margin:0;">If you did not request this link, you can ignore this email.</p>
    </div>
  </div>
`;

const sendPreferencesEmail = async (contact, config) => {
  const contactId = cleanText(contact?.id, 160);
  const recipient = cleanText(contact?.email, 160).toLowerCase();
  if (!contactId || !isValidEmail(recipient)) {
    const error = new Error("Newsletter contact could not be verified.");
    error.statusCode = 502;
    throw error;
  }

  const bucket = Math.floor(Date.now() / preferencesIdempotencyWindowMs);
  const issuedAt = bucket * preferencesIdempotencyWindowMs;
  const deterministicNonce = crypto
    .createHmac("sha256", config.tokenSecret)
    .update(`manage-preferences-token:${contactId}:${bucket}`)
    .digest("base64url");
  const token = createPreferencesToken(contactId, config, {
    issuedAt,
    nonce: deterministicNonce
  });
  const url = preferencesUrl(token, config);
  const idempotencyDigest = crypto
    .createHmac("sha256", config.tokenSecret)
    .update(`${contactId}:${bucket}`)
    .digest("hex");

  await resendRequest("/emails", {
    method: "POST",
    headers: { "idempotency-key": `newsletter-preferences/${idempotencyDigest}` },
    body: {
      from: config.fromEmail,
      to: [recipient],
      reply_to: config.replyToEmail || undefined,
      subject: `Manage your ${config.listName} preferences`,
      text: `Manage your ${config.listName} preferences. This private link expires in 30 minutes:\n${url}\n\nIf you did not request this link, ignore this email.`,
      html: preferencesEmailHtml(url, config),
      tags: [{ name: "message_type", value: "field_notes_preferences" }]
    }
  }, config);
};

const isConsentGranted = (value) => value === true || value === "true" || value === "yes" || value === "on";

const handleSubscribe = async (req, res) => {
  const config = newsletterConfig(req);
  const body = await readRequestBody(req);
  const website = cleanText(body.website, 200);

  if (website) {
    jsonResponse(res, 200, {
      ok: true,
      message: "Please check your inbox to confirm your Field Notes subscription."
    });
    return;
  }

  ensureConfigured(config);

  const attempt = rateLimitRequest(req, "newsletter", { limit: 6, windowMs: 15 * 60 * 1000 });

  if (!attempt.allowed) {
    res.setHeader("retry-after", String(attempt.retryAfter));
    jsonResponse(res, 429, { error: "Please wait before trying again." });
    return;
  }

  const email = cleanText(body.email, 160).toLowerCase();
  const firstName = cleanText(body.firstName, 80);
  const source = cleanText(body.source, 120) || "website";

  if (!isValidEmail(email) || !isConsentGranted(body.consent)) {
    jsonResponse(res, 400, { error: "Please enter a valid email and confirm consent." });
    return;
  }

  const subscriber = {
    email,
    firstName,
    source,
    consentAt: new Date().toISOString()
  };

  if (config.doubleOptIn) {
    await sendConfirmationEmail(subscriber, config);
    jsonResponse(res, 200, {
      ok: true,
      requiresConfirmation: true,
      message: "Please check your inbox to confirm your Field Notes subscription."
    });
    return;
  }

  await upsertResendContact({
    ...subscriber,
    confirmedAt: subscriber.consentAt,
    consentMethod: "website_single_opt_in"
  }, config);
  await observeNewsletterLifecycle({
    type: "subscription.confirmed",
    occurredAt: subscriber.consentAt,
    eventSource: `single-opt-in:${subscriber.email}:${subscriber.consentAt}`
  });

  jsonResponse(res, 200, {
    ok: true,
    requiresConfirmation: false,
    message: "You're on the Field Notes list. Welcome."
  });
};

const handleConfirmPrompt = async (req, res) => {
  const config = newsletterConfig(req);

  try {
    ensureConfigured(config);
    const requestUrl = new URL(req.url, `${config.baseUrl}/`);
    const token = requestUrl.searchParams.get("token") || "";
    const subscriber = verifyConfirmationToken(token, config);

    if (!isValidEmail(subscriber.email)) {
      throw new Error("This confirmation link is invalid.");
    }

    htmlResponse(res, 200, {
      title: "Confirm Field Notes",
      heading: "Confirm your subscription.",
      message: "Choose confirm below to join Field Notes. Opening this page alone does not subscribe you.",
      actionHtml: `<form class="newsletter-form" action="/api/newsletter?action=confirm" method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button class="submit-button" type="submit">Confirm subscription</button></form>`
    });
  } catch (error) {
    htmlResponse(res, error.statusCode || 500, {
      title: "Field Notes confirmation",
      heading: "Confirmation could not be opened.",
      message: [400, 409].includes(error.statusCode)
        ? error.message
        : "Please try the signup form again, or contact the studio if the problem continues."
    });
  }
};

const handleConfirm = async (req, res) => {
  const config = newsletterConfig(req);

  try {
    ensureConfigured(config);
    const body = await readRequestBody(req);
    const subscriber = verifyConfirmationToken(body.token, config);

    if (!isValidEmail(subscriber.email)) {
      throw new Error("This confirmation link is invalid.");
    }

    await upsertResendContact(subscriber, config);
    await observeNewsletterLifecycle({
      type: "subscription.confirmed",
      occurredAt: subscriber.confirmedAt,
      eventSource: `double-opt-in:${subscriber.email}:${subscriber.consentAt}`
    });
    htmlResponse(res, 200, {
      title: "Field Notes confirmed",
      heading: "You're subscribed.",
      message: "Thank you for confirming. The next Field Notes email will arrive with the monthly studio edit."
    });
  } catch (error) {
    htmlResponse(res, error.statusCode || 500, {
      title: "Field Notes confirmation",
      heading: "Confirmation could not be completed.",
      message: [400, 409].includes(error.statusCode)
        ? error.message
        : "Please try the signup form again, or contact the studio if the problem continues."
    });
  }
};

const handleRequestPreferences = async (req, res) => {
  const responseStartedAt = monotonicTimeMs();
  const config = newsletterConfig(req);
  const body = await readRequestBody(req);

  if (cleanText(body.website, 200)) {
    jsonResponse(res, 200, { ok: true, message: preferencesResponseMessage });
    return;
  }

  ensurePreferencesConfigured(config);
  const attempt = rateLimitRequest(req, "newsletter-preferences", { limit: 4, windowMs: 30 * 60 * 1000 });
  if (!attempt.allowed) {
    res.setHeader("retry-after", String(attempt.retryAfter));
    jsonResponse(res, 429, { error: "Please wait before requesting another secure link." });
    return;
  }

  const email = cleanText(body.email, 160).toLowerCase();
  if (isValidEmail(email)) {
    try {
      const contact = await getResendContact(email, config);
      await sendPreferencesEmail(contact, config);
    } catch (error) {
      if (!isMissingContactError(error)) {
        console.error("Newsletter preferences provider operation failed", {
          statusCode: error.statusCode || 500,
          errorType: error.name || "Error"
        });
      }
    }
  }

  await waitForPublicResponseFloor(responseStartedAt);
  jsonResponse(res, 200, { ok: true, message: preferencesResponseMessage });
};

const handleReadPreferences = async (req, res) => {
  const config = newsletterConfig(req);
  ensurePreferencesConfigured(config);
  const body = await readRequestBody(req);
  const contactId = verifyPreferencesToken(body.token, config);
  const contact = await getResendContact(contactId, config);
  const topicPreference = await getFieldNotesPreference(contactId, config);

  jsonResponse(res, 200, {
    ok: true,
    preferences: {
      globallySubscribed: contact.unsubscribed !== true,
      ...topicPreference
    }
  });
};

const handleUpdatePreferences = async (req, res) => {
  const config = newsletterConfig(req);
  ensurePreferencesConfigured(config);
  const body = await readRequestBody(req);
  const contactId = verifyPreferencesToken(body.token, config);

  if (body.unsubscribeAll === true) {
    const contact = await getResendContact(contactId, config);
    if (contact.unsubscribed === true) {
      jsonResponse(res, 200, {
        ok: true,
        preferences: { globallySubscribed: false, fieldNotes: null, topicConfigured: false },
        message: "You are unsubscribed from all Davide Studios marketing emails."
      });
      return;
    }

    await resendRequest(`/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      body: { unsubscribed: true }
    }, config);
    const occurredAt = new Date().toISOString();
    await observeNewsletterLifecycle({
      type: "subscription.global_unsubscribed",
      occurredAt,
      eventSource: `global-opt-out:${contactId}:${occurredAt}`
    });
    jsonResponse(res, 200, {
      ok: true,
      preferences: { globallySubscribed: false, fieldNotes: null, topicConfigured: false },
      message: "You are unsubscribed from all Davide Studios marketing emails."
    });
    return;
  }

  if (typeof body.fieldNotes !== "boolean" || !config.resendTopicId) {
    jsonResponse(res, 400, { error: "No supported preference change was provided." });
    return;
  }

  const contact = await getResendContact(contactId, config);
  if (contact.unsubscribed === true && body.fieldNotes) {
    jsonResponse(res, 409, {
      error: "Please use the Field Notes signup form to subscribe again with fresh consent."
    });
    return;
  }

  const topicPreference = await getFieldNotesPreference(contactId, config);
  if (!topicPreference.topicConfigured) {
    jsonResponse(res, 409, { error: "The Field Notes preference is unavailable right now." });
    return;
  }

  if (topicPreference.fieldNotes === body.fieldNotes) {
    jsonResponse(res, 200, {
      ok: true,
      preferences: {
        globallySubscribed: contact.unsubscribed !== true,
        fieldNotes: body.fieldNotes,
        topicConfigured: true
      },
      message: body.fieldNotes
        ? "Field Notes remains selected."
        : "You will no longer receive Field Notes."
    });
    return;
  }

  await updateContactTopic(contactId, config, body.fieldNotes ? "opt_in" : "opt_out");
  if (!body.fieldNotes) {
    const occurredAt = new Date().toISOString();
    await observeNewsletterLifecycle({
      type: "subscription.topic_opted_out",
      occurredAt,
      eventSource: `topic-opt-out:${contactId}:${occurredAt}`
    });
  }
  jsonResponse(res, 200, {
    ok: true,
    preferences: {
      globallySubscribed: contact.unsubscribed !== true,
      fieldNotes: body.fieldNotes,
      topicConfigured: true
    },
    message: body.fieldNotes
      ? "Field Notes remains selected."
      : "You will no longer receive Field Notes."
  });
};

const handleNewsletterRequest = async (req, res) => {
  try {
    const config = newsletterConfig(req);
    const requestUrl = new URL(req.url, `${config.baseUrl}/`);
    const action = requestUrl.searchParams.get("action") || "subscribe";

    if (req.method === "GET" && action === "confirm") {
      await handleConfirmPrompt(req, res);
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      jsonResponse(res, 405, { error: "Method not allowed" });
      return;
    }

    if (action === "confirm") {
      await handleConfirm(req, res);
    } else if (action === "request_preferences") {
      await handleRequestPreferences(req, res);
    } else if (action === "read_preferences") {
      await handleReadPreferences(req, res);
    } else if (action === "update_preferences") {
      await handleUpdatePreferences(req, res);
    } else if (action === "subscribe") {
      await handleSubscribe(req, res);
    } else {
      jsonResponse(res, 404, { error: "Unknown newsletter action" });
    }
  } catch (error) {
    console.error("Newsletter request failed", {
      statusCode: error.statusCode || 500,
      errorType: error.name || "Error"
    });
    jsonResponse(res, error.statusCode || 500, {
      error: error.statusCode === 503
        ? error.message
        : error.statusCode && error.statusCode < 500
          ? error.message
          : "Newsletter service is not available right now."
    });
  }
};

module.exports = {
  createConfirmationToken,
  createPreferencesToken,
  handleNewsletterRequest
};
