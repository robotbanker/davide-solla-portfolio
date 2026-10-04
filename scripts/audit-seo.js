// Read-only HTTP checks against a running local server or the public site.
// Usage: npm run seo:audit -- https://www.davidesolla.com
const assert = require("node:assert/strict");

const origin = new URL(process.argv[2] || "http://localhost:4173").origin;
const canonicalOrigin = "https://www.davidesolla.com";
const errors = [];
const resources = new Set();
const links = new Set();
const titles = new Set();
const descriptions = new Set();
const decode = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], decode(match[2])]));
const request = (path, options = {}) => fetch(new URL(path, origin), {
  signal: AbortSignal.timeout(20000), redirect: "manual", ...options
});
const check = async (label, fn) => {
  try { await fn(); } catch (error) { errors.push(`${label}: ${error.message}`); }
};
const pool = async (values, fn) => {
  const pending = [...values];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) { const item = pending.shift(); await check(item, () => fn(item)); }
  }));
};
const addLocal = (set, value, page) => {
  if (!value) return;
  const url = new URL(decode(value), `${canonicalOrigin}${page}`);
  if (url.origin === canonicalOrigin) set.add(url.pathname + url.search);
};

async function main() {
  const sitemapResponse = await request("/sitemap.xml");
  assert.equal(sitemapResponse.status, 200, "sitemap must return 200");
  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
  assert.ok(urls.length, "sitemap must contain pages");
  assert.equal(new Set(urls).size, urls.length, "duplicate sitemap URLs");
  for (const match of sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) addLocal(resources, match[1], "/");
  for (const match of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    assert.ok(Number.isFinite(Date.parse(match[1])) && Date.parse(match[1]) <= Date.now(), "invalid/future sitemap date");
  }
  await pool(urls, async (canonical) => {
    const url = new URL(canonical);
    assert.equal(url.origin, canonicalOrigin, "wrong canonical host");
    assert.equal(url.search + url.hash, "", "sitemap URL contains a query or fragment");
    const res = await request(url.pathname);
    assert.equal(res.status, 200, "sitemap page must return 200 without redirecting");
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    assert.doesNotMatch(res.headers.get("x-robots-tag") || "", /noindex|none/i);
    const html = await res.text();
    const meta = [...html.matchAll(/<meta\b[^>]*>/g)].map((match) => attributes(match[0]));
    const canonicals = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => attributes(match[0])).filter((tag) => tag.rel === "canonical");
    assert.deepEqual(canonicals.map((tag) => tag.href), [canonical], "canonical must match the sitemap URL");
    assert.doesNotMatch(meta.find((tag) => tag.name === "robots")?.content || "", /noindex|none/i);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, "expected one primary heading");
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = meta.find((tag) => tag.name === "description")?.content;
    assert.ok(title && description, "title and description are required");
    assert.ok(!titles.has(title), "duplicate title");
    assert.ok(!descriptions.has(description), "duplicate description");
    titles.add(title); descriptions.add(description);
    const ogUrl = meta.find((tag) => tag.property === "og:url")?.content;
    if (ogUrl) assert.equal(ogUrl, canonical, "social URL disagrees with canonical");
    for (const match of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
    for (const match of html.matchAll(/<(?:img|source|script|link|a)\b[^>]*>/g)) {
      const tag = attributes(match[0]);
      if (match[0].startsWith("<a ")) addLocal(links, tag.href, url.pathname);
      else {
        addLocal(resources, tag.src, url.pathname);
        if (tag.rel === "stylesheet" || tag.rel === "icon") addLocal(resources, tag.href, url.pathname);
        if (tag.srcset) for (const value of tag.srcset.split(",")) addLocal(resources, value.trim().split(/\s+/)[0], url.pathname);
      }
      if (match[0].startsWith("<img ") && tag.src) assert.ok(Object.hasOwn(tag, "alt"), "image has no alt attribute");
    }
  });
  await pool(resources, async (path) => {
    const res = await request(path, { method: "HEAD" });
    assert.equal(res.status, 200, "local asset must load without redirecting");
    if (/\.(?:avif|webp|jpe?g|png|svg)(?:\?|$)/i.test(path)) {
      assert.match(res.headers.get("content-type") || "", /^image\//, "image must have an image content type");
      assert.doesNotMatch(res.headers.get("x-robots-tag") || "", /noindex|none/i, "public image must be indexable");
    }
  });
  await pool(links, async (path) => {
    const res = await request(path, { method: "HEAD", redirect: "follow" });
    assert.equal(res.status, 200, "internal link must resolve");
  });
  await check("indexing controls", async () => {
    const robots = await (await request("/robots.txt")).text();
    assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
    assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, "sitewide crawler block");
    for (const path of ["/admin.html", "/client-area.html", "/preferences", "/api/homepage", "/api/project?slug=cosmic"]) {
      const res = await request(path, { method: "HEAD" });
      assert.match(res.headers.get("x-robots-tag") || "", /noindex/, `${path} must stay out of search`);
    }
    for (const path of ["/seo-audit-missing-page", "/work/seo-audit-missing-project", "/services/seo-audit-missing-service", "/field-notes/2099-12"]) {
      assert.equal((await request(path, { method: "HEAD" })).status, 404, `${path} must not be a soft 404`);
    }
  });
  console.log(`SEO audit: ${urls.length} sitemap pages, ${resources.size} local assets, ${links.size} internal links checked at ${origin}.`);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("PASS: canonical URLs, metadata, JSON-LD, images, internal links, indexing controls and 404 responses.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
