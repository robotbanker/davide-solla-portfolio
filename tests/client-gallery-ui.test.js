const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const clientHtml = fs.readFileSync("client-area.html", "utf8");
const clientScript = fs.readFileSync("client-area.js", "utf8");
const adminHtml = fs.readFileSync("admin.html", "utf8");
const adminScript = fs.readFileSync("admin.js", "utf8");
const clientStyles = fs.readFileSync("styles.css", "utf8");
const privacyHtml = fs.readFileSync("privacy.html", "utf8");

test("the client gallery exposes an accessible per-image review lightbox", () => {
  assert.match(clientHtml, /data-client-lightbox[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(clientHtml, /data-client-lightbox-prev/);
  assert.match(clientHtml, /data-client-lightbox-next/);
  assert.equal((clientHtml.match(/data-client-rating="[1-5]"/g) || []).length, 5);
  assert.match(clientHtml, /data-client-feedback-comment/);
  assert.match(clientHtml, /maxlength="1500"/);
  assert.match(clientHtml, /styles\.css\?v=20260905/);
  assert.match(clientHtml, /client-area\.js\?v=5/);
  assert.match(clientStyles, /\.client-lightbox\s*\{/);
  assert.match(clientStyles, /body\.client-lightbox-open/);
});

test("client interactions use the signed session and keep downloads permission-gated", () => {
  assert.match(clientScript, /!session\.client \|\| !session\.token/);
  assert.match(clientScript, /fetch\("\/api\/client\?action=session"/);
  assert.match(clientScript, /authorization: `Bearer \$\{activeSessionToken\}`/);
  assert.match(clientScript, /lightroomAssetId: submittedAssetId/);
  assert.match(clientScript, /client\.downloadEnabled === true/);
  assert.match(clientScript, /downloadLink\.hidden = !canDownload/);
  assert.match(clientScript, /event\.key === "ArrowLeft"/);
  assert.match(clientScript, /event\.key === "ArrowRight"/);
  assert.match(clientScript, /trapFocus\(event, lightbox\)/);
  assert.match(clientScript, /setLightboxBackgroundInert\(true\)/);
  assert.match(clientScript, /document\.addEventListener\("contextmenu"/);
  assert.match(clientScript, /document\.addEventListener\("dragstart"/);
  assert.match(clientScript, /const feedbackDrafts = new Map\(\)/);
  assert.match(clientScript, /feedbackStatus\.textContent = "Unsaved changes\."/);
  assert.match(clientStyles, /-webkit-touch-callout:\s*none/);
});

test("the admin provides per-client download control and a feedback review surface", () => {
  assert.match(adminHtml, /data-admin-tab="feedback"/);
  assert.match(adminHtml, /data-client-feedback-editor/);
  assert.match(adminHtml, /admin\.css\?v=20260905/);
  assert.match(adminHtml, /admin\.js\?v=12/);
  assert.match(adminScript, /data-client-download-enabled/);
  assert.match(adminScript, /client\.downloadEnabled = clientDownloadEnabled\.checked/);
  assert.match(adminScript, /const renderFeedback = \(\) =>/);
  assert.match(adminScript, /client\.feedback/);
  assert.match(adminScript, /clients: \(site\.clients \|\| \[\]\)\.map\(\(\{ feedback, \.\.\.client \}\) => client\)/);
});

test("the admin keeps Lightroom previews visible while permanent images deploy", () => {
  assert.match(adminScript, /const previewSrc = item\.previewSrc \|\| item\.src/);
  assert.match(adminScript, /const previewSources = new Map\(\)/);
  assert.match(adminScript, /previewSources\.has\(item\.src\)/);
  assert.match(adminScript, /Lightroom previews stay visible while permanent copies publish/);
});

test("the encrypted feedback store is denied by the production static router", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const privateRoute = config.routes.find((route) => (
    route.status === 404 && route.src.includes("admin-site")
  ));

  assert.ok(privateRoute, "private data deny route must exist");
  assert.equal(new RegExp(privateRoute.src).test("/data/client-feedback.enc"), true);
});

test("the privacy notice discloses private gallery ratings and comments", () => {
  assert.match(privacyHtml, /image star ratings and comments/);
  assert.match(privacyHtml, /Gallery access, ratings and comments are removed when no longer needed/);
});
