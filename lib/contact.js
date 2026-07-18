const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { rateLimitRequest } = require("./security");

const maxBodyBytes = 64 * 1024;
const privacyNoticeVersion = "2026-07-18";
const enquiryIdPattern = /^enq_[A-Za-z0-9_-]{16,80}$/;

const jsonResponse = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
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

const cleanText = (value, maxLength) => String(value || "").replaceAll("\0", "").trim().slice(0, maxLength);

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeEnquiryId = (value) => {
  const enquiryId = cleanText(value, 90);
  return enquiryIdPattern.test(enquiryId) ? enquiryId : "";
};

const normalizeSubmittedAt = (value, now = new Date()) => {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.valueOf()) || Math.abs(now.valueOf() - parsed.valueOf()) > 24 * 60 * 60 * 1000) {
    return now.toISOString();
  }
  return parsed.toISOString();
};

const cleanPath = (value) => {
  const raw = cleanText(value, 240).split("?", 1)[0].split("#", 1)[0];
  return raw.startsWith("/") ? raw : "/";
};

const cleanHost = (value) => {
  const host = cleanText(value, 253).toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9.-]+$/.test(host) ? host : "";
};

const cleanConsentState = (value) => ["granted", "denied", "unset"].includes(value)
  ? value
  : "unset";

const normalizeAttribution = (value) => {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    landing_path: cleanPath(raw.landing_path),
    referrer_host: cleanHost(raw.referrer_host),
    utm_source: cleanText(raw.utm_source, 120),
    utm_medium: cleanText(raw.utm_medium, 120),
    utm_campaign: cleanText(raw.utm_campaign, 160),
    utm_content: cleanText(raw.utm_content, 160),
    utm_term: cleanText(raw.utm_term, 160),
    consent_state: cleanConsentState(raw.consent_state)
  };
};

const contactConfig = () => ({
  apiKey: process.env.RESEND_API_KEY || "",
  toEmail: process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER || "",
  fromEmail: process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || "",
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== "false" : true,
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "",
  subjectPrefix: process.env.CONTACT_SUBJECT_PREFIX || "Website enquiry"
});

const radarConfig = () => {
  const configuredTimeout = Number(process.env.RADAR_ENQUIRY_TIMEOUT_MS || 6000);
  return {
    endpoint: String(process.env.RADAR_ENQUIRY_ENDPOINT || "").trim(),
    secret: String(process.env.WEBSITE_ENQUIRY_WEBHOOK_SECRET || "").trim(),
    timeoutMs: Number.isFinite(configuredTimeout)
      ? Math.max(1000, Math.min(15000, configuredTimeout))
      : 6000
  };
};

const attributionText = (attribution) => [
  `Landing path: ${attribution.landing_path}`,
  `Referrer host: ${attribution.referrer_host || "Direct or unavailable"}`,
  `UTM source: ${attribution.utm_source || "Not supplied"}`,
  `UTM medium: ${attribution.utm_medium || "Not supplied"}`,
  `UTM campaign: ${attribution.utm_campaign || "Not supplied"}`,
  `UTM content: ${attribution.utm_content || "Not supplied"}`,
  `UTM term: ${attribution.utm_term || "Not supplied"}`
];

const enquiryText = ({ enquiryId, name, email, project, message, attribution }) => [
  `Enquiry ID: ${enquiryId || "Legacy notification"}`,
  `Name: ${name}`,
  `Email: ${email}`,
  `Project type: ${project || "Not specified"}`,
  ...(enquiryId ? ["", ...attributionText(attribution)] : []),
  "",
  message
].join("\n");

const subjectLine = (config, name) => {
  const subjectName = name || "Website visitor";
  return `${config.subjectPrefix} from ${subjectName}`.replace(/[\r\n]+/g, " ");
};

const ensureConfigured = (config, providerReady) => {
  if (!providerReady || !config.toEmail || !config.fromEmail) {
    const error = new Error("Contact email service is not configured");
    error.statusCode = 503;
    throw error;
  }
};

const sendWithSmtp = async (enquiry, config) => {
  ensureConfigured({ ...config, fromEmail: config.smtpFromEmail }, config.smtpUser && config.smtpPass);

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  const result = await transporter.sendMail({
    from: config.smtpFromEmail,
    to: config.toEmail,
    replyTo: enquiry.email,
    ...(enquiry.enquiryId ? { messageId: `<${enquiry.enquiryId}@davidesolla.com>` } : {}),
    subject: subjectLine(config, enquiry.name),
    text: enquiryText(enquiry)
  });
  return { provider: "smtp", message_id: String(result?.messageId || "") };
};

const sendWithResend = async (enquiry, config) => {
  ensureConfigured(config, config.apiKey);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      ...(enquiry.enquiryId ? { "idempotency-key": `website-enquiry/${enquiry.enquiryId}` } : {})
    },
    body: JSON.stringify({
      from: config.fromEmail,
      to: [config.toEmail],
      reply_to: enquiry.email,
      subject: subjectLine(config, enquiry.name),
      text: enquiryText(enquiry)
    })
  });

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || "Email provider rejected the request");
    error.statusCode = 502;
    throw error;
  }
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch (error) { result = {}; }
  return { provider: "resend", message_id: String(result.id || "") };
};

const sendEnquiry = async (enquiry) => {
  const config = contactConfig();
  if (enquiry.enquiryId) return sendWithResend(enquiry, config);
  return config.smtpUser && config.smtpPass
    ? sendWithSmtp(enquiry, config)
    : sendWithResend(enquiry, config);
};

const buildWebsiteEnquiryEvent = (enquiry) => ({
  schema_version: 1,
  event_type: "website.enquiry.created",
  enquiry_id: enquiry.enquiryId,
  submitted_at: enquiry.submittedAt,
  contact: {
    name: enquiry.name,
    email: enquiry.email,
    company: ""
  },
  project: {
    type: enquiry.project,
    message: enquiry.message,
    location: "",
    timeline: "",
    budget_range: ""
  },
  attribution: enquiry.attribution,
  privacy_notice_version: privacyNoticeVersion
});

const radarRequestConfig = () => {
  const config = radarConfig();
  if (!config.endpoint || !config.secret) {
    const error = new Error("Radar enquiry integration is not configured");
    error.statusCode = 503;
    throw error;
  }
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    const error = new Error("Radar enquiry endpoint must use HTTPS");
    error.statusCode = 503;
    throw error;
  }
  return { config, endpoint };
};

const postSignedRadarEvent = async (event, endpoint, config) => {
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", config.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "idempotency-key": event.attempt_id || event.enquiry_id,
        "x-davide-timestamp": timestamp,
        "x-davide-signature": `sha256=${signature}`
      },
      body,
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "Radar rejected the website enquiry");
      error.statusCode = response.status === 409 ? 409 : 502;
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
};

const syncEnquiryToRadar = async (event) => {
  const { config, endpoint } = radarRequestConfig();
  const result = await postSignedRadarEvent(event, endpoint, config);
  if (
    result.ok !== true
    || result.enquiry_id !== event.enquiry_id
    || typeof result.receipt_created !== "boolean"
    || typeof result.enquiry_created !== "boolean"
    || !["pending", "accepted", "failed"].includes(result.notification_status)
    || !Number.isFinite(result.notification_attempts)
  ) {
    const error = new Error("Radar returned an invalid enquiry receipt");
    error.statusCode = 502;
    throw error;
  }
  return { configured: true, ...result };
};

const syncEnquiryNotificationToRadar = async ({
  enquiryId,
  attemptId,
  status,
  provider = "",
  messageId = "",
  errorCode = "",
  attemptedAt = new Date().toISOString()
}) => {
  const { config, endpoint } = radarRequestConfig();
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/notification`;
  const event = {
    schema_version: 1,
    event_type: "website.enquiry.notification",
    enquiry_id: enquiryId,
    attempt_id: attemptId,
    status,
    provider,
    message_id: messageId,
    error_code: errorCode,
    attempted_at: attemptedAt
  };
  const result = await postSignedRadarEvent(event, endpoint, config);
  if (
    result.ok !== true
    || result.enquiry_id !== enquiryId
    || result.notification_status !== status
    || !Number.isFinite(result.notification_attempts)
  ) {
    const error = new Error("Radar returned an invalid notification receipt");
    error.statusCode = 502;
    throw error;
  }
  return result;
};

const createContactHandler = ({
  send = sendEnquiry,
  sync = syncEnquiryToRadar,
  notify = syncEnquiryNotificationToRadar,
  rateLimit = rateLimitRequest,
  now = () => new Date()
} = {}) => async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readRequestJson(req);
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 160).toLowerCase();
    const project = cleanText(body.project, 120);
    const message = cleanText(body.message, 5000);
    const website = cleanText(body.website, 200);
    const suppliedId = cleanText(body.enquiry_id, 90);
    const enquiryId = normalizeEnquiryId(suppliedId);

    if (website) {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    const attempt = rateLimit(req, "contact", { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!attempt.allowed) {
      res.setHeader("retry-after", String(attempt.retryAfter));
      jsonResponse(res, 429, { error: "Please wait before sending another message." });
      return;
    }
    if (!name || !isValidEmail(email) || !message) {
      jsonResponse(res, 400, { error: "Please provide your name, email, and message." });
      return;
    }
    if (suppliedId && !enquiryId) {
      jsonResponse(res, 400, { error: "Please reload the page and try again." });
      return;
    }

    const enquiry = {
      enquiryId,
      submittedAt: normalizeSubmittedAt(body.submitted_at, now()),
      name,
      email,
      project,
      message,
      attribution: normalizeAttribution(body.attribution)
    };
    if (enquiryId) {
      const radar = await sync(buildWebsiteEnquiryEvent(enquiry));
      if (radar.notification_status !== "accepted") {
        const notificationAttemptId = `nat_${crypto.randomBytes(16).toString("hex")}`;
        let delivery;
        try {
          delivery = await send(enquiry);
        } catch (error) {
          try {
            await notify({
              enquiryId,
              attemptId: notificationAttemptId,
              status: "failed",
              errorCode: error.name || "delivery_error",
              attemptedAt: now().toISOString()
            });
          } catch (notificationError) {
            console.error("Enquiry notification failure could not be recorded", {
              statusCode: notificationError.statusCode || 500,
              errorType: notificationError.name || "Error"
            });
          }
          throw error;
        }
        try {
          await notify({
            enquiryId,
            attemptId: notificationAttemptId,
            status: "accepted",
            provider: delivery?.provider || "",
            messageId: delivery?.message_id || "",
            attemptedAt: now().toISOString()
          });
        } catch (notificationError) {
          console.error("Accepted enquiry notification state could not be recorded", {
            statusCode: notificationError.statusCode || 500,
            errorType: notificationError.name || "Error"
          });
          const persistenceError = new Error("Radar could not record accepted enquiry notification state");
          persistenceError.statusCode = 502;
          throw persistenceError;
        }
      }
    } else {
      await send(enquiry);
    }
    jsonResponse(res, 200, { ok: true, ...(enquiryId ? { enquiry_id: enquiryId } : {}) });
  } catch (error) {
    console.error("Contact form failed", {
      statusCode: error.statusCode || 500,
      errorType: error.name || "Error"
    });
    jsonResponse(res, error.statusCode || 500, {
      error: "Sorry, the message could not be sent right now."
    });
  }
};

const handleContactRequest = createContactHandler();

module.exports = {
  buildWebsiteEnquiryEvent,
  createContactHandler,
  handleContactRequest,
  normalizeAttribution,
  normalizeEnquiryId,
  sendEnquiry,
  syncEnquiryNotificationToRadar,
  syncEnquiryToRadar
};
