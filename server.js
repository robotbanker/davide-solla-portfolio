const fs = require("fs");
const http = require("http");
const path = require("path");
const { handleAdminRequest, handleClientRequest } = require("./lib/admin-store");
const { handleContactRequest } = require("./lib/contact");
const { handlePrintsRequest, handleStripeWebhookRequest } = require("./lib/creativehub");
const { handleNewsletterRequest } = require("./lib/newsletter");
const { handleFieldNotesPageRequest } = require("./lib/field-notes-pages");
const { handleProjectPageRequest } = require("./lib/project-pages");
const { setSecurityHeaders } = require("./lib/security");

const rootDir = __dirname;
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml"
};

const publicFiles = new Set([
  "404.html", "admin.css", "admin.html", "admin.js", "newsletter-admin.js", "client-area.html", "client-area.js",
  "field-notes.css", "field-notes.html", "field-notes.js", "google-tag.js",
  "index.html", "newsletter-preview.css", "newsletter-preview.html", "newsletter-preview.js",
  "newsletter-signup.js", "preferences.html", "preferences.js",
  "privacy-consent.js", "privacy.html", "project-page.css",
  "robots.txt", "script.js", "sitemap.xml", "site.webmanifest", "styles.css", "wallet-card.html"
]);

const isCacheableStaticPath = (relativePath) => /\.(?:avif|css|gif|jpe?g|js|png|svg|webmanifest|webp)$/i.test(relativePath)
  || relativePath.startsWith("newsletter/dist/")
  || relativePath.startsWith("apple-wallet/");

const isPublicPath = (relativePath) => publicFiles.has(relativePath)
  || relativePath === "data/site.json"
  || relativePath.startsWith("newsletter/dist/")
  || relativePath.startsWith("assets/")
  || relativePath.startsWith("apple-wallet/");

const serveStatic = (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  let pathname;

  try {
    const requestedPath = requestUrl.pathname === "/preferences"
      ? "/preferences.html"
      : requestUrl.pathname === "/privacy"
        ? "/privacy.html"
        : requestUrl.pathname;
    pathname = decodeURIComponent(requestedPath === "/" ? "/index.html" : requestedPath);
  } catch (error) {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }

  const relativePath = pathname.replace(/^\/+/, "");

  if (!isPublicPath(relativePath) || !["GET", "HEAD"].includes(req.method)) {
    res.setHeader("allow", "GET, HEAD");
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const filePath = path.resolve(rootDir, relativePath);

  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    if (relativePath === "preferences.html") {
      res.setHeader("cache-control", "no-store");
      res.setHeader("referrer-policy", "no-referrer");
      res.setHeader("x-robots-tag", "noindex, nofollow");
    } else if (isCacheableStaticPath(relativePath)) {
      res.setHeader("cache-control", "public, max-age=31536000, stale-while-revalidate=86400");
    }
    res.end(req.method === "HEAD" ? undefined : content);
  });
};

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);

  const pathname = new URL(req.url, `http://localhost:${port}`).pathname;

  if (pathname === "/field-notes"
    || pathname === "/field-notes/"
    || pathname === "/field-notes.html"
    || pathname === "/api/field-notes"
    || /^\/field-notes\/[^/]+\/?$/.test(pathname)) {
    handleFieldNotesPageRequest(req, res);
    return;
  }

  if (pathname.startsWith("/work/") || pathname === "/api/project") {
    handleProjectPageRequest(req, res);
    return;
  }

  if (pathname === "/api/admin") {
    handleAdminRequest(req, res);
    return;
  }

  if (pathname === "/api/contact") {
    handleContactRequest(req, res);
    return;
  }

  if (pathname === "/api/newsletter") {
    handleNewsletterRequest(req, res);
    return;
  }

  if (pathname === "/api/prints") {
    handlePrintsRequest(req, res);
    return;
  }

  if (pathname === "/api/stripe-webhook") {
    handleStripeWebhookRequest(req, res);
    return;
  }

  if (pathname === "/api/client") {
    handleClientRequest(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Davide Solla portfolio running at http://localhost:${port}`);
  console.log(`Admin portal available at http://localhost:${port}/admin.html`);
});
