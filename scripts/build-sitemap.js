const fs = require("fs");
const path = require("path");
const { generateSitemap } = require("../lib/seo");

const rootDir = path.resolve(__dirname, "..");
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(rootDir, relativePath), "utf8")
);

const siteData = readJson("data/site.json");
const newsletterIndex = readJson("newsletter/data/issues/index.json");
const sitemap = generateSitemap(siteData, {
  newsletterIssues: newsletterIndex.issues
});

fs.writeFileSync(path.join(rootDir, "sitemap.xml"), sitemap, "utf8");
console.log("Built sitemap.xml from public portfolio and Field Notes indexes.");
