const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { generateSitemap } = require("../lib/seo");
const { renderHomepage, handleHomepageRequest } = require("../lib/homepage");
const { handleProjectPageRequest } = require("../lib/project-pages");
const { listServicePages } = require("../lib/service-pages");

const response = () => ({
  headers: {},
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  end(value) { this.body = value; }
});

test("sitemaps omit unknown, invalid and future modification dates instead of using build time", () => {
  for (const updatedAt of [undefined, "not-a-date", "2999-01-01T00:00:00Z"]) {
    const data = { updatedAt };
    assert.doesNotMatch(generateSitemap(data), /<lastmod>/);
  }
  assert.match(generateSitemap({ updatedAt: "2026-07-14T10:00:00Z" }), /<lastmod>2026-07-14<\/lastmod>/);
  const data = structuredClone(require("../data/site.json"));
  data.updatedAt = "invalid";
  data.albums.forEach((album) => { album.updatedAt = "invalid"; album.projectPage = { ...album.projectPage, updatedAt: "invalid" }; });
  assert.doesNotMatch(generateSitemap(data), /<lastmod>/);
});

test("the sitemap lists the canonical archive and service images without utility or redirect URLs", () => {
  const xml = generateSitemap(require("../data/site.json"));
  assert.match(xml, /<loc>https:\/\/www.davidesolla.com\/field-notes\/archive<\/loc>/);
  assert.doesNotMatch(xml, /<loc>[^<]*(?:\/field-notes<|\.html|\/api\/|\/newsletter\/dist\/|\/admin)/);
  for (const page of listServicePages()) {
    const entry = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].find((match) => match[1].includes(`<loc>${page.canonical}</loc>`));
    assert.ok(entry);
    assert.ok(entry[1].includes(`<image:loc>https://www.davidesolla.com/${page.hero.src}</image:loc>`));
  }
});

test("homepage cards exclude incomplete and duplicate projects that cannot resolve to a public story", () => {
  const data = structuredClone(require("../data/site.json"));
  data.albums.push({ ...data.albums[0], id: "incomplete", projectPage: { slug: "incomplete" }, description: "" });
  data.albums.push({ ...data.albums[0] });
  const html = renderHomepage(data);
  assert.doesNotMatch(html, /href="\/work\/incomplete"/);
  const slug = data.albums[0].projectPage?.slug || data.albums[0].id;
  assert.equal((html.match(new RegExp(`href="/work/${slug}"`, "g")) || []).length, 1);
});

test("non-indexable API copies and missing project responses cannot persist in shared caches", () => {
  for (const [handler, url, method, status] of [
    [handleHomepageRequest, "/api/homepage", "GET", 200],
    [handleProjectPageRequest, "/api/project?slug=cosmic", "GET", 200],
    [handleProjectPageRequest, "/work/missing-story", "GET", 404],
    [handleProjectPageRequest, "/work/cosmic", "POST", 405]
  ]) {
    const res = response();
    handler({ url, method }, res);
    assert.equal(res.statusCode, status);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.match(res.headers["x-robots-tag"], /noindex/);
  }
});

test("production archive routes and email noindex headers are ordered before generic asset handling", () => {
  const { routes } = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const archive = routes.find((route) => route.src === "/field-notes/archive");
  assert.equal(archive.dest, "/api/field-notes?archive=1&public=1");
  const email = routes.find((route) => new RegExp(`^(?:${route.src})$`).test("/newsletter/dist/2026-09.html") && route.headers?.["X-Robots-Tag"]);
  assert.equal(email.headers["X-Robots-Tag"], "noindex, follow");
  assert.equal(new RegExp(`^(?:${email.src})$`).test("/newsletter/dist/2026-09.jpg"), false);
});
