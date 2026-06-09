const nodemailer = require("nodemailer");

const maxBodyBytes = 64 * 1024;

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

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

const enquiryText = ({ name, email, project, message }) => [
  `Name: ${name}`,
  `Email: ${email}`,
  `Project type: ${project || "Not specified"}`,
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

const sendWithSmtp = async ({ name, email, project, message }, config) => {
  ensureConfigured({
    ...config,
    fromEmail: config.smtpFromEmail
  }, config.smtpUser && config.smtpPass);

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
    from: config.smtpFromEmail,
    to: config.toEmail,
    replyTo: email,
    subject: subjectLine(config, name),
    text: enquiryText({ name, email, project, message })
  });
};

const sendWithResend = async ({ name, email, project, message }, config) => {
  ensureConfigured(config, config.apiKey);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.fromEmail,
      to: [config.toEmail],
      reply_to: email,
      subject: subjectLine(config, name),
      text: enquiryText({ name, email, project, message })
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(body || "Email provider rejected the request");
    error.statusCode = 502;
    throw error;
  }
};

const sendEnquiry = async (enquiry) => {
  const config = contactConfig();

  if (config.smtpUser && config.smtpPass) {
    await sendWithSmtp(enquiry, config);
    return;
  }

  await sendWithResend(enquiry, config);
};

const handleContactRequest = async (req, res) => {
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

    if (website) {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (!name || !isValidEmail(email) || !message) {
      jsonResponse(res, 400, { error: "Please provide your name, email, and message." });
      return;
    }

    await sendEnquiry({ name, email, project, message });
    jsonResponse(res, 200, { ok: true });
  } catch (error) {
    console.error("Contact form failed:", error.message);
    jsonResponse(res, error.statusCode || 500, {
      error: "Sorry, the message could not be sent right now."
    });
  }
};

module.exports = {
  handleContactRequest
};
