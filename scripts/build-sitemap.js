const fs = require("fs");
const path = require("path");
const { generateSitemap } = require("../lib/seo");
const { loadFieldNotesPublications } = require("../lib/field-notes-pages");

const rootDir = path.resolve(__dirname, "..");
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(rootDir, relativePath), "utf8")
);

const siteData = readJson("data/site.json");
const publications = loadFieldNotesPublications();
const sitemap = generateSitemap(siteData, {
  newsletterIssues: publications.map((publication) => publication.indexEntry),
  newsletterIssueDocuments: publications.map((publication) => publication.issue)
});

fs.writeFileSync(path.join(rootDir, "sitemap.xml"), sitemap, "utf8");
console.log("Built sitemap.xml from public portfolio and Field Notes indexes.");
