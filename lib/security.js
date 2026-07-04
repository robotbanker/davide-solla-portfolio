const crypto = require("crypto");

const attempts = new Map();
const maxTrackedKeys = 10_000;
const contentSecurityPolicy = "default-src 'self'; base-uri 'none'; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data: blob: https:; object-src 'none'; script-src 'self' https://www.googletagmanager.com 'sha256-R1uaZHWYzppApCvDocdOpS69oTgzRBLYecQ/n6RfIGk=' 'sha256-te71Eqs5ujX5KZiCh/Opd6GJTyfvc2AIT6hSli2ZudQ='; style-src 'self'; style-src-attr 'unsafe-inline'";

const clientAddress = (req) => {
  const direct = req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return String(direct || forwarded || "unknown").slice(0, 100);
};

const pruneAttempts = (now = Date.now()) => {
  for (const [key, record] of attempts) {
    if (record.resetAt <= now) {
      attempts.delete(key);
    }
  }

  while (attempts.size > maxTrackedKeys) {
    attempts.delete(attempts.keys().next().value);
  }
};

const rateLimit = (key, { limit, windowMs }) => {
  const now = Date.now();
  pruneAttempts(now);
  const current = attempts.get(key);
  const record = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  record.count += 1;
  attempts.set(key, record);

  return {
    allowed: record.count <= limit,
    retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000))
  };
};

const rateLimitRequest = (req, scope, options) => rateLimit(`${scope}:${clientAddress(req)}`, options);

const clearRateLimit = (req, scope) => {
  attempts.delete(`${scope}:${clientAddress(req)}`);
};

const timingSafeStringEqual = (left, right) => {
  const leftDigest = crypto.createHash("sha256").update(String(left || "")).digest();
  const rightDigest = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

const setSecurityHeaders = (res) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("content-security-policy", contentSecurityPolicy);
};

module.exports = {
  clearRateLimit,
  clientAddress,
  rateLimitRequest,
  setSecurityHeaders,
  timingSafeStringEqual
};
