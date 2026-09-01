const {
  listProjectPages,
  projectImages,
  projectSlug
} = require("./project-pages");
const { listServicePages } = require("./service-pages");

const defaultSiteUrl = "https://www.davidesolla.com/";

const escapeXml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const normaliseBaseUrl = (siteUrl = defaultSiteUrl) => {
  const url = new URL(siteUrl);
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.href;
};

const absoluteUrl = (src, siteUrl = defaultSiteUrl) => new URL(src, normaliseBaseUrl(siteUrl)).href;

const pushImage = (images, seen, image, siteUrl) => {
  if (!image?.src) {
    return;
  }

  const loc = absoluteUrl(image.src, siteUrl);

  if (seen.has(loc)) {
    return;
  }

  seen.add(loc);
  images.push({ loc });
};

const collectSitemapImages = (siteData = {}, siteUrl = defaultSiteUrl) => {
  const images = [];
  const seen = new Set();

  pushImage(images, seen, {
    src: "assets/images/hero-cosmic-girl.jpg",
    title: "Davide Solla cinematic London fashion portrait",
    caption: "Cinematic fashion portrait with blue and red studio lighting by London photographer Davide Solla."
  }, siteUrl);

  for (const album of listProjectPages(siteData)) {
    for (const cover of album.covers || []) {
      pushImage(images, seen, cover, siteUrl);
    }
  }

  return images;
};

const formatLastmod = (siteData = {}, explicitLastmod = "") => {
  const date = explicitLastmod || siteData.updatedAt || new Date().toISOString();
  return new Date(date).toISOString().slice(0, 10);
};

const fieldNotesIssueIdPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const validTimestamp = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

const publishableFieldNotesIssues = (issues = []) => {
  const values = Array.isArray(issues) ? issues : [];
  const counts = values.reduce((result, issue) => {
    const issueId = String(issue?.issueId || "");
    result.set(issueId, (result.get(issueId) || 0) + 1);
    return result;
  }, new Map());

  return values.filter((issue) => {
    const issueId = String(issue?.issueId || "");
    return fieldNotesIssueIdPattern.test(issueId)
      && counts.get(issueId) === 1
      && issue?.status === "research-approved"
      && issue?.publicationStatus === "published"
      && Boolean(validTimestamp(issue?.publishedAt))
      && Boolean(validTimestamp(issue?.updatedAt || issue?.publishedAt));
  }).sort((left, right) => String(right.issueId).localeCompare(String(left.issueId)));
};

const renderImageXml = (images = []) => images.map((image) => [
  "    <image:image>",
  `      <image:loc>${escapeXml(image.loc)}</image:loc>`,
  "    </image:image>"
].join("\n")).join("\n");

const projectSitemapEntries = (siteData = {}, siteUrl = defaultSiteUrl, explicitLastmod = "") => listProjectPages(siteData).map((album) => {
  const slug = projectSlug(album);
  const albumLastmod = explicitLastmod || album.projectPage?.updatedAt || album.updatedAt || "";
  const lastmod = albumLastmod ? formatLastmod({}, albumLastmod) : "";
  const images = projectImages(album).map((image) => ({
    loc: absoluteUrl(image.src, siteUrl)
  }));
  return [
    "  <url>",
    `    <loc>${escapeXml(absoluteUrl(`work/${slug}`, siteUrl))}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
    renderImageXml(images),
    "  </url>"
  ].filter(Boolean).join("\n");
});

const ownedImagesInDocument = (document = {}, siteUrl = defaultSiteUrl) => {
  const images = [];
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.src === "string" && /^\/?assets\/images\//.test(value.src)) {
      const loc = absoluteUrl(value.src, siteUrl);
      if (!seen.has(loc)) {
        seen.add(loc);
        images.push({ loc });
      }
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(document);
  return images;
};

const fieldNotesSitemapEntries = (issues = [], siteUrl = defaultSiteUrl, issueDocuments = []) => {
  const documentsById = new Map((issueDocuments || []).map((document) => [document?.issueId, document]));
  return publishableFieldNotesIssues(issues).map((issue) => [
    "  <url>",
    `    <loc>${escapeXml(absoluteUrl(`field-notes/${issue.issueId}`, siteUrl))}</loc>`,
    `    <lastmod>${escapeXml(validTimestamp(issue.updatedAt || issue.publishedAt).slice(0, 10))}</lastmod>`,
    renderImageXml(ownedImagesInDocument(documentsById.get(issue.issueId), siteUrl)),
    "  </url>"
  ].filter(Boolean).join("\n"));
};

const staticSitemapEntries = (siteUrl = defaultSiteUrl) => [
  "field-notes",
  "privacy",
  "image-licensing",
  ...listServicePages().map((page) => `services/${page.slug}`)
].map((pathname) => [
  "  <url>",
  `    <loc>${escapeXml(absoluteUrl(pathname, siteUrl))}</loc>`,
  "  </url>"
].join("\n"));

const generateSitemap = (siteData = {}, options = {}) => {
  const siteUrl = normaliseBaseUrl(options.siteUrl || defaultSiteUrl);
  const lastmod = formatLastmod(siteData, options.lastmod);
  const images = collectSitemapImages(siteData, siteUrl);
  const imageXml = renderImageXml(images);
  const projectsXml = projectSitemapEntries(siteData, siteUrl, options.lastmod);
  const fieldNotesXml = fieldNotesSitemapEntries(
    options.newsletterIssues,
    siteUrl,
    options.newsletterIssueDocuments
  );

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:image=\"http://www.google.com/schemas/sitemap-image/1.1\">",
    "  <url>",
    `    <loc>${escapeXml(siteUrl)}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    imageXml,
    "  </url>",
    ...staticSitemapEntries(siteUrl),
    ...fieldNotesXml,
    ...projectsXml,
    "</urlset>",
    ""
  ].join("\n");
};

module.exports = {
  collectSitemapImages,
  fieldNotesSitemapEntries,
  generateSitemap,
  ownedImagesInDocument,
  publishableFieldNotesIssues,
  projectSitemapEntries,
  staticSitemapEntries
};
