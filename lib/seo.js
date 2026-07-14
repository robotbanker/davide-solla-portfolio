const {
  listProjectPages,
  projectImages,
  projectSlug
} = require("./project-pages");

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
  images.push({
    loc,
    title: image.title || image.alt || "Davide Solla photography",
    caption: image.caption || image.alt || image.title || "Davide Solla photography"
  });
};

const collectSitemapImages = (siteData = {}, siteUrl = defaultSiteUrl) => {
  const images = [];
  const seen = new Set();

  pushImage(images, seen, {
    src: "assets/images/hero-cosmic-girl.jpg",
    title: "Davide Solla cinematic London fashion portrait",
    caption: "Cinematic fashion portrait with blue and red studio lighting by London photographer Davide Solla."
  }, siteUrl);

  pushImage(images, seen, {
    src: "assets/images/soho-01.jpg",
    title: "Sophie Soho night editorial portrait",
    caption: "Nocturnal Soho fashion editorial portrait photographed in London."
  }, siteUrl);

  for (const album of siteData.albums || []) {
    const albumTitle = album.title || "Portfolio";

    for (const cover of album.covers || []) {
      pushImage(images, seen, {
        src: cover.src,
        title: `${albumTitle} by Davide Solla`,
        caption: cover.alt || album.description || albumTitle
      }, siteUrl);
    }

    for (const image of album.images || []) {
      pushImage(images, seen, {
        src: image.src,
        title: `${albumTitle} by Davide Solla`,
        caption: image.alt || album.description || albumTitle
      }, siteUrl);
    }
  }

  return images;
};

const formatLastmod = (siteData = {}, explicitLastmod = "") => {
  const date = explicitLastmod || siteData.updatedAt || new Date().toISOString();
  return new Date(date).toISOString().slice(0, 10);
};

const renderImageXml = (images = []) => images.map((image) => [
  "    <image:image>",
  `      <image:loc>${escapeXml(image.loc)}</image:loc>`,
  `      <image:title>${escapeXml(image.title)}</image:title>`,
  `      <image:caption>${escapeXml(image.caption)}</image:caption>`,
  "    </image:image>"
].join("\n")).join("\n");

const projectSitemapEntries = (siteData = {}, siteUrl = defaultSiteUrl, explicitLastmod = "") => listProjectPages(siteData).map((album) => {
  const slug = projectSlug(album);
  const lastmod = formatLastmod(
    { updatedAt: album.projectPage?.updatedAt || album.updatedAt || siteData.updatedAt },
    explicitLastmod
  );
  const images = projectImages(album).map((image) => ({
    loc: absoluteUrl(image.src, siteUrl),
    title: `${album.title} by Davide Solla`,
    caption: image.alt || album.description || album.title
  }));
  return [
    "  <url>",
    `    <loc>${escapeXml(absoluteUrl(`work/${slug}`, siteUrl))}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    "    <changefreq>monthly</changefreq>",
    "    <priority>0.8</priority>",
    renderImageXml(images),
    "  </url>"
  ].filter(Boolean).join("\n");
});

const generateSitemap = (siteData = {}, options = {}) => {
  const siteUrl = normaliseBaseUrl(options.siteUrl || defaultSiteUrl);
  const lastmod = formatLastmod(siteData, options.lastmod);
  const images = collectSitemapImages(siteData, siteUrl);
  const imageXml = renderImageXml(images);
  const projectsXml = projectSitemapEntries(siteData, siteUrl, options.lastmod);

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:image=\"http://www.google.com/schemas/sitemap-image/1.1\">",
    "  <url>",
    `    <loc>${escapeXml(siteUrl)}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    "    <changefreq>monthly</changefreq>",
    "    <priority>1.0</priority>",
    imageXml,
    "  </url>",
    "  <url>",
    `    <loc>${escapeXml(absoluteUrl("field-notes.html", siteUrl))}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    "    <changefreq>monthly</changefreq>",
    "    <priority>0.6</priority>",
    "  </url>",
    ...projectsXml,
    "</urlset>",
    ""
  ].join("\n");
};

module.exports = {
  collectSitemapImages,
  generateSitemap,
  projectSitemapEntries
};
