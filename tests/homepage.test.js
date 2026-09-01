const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  handleHomepageRequest,
  renderHomepage
} = require("../lib/homepage");
const { listProjectPages, projectSlug } = require("../lib/project-pages");

const siteData = JSON.parse(fs.readFileSync("data/site.json", "utf8"));

const response = () => ({
  body: undefined,
  headers: {},
  statusCode: 0,
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
  end(value) { this.body = value; }
});

test("the generated homepage exposes current projects and embedded public data", () => {
  const html = renderHomepage();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h1 class="eyebrow">London fashion &(?:amp;)? editorial photographer<\/h1>/);
  assert.match(html, /<script id="site-data" type="application\/json">/);
  assert.doesNotMatch(html, /loading="eager"[^>]*class="fine|class="fine[^>]*loading="eager"/);

  for (const album of listProjectPages(siteData)) {
    assert.match(html, new RegExp(`href="/work/${projectSlug(album)}"`));
  }
});

test("homepage entity data identifies Davide accurately and contains no invalid one-item breadcrumb", () => {
  const html = renderHomepage();
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const graph = JSON.parse(match[1])["@graph"];
  const person = graph.find((node) => node["@type"] === "Person");
  assert.equal(person.image, "https://www.davidesolla.com/assets/images/about-portrait.jpg");
  assert.equal(graph.some((node) => node["@type"] === "BreadcrumbList"), false);
});

test("the clean homepage is cacheable while the direct API alias is noindex", () => {
  const clean = response();
  handleHomepageRequest({ method: "GET", url: "/", headers: {} }, clean);
  assert.equal(clean.statusCode, 200);
  assert.equal(clean.headers["x-robots-tag"], undefined);
  assert.match(clean.headers["cache-control"], /s-maxage=3600/);

  const alias = response();
  handleHomepageRequest({ method: "GET", url: "/api/homepage", headers: {} }, alias);
  assert.equal(alias.statusCode, 200);
  assert.equal(alias.headers["x-robots-tag"], "noindex, nofollow");
});
