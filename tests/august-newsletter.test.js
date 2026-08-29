const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  extractRenderedImageSlots,
  renderEmail,
  sectionOrderForIssue,
  validateIssue
} = require("../newsletter/lib/render-email");
const {
  handleFieldNotesPageRequest,
  renderFieldNotesIssue,
  socialImageForIssue
} = require("../lib/field-notes-pages");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const issue = readJson("newsletter/data/issues/2026-08.json");
const manifest = readJson("newsletter/data/sources/2026-08.manifest.json");
const index = readJson("newsletter/data/issues/index.json");
const indexEntry = index.issues.find((entry) => entry.issueId === issue.issueId);

const response = () => ({
  body: undefined,
  headers: {},
  statusCode: 0,
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
  end(value) { this.body = value; }
});

test("August passes live validation with a seven-image field-first sequence", () => {
  const validation = validateIssue(issue, manifest, { mode: "live-send" });
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.images.ready, true);
  assert.equal(validation.images.slotCount, 7);
  assert.deepEqual(sectionOrderForIssue(issue), ["onTheField", "art", "fashion"]);
  assert.deepEqual(
    extractRenderedImageSlots(issue).map((entry) => entry.slot),
    [
      "onTheField.gallery.0",
      "onTheField.gallery.1",
      "onTheField.gallery.2",
      "art.featured",
      "fashion.stories.0",
      "fashion.stories.1",
      "fashion.stories.2"
    ]
  );
});

test("August email leads with the Kyazi editorial while legacy issues keep their order", () => {
  const augustHtml = renderEmail(issue);
  assert.ok(augustHtml.indexOf("01 — On the Field") < augustHtml.indexOf("02 — Art"));
  assert.ok(augustHtml.indexOf("02 — Art") < augustHtml.indexOf("03 — Fashion"));
  assert.equal((augustHtml.match(/assets\/images\/newsletter\/2026-08\/kyazi-/g) || []).length, 3);

  for (const issueId of ["2026-06", "2026-07"]) {
    const legacyIssue = readJson(`newsletter/data/issues/${issueId}.json`);
    const legacyHtml = renderEmail(legacyIssue);
    assert.deepEqual(sectionOrderForIssue(legacyIssue), ["art", "fashion", "onTheField"]);
    assert.ok(legacyHtml.indexOf(legacyIssue.sections.art.label) < legacyHtml.indexOf(legacyIssue.sections.fashion.label));
    assert.ok(legacyHtml.indexOf(legacyIssue.sections.fashion.label) < legacyHtml.indexOf(legacyIssue.sections.onTheField.label));
  }
});

test("August public Field Notes renders all portraits first and uses Kyazi socially", () => {
  const html = renderFieldNotesIssue(issue, manifest, {
    entries: index.issues,
    indexEntry
  });
  const firstPortrait = html.indexOf("kyazi-lead-portrait.jpg");
  const secondPortrait = html.indexOf("kyazi-with-guitar.jpg");
  const thirdPortrait = html.indexOf("kyazi-guitar-detail.jpg");
  const art = html.indexOf("02 — Art");
  const fashion = html.indexOf("03 — Fashion");

  assert.match(html, /Kyazi: Presence, Practice/);
  assert.ok(firstPortrait > 0);
  assert.ok(firstPortrait < secondPortrait && secondPortrait < thirdPortrait);
  assert.ok(thirdPortrait < art && art < fashion);
  assert.match(html, /kyazi-lead-portrait\.jpg[^>]+loading="eager"[^>]+fetchpriority="high"/);
  assert.equal(
    socialImageForIssue(issue).url,
    "https://www.davidesolla.com/assets/images/newsletter/2026-08/kyazi-lead-portrait.jpg"
  );
});

test("August gallery validation and public escaping fail closed", () => {
  for (const key of ["src", "alt", "credit"]) {
    const malformed = structuredClone(issue);
    delete malformed.sections.onTheField.gallery[1][key];
    const validation = validateIssue(malformed, manifest, { mode: "live-send" });
    assert.ok(validation.errors.some((error) => error.includes(`onTheField.gallery.1.${key}`)));
  }

  const hostile = structuredClone(issue);
  hostile.sections.onTheField.title = "Kyazi <script>alert(1)</script>";
  hostile.sections.onTheField.paragraphs[0] = "Portrait <img src=x onerror=alert(2)>";
  const html = renderFieldNotesIssue(hostile, manifest, { entries: index.issues, indexEntry });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /Kyazi &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("the Field Notes root now redirects to the published August issue", () => {
  const result = response();
  handleFieldNotesPageRequest({ method: "GET", url: "/field-notes", headers: {} }, result);
  assert.equal(result.statusCode, 307);
  assert.equal(result.headers.location, "/field-notes/2026-08");
});
