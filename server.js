const fs = require("fs");
const http = require("http");
const path = require("path");
const { handleAdminRequest, handleClientRequest } = require("./lib/admin-store");
const { handleContactRequest } = require("./lib/contact");
const { handlePrintsRequest, handleStripeWebhookRequest } = require("./lib/creativehub");
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
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml"
};

const publicFiles = new Set([
  "admin.css", "admin.html", "admin.js", "client-area.html", "client-area.js",
  "index.html", "robots.txt", "script.js", "sitemap.xml", "styles.css", "wallet-card.html"
]);

const isPublicPath = (relativePath) => publicFiles.has(relativePath)
  || relativePath === "data/site.json"
  || relativePath.startsWith("assets/")
  || relativePath.startsWith("apple-wallet/");

const serveStatic = (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  let pathname;

  try {
    pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
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
    res.end(req.method === "HEAD" ? undefined : content);
  });
};

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);

  const pathname = new URL(req.url, `http://localhost:${port}`).pathname;

  if (pathname === "/api/admin") {
    handleAdminRequest(req, res);
    return;
  }

  if (pathname === "/api/contact") {
    handleContactRequest(req, res);
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
