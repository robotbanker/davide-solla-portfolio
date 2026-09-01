const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getServicePage,
  handleServicePageRequest,
  listServicePages,
  renderServicePage,
  servicePageSlug
} = require("../lib/service-pages");

const expectedSlugs = [
  "fashion-photographer-london",
  "model-portfolio-photographer-london",
  "beauty-photographer-london",
  "artist-portrait-photographer-london",
  "fine-art-portrait-commissions"
];

const response = () => ({
  body: undefined,
  headers: {},
  statusCode: 0,
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
  end(value) { this.body = value; }
});

const request = (url, method = "GET") => ({ method, url, headers: {} });

const graphFromHtml = (html) => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  return JSON.parse(match[1])["@graph"];
};

test("the service catalogue exposes exactly five stable, distinct commercial pages", () => {
  const pages = listServicePages();
  assert.deepEqual(pages.map((page) => page.slug), expectedSlugs);
  assert.equal(new Set(pages.map((page) => page.title)).size, pages.length);
  assert.equal(new Set(pages.map((page) => page.description)).size, pages.length);
  assert.equal(new Set(pages.map((page) => page.h1)).size, pages.length);

  for (const page of pages) {
    assert.equal(page.path, `/services/${page.slug}`);
    assert.equal(page.canonical, `https://www.davidesolla.com/services/${page.slug}`);
    assert.ok(page.description.length >= 120 && page.description.length <= 165, page.slug);
    assert.equal(page.projects.length, 2);
    assert.equal(page.relatedServices.length, 2);
    assert.equal(servicePageSlug(page), page.slug);
    assert.equal(getServicePage(page.slug), page);
  }

  assert.equal(getServicePage("unknown-service"), null);
  assert.equal(servicePageSlug("../../admin"), "");
});

test("every service page is fully rendered with unique metadata and useful visible paths", () => {
  for (const page of listServicePages()) {
    const html = renderServicePage(page.slug);
    assert.match(html, new RegExp(`<title>${escapeRegex(page.title)}</title>`));
    assert.match(html, new RegExp(`<meta name="description" content="${escapeRegex(page.description)}">`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${escapeRegex(page.canonical)}">`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${escapeRegex(page.canonical)}">`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/);
    assert.match(html, /data-analytics="enabled"/);
    assert.match(html, /privacy-consent\.js\?v=2026-07-18/);
    assert.match(html, /google-tag\.js\?v=3/);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.match(html, new RegExp(`<h1>${escapeRegex(page.h1)}</h1>`));
    assert.match(html, /Discuss the brief/);
    assert.match(html, /utm_medium=service_page/);
    assert.doesNotMatch(html, /testimonial|guaranteed turnaround|starting (?:at|from) £|five-star/i);

    for (const project of page.projects) {
      assert.match(html, new RegExp(`href="/work/${escapeRegex(project.slug)}"`));
    }
    for (const relatedSlug of page.relatedServices) {
      assert.match(html, new RegExp(`href="/services/${escapeRegex(relatedSlug)}"`));
    }
  }
});

test("service structured data resolves the page, service, breadcrumb, image and studio entities", () => {
  for (const page of listServicePages()) {
    const graph = graphFromHtml(renderServicePage(page.slug));
    const website = graph.find((node) => node["@type"] === "WebSite");
    const webpage = graph.find((node) => node["@type"] === "WebPage");
    const service = graph.find((node) => node["@type"] === "Service");
    const image = graph.find((node) => node["@type"] === "ImageObject" && node["@id"]?.endsWith("#primary-image"));
    const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
    const organization = graph.find((node) => node["@type"] === "Organization");
    const person = graph.find((node) => node["@type"] === "Person");

    assert.equal(website.publisher["@id"], organization["@id"]);
    assert.equal(webpage.url, page.canonical);
    assert.equal(webpage.mainEntity["@id"], service["@id"]);
    assert.equal(webpage.breadcrumb["@id"], breadcrumb["@id"]);
    assert.equal(webpage.primaryImageOfPage["@id"], image["@id"]);
    assert.equal(service.url, page.canonical);
    assert.equal(service.provider["@id"], organization["@id"]);
    assert.equal(service.serviceType, page.serviceType);
    assert.deepEqual(service.areaServed.map((area) => area.name), ["London", "United Kingdom"]);
    assert.equal(breadcrumb.itemListElement.at(-1).item, page.canonical);
    assert.equal(organization.name, "Davide Solla Studios");
    assert.equal(organization.founder["@id"], person["@id"]);
    assert.equal(person.name, "Davide Solla");
    assert.equal(image.creator["@id"], person["@id"]);
    assert.equal(image.creditText, "Davide Solla");
    assert.equal(image.width, page.hero.width);
    assert.equal(image.height, page.hero.height);
  }
});

test("clean and rewritten service routes are crawlable while the direct API alias is not", () => {
  const clean = response();
  handleServicePageRequest(request("/services/fashion-photographer-london"), clean);
  assert.equal(clean.statusCode, 200);
  assert.equal(clean.headers["x-robots-tag"], undefined);
  assert.match(clean.headers["content-security-policy"], /default-src 'self'/);
  assert.match(clean.headers["cache-control"], /s-maxage=3600/);
  assert.match(clean.body, /Fashion photographer London/);

  const alias = response();
  handleServicePageRequest(request("/api/service?slug=fashion-photographer-london"), alias);
  assert.equal(alias.statusCode, 200);
  assert.equal(alias.headers["x-robots-tag"], "noindex, nofollow");
  assert.equal(alias.headers["cache-control"], "no-store");

  const rewritten = response();
  handleServicePageRequest(request("/api/service?slug=fashion-photographer-london&public=1"), rewritten);
  assert.equal(rewritten.statusCode, 200);
  assert.equal(rewritten.headers["x-robots-tag"], undefined);
  assert.match(rewritten.headers["cache-control"], /s-maxage=3600/);

  const head = response();
  handleServicePageRequest(request("/services/fashion-photographer-london", "HEAD"), head);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, undefined);
});

test("service routing canonicalises trailing slashes and fails closed", () => {
  const trailing = response();
  handleServicePageRequest(request("/services/beauty-photographer-london/"), trailing);
  assert.equal(trailing.statusCode, 308);
  assert.equal(trailing.headers.location, "/services/beauty-photographer-london");

  for (const url of [
    "/services/not-a-service",
    "/services/fashion-photographer-london/extra",
    "/api/service?slug=not-a-service"
  ]) {
    const missing = response();
    handleServicePageRequest(request(url), missing);
    assert.equal(missing.statusCode, 404, url);
    assert.equal(missing.headers["x-robots-tag"], "noindex, nofollow", url);
    assert.equal(missing.headers["cache-control"], "no-store", url);
    assert.match(missing.body, /That service page is not available/);
  }

  const method = response();
  handleServicePageRequest(request("/services/beauty-photographer-london", "POST"), method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, "GET, HEAD");
  assert.equal(method.headers["x-robots-tag"], "noindex, nofollow");
});

test("the Vercel API entry delegates to the shared service handler", () => {
  assert.equal(require("../api/service"), handleServicePageRequest);
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
