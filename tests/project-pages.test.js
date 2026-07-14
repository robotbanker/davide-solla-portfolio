const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  handleProjectPageRequest,
  listProjectPages,
  projectSlug,
  renderProjectPage,
  verifiedCredits
} = require("../lib/project-pages");
const { generateSitemap } = require("../lib/seo");
const { sanitizePublicSiteData } = require("../lib/admin-store");

const siteData = JSON.parse(fs.readFileSync("data/site.json", "utf8"));

const response = () => ({
  body: undefined,
  headers: {},
  statusCode: 0,
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  end(value) { this.body = value; }
});

test("every already-public album has one unique, server-rendered project URL", () => {
  const projects = listProjectPages(siteData);
  const slugs = projects.map(projectSlug);

  assert.equal(projects.length, siteData.albums.length);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const album of projects) {
    const slug = projectSlug(album);
    const html = renderProjectPage(siteData, slug);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.davidesolla\\.com/work/${slug}">`));
    assert.match(html, /data-analytics="enabled"/);
    assert.match(html, /privacy-consent\.js\?v=1/);
    assert.match(html, /google-tag\.js\?v=3/);
    assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/);
    assert.match(html, /<script type="application\/ld\+json">/);
  }
});

test("project structured data uses visible images and truthful creator metadata", () => {
  const html = renderProjectPage(siteData, "cosmic");
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const structured = JSON.parse(match[1]);
  const gallery = structured["@graph"].find((item) => item["@type"] === "ImageGallery");

  assert.equal(gallery.url, "https://www.davidesolla.com/work/cosmic");
  assert.equal(gallery.creator.name, "Davide Solla");
  assert.equal(gallery.copyrightNotice, "© Davide Solla");
  assert.equal(gallery.image.length, 7);
  assert.ok(gallery.image.every((image) => image.contentUrl.startsWith("https://www.davidesolla.com/assets/images/")));
  assert.ok(gallery.image.every((image) => image.creator.name === "Davide Solla"));
});

test("project pages omit location metadata when the public source has no evidence", () => {
  const html = renderProjectPage(siteData, "inna");
  assert.doesNotMatch(html, /<dt>Location<\/dt>/);
});

test("collaborator credits fail closed until Davide records a completed review", () => {
  const album = {
    ...siteData.albums[0],
    credits: [{ role: "Styling", name: "Verified Stylist" }]
  };
  assert.deepEqual(verifiedCredits(album), [{ role: "Photography", name: "Davide Solla" }]);

  const reviewed = {
    ...album,
    creditReview: {
      status: "verified",
      reviewedBy: "Davide Solla",
      reviewedAt: "2026-07-14T12:00:00.000Z"
    }
  };
  assert.deepEqual(verifiedCredits(reviewed), [
    { role: "Photography", name: "Davide Solla" },
    { role: "Styling", name: "Verified Stylist" }
  ]);
});

test("draft collaborator credits stay out of the public content document", () => {
  const draft = structuredClone(siteData);
  draft.albums[0].credits = [{ role: "Styling", name: "Draft Stylist" }];
  draft.albums[0].creditReview = { status: "pending" };
  draft.clients = [{ email: "private@example.com" }];

  const hidden = sanitizePublicSiteData(draft);
  assert.equal(hidden.albums[0].credits, undefined);
  assert.equal(hidden.albums[0].creditReview, undefined);
  assert.equal(hidden.clients, undefined);

  draft.albums[0].creditReview = {
    status: "verified",
    reviewedBy: "Davide Solla",
    reviewedAt: "2026-07-14T12:00:00.000Z"
  };
  const published = sanitizePublicSiteData(draft);
  assert.deepEqual(published.albums[0].credits, [
    { role: "Styling", name: "Draft Stylist" }
  ]);
  assert.equal(published.albums[0].creditReview.status, "verified");
});

test("verified credits follow the album id rather than its array position", () => {
  const draft = structuredClone(siteData);
  const firstId = draft.albums[0].id;
  draft.albums[0].credits = [{ role: "Styling", name: "Verified Stylist" }];
  draft.albums[0].creditReview = {
    status: "verified",
    reviewedBy: "Davide Solla",
    reviewedAt: "2026-07-14T12:00:00.000Z"
  };
  draft.albums.reverse();

  const published = sanitizePublicSiteData(draft);
  const credited = published.albums.find((album) => album.id === firstId);
  const unrelated = published.albums.find((album) => album.id !== firstId);
  assert.deepEqual(credited.credits, [{ role: "Styling", name: "Verified Stylist" }]);
  assert.equal(unrelated.credits, undefined);
});

test("untrusted project text is escaped in HTML and JSON-LD", () => {
  const hostile = structuredClone(siteData);
  hostile.albums[0] = {
    ...hostile.albums[0],
    title: "Roxana <script>alert(1)</script>",
    description: "A story & <img src=x onerror=alert(1)>"
  };
  const html = renderProjectPage(hostile, "roxana");

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /Roxana &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /\\u003cscript\\u003ealert\(1\)\\u003c\/script\\u003e/);
});

test("the clean work route is indexable while the API alias is not", () => {
  const clean = response();
  handleProjectPageRequest({ method: "GET", url: "/work/cosmic", headers: {} }, clean);
  assert.equal(clean.statusCode, 200);
  assert.equal(clean.headers["x-robots-tag"], undefined);
  assert.match(clean.headers["content-security-policy"], /default-src 'self'/);
  assert.match(clean.headers["cache-control"], /s-maxage=3600/);
  assert.match(clean.body, /Cosmic Girl/);

  const alias = response();
  handleProjectPageRequest({ method: "GET", url: "/api/project?slug=cosmic", headers: {} }, alias);
  assert.equal(alias.statusCode, 200);
  assert.equal(alias.headers["x-robots-tag"], "noindex, nofollow");

  const rewritten = response();
  handleProjectPageRequest({ method: "GET", url: "/api/project?slug=cosmic&public=1", headers: {} }, rewritten);
  assert.equal(rewritten.statusCode, 200);
  assert.equal(rewritten.headers["x-robots-tag"], undefined);
});

test("unknown project slugs return a noindex 404 and HEAD returns no body", () => {
  const missing = response();
  handleProjectPageRequest({ method: "GET", url: "/work/not-a-project", headers: {} }, missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.headers["x-robots-tag"], "noindex, nofollow");
  assert.match(missing.body, /That project is not available/);

  const head = response();
  handleProjectPageRequest({ method: "HEAD", url: "/work/cosmic", headers: {} }, head);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, undefined);
});

test("the image sitemap names every stable project and its owned images", () => {
  const sitemap = generateSitemap(siteData, { lastmod: "2026-07-14T00:00:00.000Z" });
  for (const album of listProjectPages(siteData)) {
    assert.match(sitemap, new RegExp(`<loc>https://www\\.davidesolla\\.com/work/${projectSlug(album)}</loc>`));
  }
  assert.match(sitemap, /<image:loc>https:\/\/www\.davidesolla\.com\/assets\/images\/cosmic-01\.jpg<\/image:loc>/);
  assert.equal((sitemap.match(/<lastmod>2026-07-14<\/lastmod>/g) || []).length, listProjectPages(siteData).length + 2);
});

test("homepage portfolio tiles expose stable links without removing the modal experience", () => {
  const homepage = fs.readFileSync("index.html", "utf8");
  const browserScript = fs.readFileSync("script.js", "utf8");
  for (const match of homepage.matchAll(/data-gallery="([^"]+)"/g)) {
    const album = listProjectPages(siteData).find((candidate) => candidate.id === match[1]);
    if (album) {
      assert.match(homepage, new RegExp(`href="/work/${projectSlug(album)}"[^>]+data-gallery="${album.id}"`));
    }
  }
  assert.match(homepage, /<button class="work-tile" type="button" data-gallery="studio"/);
  assert.match(homepage, /data-gallery-project-page href="\/#work"/);
  assert.match(browserScript, /button\.href = `\/work\/\$\{encodeURIComponent\(item\.projectSlug\)\}`/);
  assert.match(browserScript, /galleryProjectPageLink\.hidden = !slug/);
});

test("the canonical-host redirect preserves every nested path", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const canonicalRedirect = config.redirects.find((redirect) => redirect.has?.some((condition) => (
    condition.type === "host" && condition.value === "davidesolla.com"
  )));

  assert.equal(canonicalRedirect.source, "/:path*");
  assert.equal(canonicalRedirect.destination, "https://www.davidesolla.com/:path*");
  assert.equal(canonicalRedirect.permanent, true);
});
