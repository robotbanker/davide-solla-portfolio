const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { rateLimitRequest, timingSafeStringEqual } = require("./security");

const maxBodyBytes = 16 * 1024;
const tokenTtlMs = 7 * 24 * 60 * 60 * 1000;
const resendBaseUrl = "https://api.resend.com";
const consentText = "I agree to receive Field Notes emails from Davide Solla Photography. I can unsubscribe at any time.";

const jsonResponse = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};

const htmlResponse = (res, statusCode, { title, heading, message }) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/png" href="/assets/images/favicon.png">
    <link rel="stylesheet" href="/styles.css?v=26">
  </head>
  <body>
    <main class="newsletter-confirmation">
      <section>
        <p class="section-kicker">Field Notes</p>
        <h1>${escapeHtml(heading)}</h1>
        <p>${escapeHtml(message)}</p>
        <a class="text-link text-link-light" href="/field-notes.html">Read the latest issue</a>
      </section>
    </main>
  </body>
</html>`);
};

const readRequestJson = (req) => new Promise((resolve, reject) => {
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
      resolve(body ? JSON.parse(body) : {});
    } catch (error) {
      reject(new Error("Invalid JSON body"));
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

const envBoolean = (value, fallback) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
};

const newsletterConfig = (req) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:4173");
  const protocol = String(req.headers["x-forwarded-proto"] || "http").split(",")[0] || "http";
  const baseUrl = String(process.env.PUBLIC_SITE_URL || `${protocol}://${host}`).replace(/\/+$/, "");

  return {
    baseUrl,
    brandName: process.env.NEWSLETTER_BRAND_NAME || "Davide Studios",
    listName: process.env.NEWSLETTER_LIST_NAME || "Field Notes",
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendSegmentId: process.env.NEWSLETTER_RESEND_SEGMENT_ID || "",
    resendTopicId: process.env.NEWSLETTER_RESEND_TOPIC_ID || "",
    doubleOptIn: envBoolean(process.env.NEWSLETTER_DOUBLE_OPT_IN ?? process.env.NEWSLETTER_REQUIRE_CONFIRMATION, true),
    tokenSecret: process.env.NEWSLETTER_TOKEN_SECRET || process.env.ADMIN_SESSION_SECRET || "",
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

  if (config.doubleOptIn && !config.tokenSecret) {
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

const resendRequest = async (path, { method = "POST", body } = {}, config) => {
  const response = await fetch(`${resendBaseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      "content-type": "application/json",
      "user-agent": "davide-solla-portfolio/1.0"
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

const contactProperties = ({ firstName, source, consentAt, confirmedAt, consentMethod }) => {
  const properties = {
    source: cleanText(source || "website", 120),
    consent_at: consentAt,
    consent_method: consentMethod,
    consent_text: consentText,
    confirmed_at: confirmedAt,
    website: "davidesolla.com"
  };

  if (firstName) {
    properties.first_name = firstName;
  }

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)])
  );
};

const contactPayload = (subscriber, config) => {
  const payload = {
    email: subscriber.email,
    unsubscribed: false,
    properties: contactProperties(subscriber)
  };

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

const upsertResendContact = async (subscriber, config) => {
  const payload = contactPayload(subscriber, config);

  try {
    return await resendRequest("/contacts", { method: "POST", body: payload }, config);
  } catch (error) {
    if (!isDuplicateContactError(error)) {
      throw error;
    }

    return resendRequest(`/contacts/${encodeURIComponent(subscriber.email)}`, {
      method: "PATCH",
      body: {
        unsubscribed: false,
        properties: payload.properties
      }
    }, config);
  }
};

const tokenSignature = (payload, secret) => crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("base64url");

const createConfirmationToken = (subscriber, config) => {
  const payload = Buffer.from(JSON.stringify({
    email: subscriber.email,
    firstName: subscriber.firstName,
    source: subscriber.source,
    consentAt: subscriber.consentAt,
    expiresAt: Date.now() + tokenTtlMs,
    nonce: crypto.randomBytes(16).toString("base64url")
  })).toString("base64url");

  return `${payload}.${tokenSignature(payload, config.tokenSecret)}`;
};

const verifyConfirmationToken = (token, config) => {
  const [payload, signature] = String(token || "").split(".");

  if (!payload || !signature || payload.length > 4096) {
    const error = new Error("This confirmation link is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const expected = tokenSignature(payload, config.tokenSecret);

  if (!timingSafeStringEqual(signature, expected)) {
    const error = new Error("This confirmation link is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const subscriber = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

  if (!subscriber.email || subscriber.expiresAt < Date.now()) {
    const error = new Error("This confirmation link has expired.");
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
      html: confirmationHtml(url, config)
    }
  }, config);
};

const isConsentGranted = (value) => value === true || value === "true" || value === "yes" || value === "on";

const handleSubscribe = async (req, res) => {
  const config = newsletterConfig(req);
  const body = await readRequestJson(req);
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

  jsonResponse(res, 200, {
    ok: true,
    requiresConfirmation: false,
    message: "You're on the Field Notes list. Welcome."
  });
};

const handleConfirm = async (req, res) => {
  const config = newsletterConfig(req);

  try {
    ensureConfigured(config);

    if (!config.tokenSecret) {
      const error = new Error("Newsletter confirmation is not configured yet.");
      error.statusCode = 503;
      throw error;
    }

    const requestUrl = new URL(req.url, `${config.baseUrl}/`);
    const subscriber = verifyConfirmationToken(requestUrl.searchParams.get("token"), config);

    if (!isValidEmail(subscriber.email)) {
      throw new Error("This confirmation link is invalid.");
    }

    await upsertResendContact(subscriber, config);
    htmlResponse(res, 200, {
      title: "Field Notes confirmed",
      heading: "You're subscribed.",
      message: "Thank you for confirming. The next Field Notes email will arrive with the monthly studio edit."
    });
  } catch (error) {
    htmlResponse(res, error.statusCode || 500, {
      title: "Field Notes confirmation",
      heading: "Confirmation could not be completed.",
      message: error.statusCode === 400
        ? error.message
        : "Please try the signup form again, or contact the studio if the problem continues."
    });
  }
};

const handleNewsletterRequest = async (req, res) => {
  try {
    if (req.method === "GET") {
      const config = newsletterConfig(req);
      const requestUrl = new URL(req.url, `${config.baseUrl}/`);

      if (requestUrl.searchParams.get("action") === "confirm") {
        await handleConfirm(req, res);
        return;
      }
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      jsonResponse(res, 405, { error: "Method not allowed" });
      return;
    }

    await handleSubscribe(req, res);
  } catch (error) {
    console.error("Newsletter signup failed:", error.message);
    jsonResponse(res, error.statusCode || 500, {
      error: error.statusCode === 503
        ? error.message
        : "Newsletter signup is not available right now."
    });
  }
};

module.exports = {
  handleNewsletterRequest
};
