const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  handleFieldNotesPageRequest,
  isFieldNotesIssueId,
  listPublishedIssueEntries,
  metadataForIssue,
  renderFieldNotesIssue,
  socialImageForIssue
} = require("../lib/field-notes-pages");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const index = readJson("newsletter/data/issues/index.json");
const issue = readJson("newsletter/data/issues/2026-07.json");
const manifest = readJson("newsletter/data/sources/2026-07.manifest.json");
const entries = listPublishedIssueEntries(index);
const indexEntry = entries.find((entry) => entry.issueId === issue.issueId);

const response = () => ({
  body: undefined,
  headers: {},
  statusCode: 0,
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
  end(value) { this.body = value; }
});

const request = (url, method = "GET") => ({ method, url, headers: {} });

test("Field Notes IDs accept real calendar months only", () => {
  for (const valid of ["2026-01", "2026-07", "0000-12", "9999-11"]) {
    assert.equal(isFieldNotesIssueId(valid), true);
  }
  for (const invalid of ["2026-00", "2026-13", "26-07", "2026-7", "2026-07/extra", "../2026-07"]) {
    assert.equal(isFieldNotesIssueId(invalid), false);
  }
});

test("the public index is sorted, status-gated, and fails closed on duplicate IDs", () => {
  const publicFields = {
    status: "research-approved",
    publicationStatus: "published",
    publishedAt: "2026-06-28T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z"
  };
  const result = listPublishedIssueEntries({
    issues: [
      { issueId: "2026-06", ...publicFields },
      { issueId: "2026-08", ...publicFields, status: "draft" },
      { issueId: "2026-07", ...publicFields },
      { issueId: "2026-07", ...publicFields },
      { issueId: "2026-05", ...publicFields, updatedAt: "not-a-date" },
      { issueId: "2026-99", ...publicFields }
    ]
  });
  assert.deepEqual(result.map((entry) => entry.issueId), ["2026-06"]);
});

test("an issue is fully rendered in the initial HTML with unique Article metadata", () => {
  const html = renderFieldNotesIssue(issue, manifest, { entries, indexEntry });
  const metadata = metadataForIssue(issue, indexEntry, manifest);

  assert.match(html, /Schiaparelli: Fashion Becomes Art/);
  assert.match(html, /A July edit moving between garment and image/);
  assert.doesNotMatch(html, /Loading Field Notes/);
  assert.match(html, /data-field-notes-prerendered/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.davidesolla\.com\/field-notes\/2026-07">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.davidesolla\.com\/field-notes\/2026-07">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, new RegExp(`<meta property="article:published_time" content="${escapeRegex(metadata.publishedAt)}">`));
  assert.match(html, new RegExp(`<meta property="article:modified_time" content="${escapeRegex(metadata.updatedAt)}">`));

  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const graph = JSON.parse(match[1])["@graph"];
  const article = graph.find((node) => node["@type"] === "Article");
  assert.equal(article.url, "https://www.davidesolla.com/field-notes/2026-07");
  assert.equal(article.datePublished, metadata.publishedAt);
  assert.equal(article.dateModified, metadata.updatedAt);
  assert.equal(article.author["@id"], "https://www.davidesolla.com/#person");
  assert.equal(article.publisher["@id"], "https://www.davidesolla.com/#organization");

  assert.match(html, /href="\/field-notes\/2026-07" aria-current="page"/);
  assert.match(html, /href="\/field-notes\/2026-06"/);
  assert.doesNotMatch(html, /<h3>Studio note<\/h3>/);
  assert.doesNotMatch(html, /<p>\s*<\/p>/);
});

test("a non-empty studio note is rendered without publishing an empty editorial block", () => {
  const withNote = structuredClone(issue);
  withNote.sections.onTheField.note = "A concise studio note approved for the public issue.";
  const html = renderFieldNotesIssue(withNote, manifest, { entries, indexEntry });
  assert.match(html, /<h3>Studio note<\/h3>/);
  assert.match(html, /A concise studio note approved for the public issue/);
  assert.doesNotMatch(html, /<p>\s*<\/p>/);
});

test("published issues render reviewed images without per-image approval records", () => {
  const html = renderFieldNotesIssue(issue, manifest, { entries, indexEntry });
  assert.match(html, /assets-cdn\.vam\.ac\.uk/);
  assert.match(html, /Solar_PRESS-SITE_TEASER-IMAGE/);
  assert.equal(socialImageForIssue(issue, manifest).url, issue.sections.art.featured.image.src);
  assert.match(html, /<meta property="og:image" content="https:\/\/assets-cdn\.vam\.ac\.uk/);
});

test("image display follows the saved issue after Davide's issue-level review", () => {
  const changedCreditIssue = structuredClone(issue);
  changedCreditIssue.sections.art.featured.image.credit = "Changed after approval";
  const changedHtml = renderFieldNotesIssue(changedCreditIssue, manifest, { entries, indexEntry });
  assert.match(changedHtml, /assets-cdn\.vam\.ac\.uk/);
  assert.match(changedHtml, /Changed after approval/);

  const legacyRejected = structuredClone(manifest);
  legacyRejected.imageRights.forEach((record) => { record.decision = "rejected"; });
  const legacyHtml = renderFieldNotesIssue(issue, legacyRejected, { entries, indexEntry });
  assert.match(legacyHtml, /assets-cdn\.vam\.ac\.uk/);
});

test("untrusted issue text and links cannot break out of HTML or JSON-LD", () => {
  const hostile = structuredClone(issue);
  hostile.title = "Davide Studios: </script><script>alert(1)</script>";
  hostile.preheader = "A note </script><img src=x onerror=alert(1)>";
  hostile.openingNote = "Opening <svg onload=alert(1)> & text";
  hostile.sections.art.featured.title = "Feature <script>alert(2)</script>";
  hostile.sections.art.featured.sourceUrl = "javascript:alert(3)";
  hostile.sections.art.featured.bookingUrl = "javascript:alert(4)";
  const html = renderFieldNotesIssue(hostile, manifest, { entries, indexEntry });

  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /<svg onload/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.match(html, /&lt;svg onload=alert\(1\)&gt; &amp; text/);
  assert.match(html, /\\u003c\/script\\u003e/);
});

test("the clean issue route is crawlable, while the direct API alias is noindex", () => {
  const clean = response();
  handleFieldNotesPageRequest(request("/field-notes/2026-07"), clean);
  assert.equal(clean.statusCode, 200);
  assert.equal(clean.headers["x-robots-tag"], undefined);
  assert.match(clean.headers["content-security-policy"], /default-src 'self'/);
  assert.match(clean.body, /Schiaparelli: Fashion Becomes Art/);

  const alias = response();
  handleFieldNotesPageRequest(request("/api/field-notes?issueId=2026-07"), alias);
  assert.equal(alias.statusCode, 200);
  assert.equal(alias.headers["x-robots-tag"], "noindex, nofollow");

  const head = response();
  handleFieldNotesPageRequest(request("/field-notes/2026-07", "HEAD"), head);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, undefined);
});

test("moving and legacy aliases redirect with the correct permanence", () => {
  const latest = response();
  handleFieldNotesPageRequest(request("/field-notes"), latest);
  assert.equal(latest.statusCode, 307);
  assert.equal(latest.headers.location, `/field-notes/${entries[0].issueId}`);

  const legacy = response();
  handleFieldNotesPageRequest(request("/field-notes.html?issue=2026-06"), legacy);
  assert.equal(legacy.statusCode, 308);
  assert.equal(legacy.headers.location, "/field-notes/2026-06");

  const trailing = response();
  handleFieldNotesPageRequest(request("/field-notes/2026-07/"), trailing);
  assert.equal(trailing.statusCode, 308);
  assert.equal(trailing.headers.location, "/field-notes/2026-07");

  const rootTrailing = response();
  handleFieldNotesPageRequest(request("/field-notes/"), rootTrailing);
  assert.equal(rootTrailing.statusCode, 308);
  assert.equal(rootTrailing.headers.location, "/field-notes");
});

test("unknown issues fail with a noindex 404 and unsupported methods fail closed", () => {
  for (const url of [
    "/field-notes/2026-12",
    "/field-notes/2026-13",
    "/field-notes?issue=2026-12"
  ]) {
    const missing = response();
    handleFieldNotesPageRequest(request(url), missing);
    assert.equal(missing.statusCode, 404, url);
    assert.equal(missing.headers["x-robots-tag"], "noindex, nofollow", url);
    assert.match(missing.body, /That issue is not available/);
  }

  const method = response();
  handleFieldNotesPageRequest(request("/field-notes/2026-07", "POST"), method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, "GET, HEAD");
  assert.equal(method.headers["x-robots-tag"], "noindex, nofollow");
});

test("the Vercel API entry delegates to the shared handler", () => {
  assert.equal(require("../api/field-notes"), handleFieldNotesPageRequest);
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
