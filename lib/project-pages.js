const fs = require("fs");
const path = require("path");
const { setSecurityHeaders } = require("./security");

const rootDir = path.resolve(__dirname, "..");
const siteDataPath = path.join(rootDir, "data", "site.json");
const siteUrl = "https://www.davidesolla.com";
const siteName = "Davide Solla Studios";
const photographer = Object.freeze({ role: "Photography", name: "Davide Solla" });

const categoryByProject = Object.freeze({
  roxana: "Beauty editorial",
  cosmic: "Fashion editorial",
  julia: "Portrait editorial",
  sophie: "Fashion editorial",
  inna: "Portrait study",
  harvey: "Menswear portrait",
  studio: "Model portfolio",
  "dark-baroque": "Fashion editorial",
  kintsugi: "Fine art",
  petals: "Fine art"
});

const locationByProject = Object.freeze({
  roxana: "London",
  cosmic: "London studio",
  julia: "London",
  sophie: "Soho, London",
  harvey: "London studio",
  studio: "London studio",
  "dark-baroque": "London",
  kintsugi: "London",
  petals: "London"
});

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const cleanText = (value = "", maxLength = 500) => String(value || "").trim().slice(0, maxLength);

const projectSlug = (album = {}) => {
  const candidate = cleanText(album.projectPage?.slug || album.id, 80).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : "";
};

const projectImages = (album = {}) => {
  const seen = new Set();
  const values = [...(album.covers || []), ...(album.images || [])];
  return values.filter((image) => {
    const src = cleanText(image?.src, 500);
    if (!src.startsWith("assets/images/") || seen.has(src)) return false;
    seen.add(src);
    return true;
  }).map((image) => ({
    src: cleanText(image.src, 500),
    alt: cleanText(image.alt || album.title, 300),
    previewPosition: cleanText(image.previewPosition, 40)
  }));
};

const listProjectPages = (siteData = {}) => {
  const seen = new Set();
  return (Array.isArray(siteData.albums) ? siteData.albums : []).filter((album) => {
    const slug = projectSlug(album);
    const publicSection = ["editorials", "fine-art"].includes(album?.section);
    const publishable = album?.projectPage?.published !== false
      && Boolean(slug && cleanText(album?.title) && cleanText(album?.description))
      && projectImages(album).length > 0;
    if (!publicSection || !publishable || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
};

const validCreditReview = (album = {}) => {
  const review = album.creditReview;
  if (!review || review.status !== "verified") return false;
  if (!cleanText(review.reviewedBy, 120)) return false;
  const reviewedAt = Date.parse(review.reviewedAt || "");
  return Number.isFinite(reviewedAt) && reviewedAt <= Date.now();
};

const verifiedCredits = (album = {}) => {
  const values = [photographer];
  if (!validCreditReview(album) || !Array.isArray(album.credits)) return values;

  for (const credit of album.credits) {
    const role = cleanText(credit?.role, 80);
    const name = cleanText(credit?.name, 160);
    if (!role || !name) continue;
    if (role.toLowerCase() === photographer.role.toLowerCase()
      && name.toLowerCase() === photographer.name.toLowerCase()) continue;
    values.push({ role, name });
  }
  return values;
};

const reviewedCollaboratorCredits = (album = {}) => verifiedCredits(album).slice(1);

const absoluteUrl = (value = "") => new URL(String(value).replace(/^\/+/, ""), `${siteUrl}/`).href;

const responsiveSource = (src, width, extension) => {
  const fileName = src.slice(src.lastIndexOf("/") + 1);
  const baseName = fileName.slice(0, fileName.lastIndexOf("."));
  return `/assets/images/responsive/${baseName}-${width}.${extension}`;
};

const originalImageExtension = (src) => src.toLowerCase().endsWith(".jpeg") ? "jpeg" : "jpg";

const canUseResponsiveSource = (src) => /^assets\/images\/[^/]+\.jpe?g$/i.test(src);

const pictureMarkup = (image, index) => {
  const src = `/${image.src.replace(/^\/+/, "")}`;
  const alt = escapeHtml(image.alt);
  const loading = index < 2 ? "eager" : "lazy";
  const priority = index === 0 ? " fetchpriority=\"high\"" : "";
  const imageMarkup = `<img src="${escapeHtml(src)}" alt="${alt}" loading="${loading}" decoding="async"${priority}>`;
  if (!canUseResponsiveSource(image.src)) return imageMarkup;
  return `<picture>
            <source type="image/avif" srcset="${responsiveSource(image.src, 720, "avif")} 720w, ${responsiveSource(image.src, 1200, "avif")} 1200w" sizes="(max-width: 760px) 100vw, 76vw">
            <source type="image/webp" srcset="${responsiveSource(image.src, 720, "webp")} 720w, ${responsiveSource(image.src, 1200, "webp")} 1200w" sizes="(max-width: 760px) 100vw, 76vw">
            <img src="${escapeHtml(src)}" srcset="${responsiveSource(image.src, 720, originalImageExtension(image.src))} 720w, ${responsiveSource(image.src, 1200, originalImageExtension(image.src))} 1200w" sizes="(max-width: 760px) 100vw, 76vw" alt="${alt}" loading="${loading}" decoding="async"${priority}>
          </picture>`;
};

const jsonLdMarkup = (album, slug, images, credits, siteData) => {
  const canonical = `${siteUrl}/work/${slug}`;
  const creator = { "@type": "Person", "@id": `${siteUrl}/#person`, name: photographer.name, url: `${siteUrl}/` };
  const review = validCreditReview(album) ? album.creditReview : null;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ImageGallery",
        "@id": `${canonical}#gallery`,
        url: canonical,
        name: cleanText(album.title, 160),
        description: cleanText(album.description, 500),
        inLanguage: "en-GB",
        isPartOf: { "@id": `${siteUrl}/#website` },
        creator,
        copyrightHolder: creator,
        copyrightNotice: `© ${photographer.name}`,
        dateModified: cleanText(album.updatedAt || siteData.updatedAt, 40) || undefined,
        primaryImageOfPage: { "@id": `${canonical}#primary-image` },
        image: images.map((image, index) => ({
          "@type": "ImageObject",
          ...(index === 0 ? { "@id": `${canonical}#primary-image` } : {}),
          contentUrl: absoluteUrl(image.src),
          caption: image.alt,
          creditText: photographer.name,
          creator,
          copyrightNotice: `© ${photographer.name}`
        })),
        ...(review ? {
          lastReviewed: new Date(review.reviewedAt).toISOString().slice(0, 10),
          reviewedBy: { "@type": "Person", name: cleanText(review.reviewedBy, 120) },
          contributor: credits.slice(1).map((credit) => ({ "@type": "Person", name: credit.name, jobTitle: credit.role }))
        } : {})
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Selected work", item: `${siteUrl}/#work` },
          { "@type": "ListItem", position: 3, name: cleanText(album.title, 160), item: canonical }
        ]
      }
    ]
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
};

const pageMetadata = (album, slug) => {
  const category = cleanText(album.category || categoryByProject[album.id] || album.kicker, 100);
  const location = cleanText(album.location || locationByProject[album.id], 100);
  const year = /^20\d{2}$/.test(String(album.year || "")) ? String(album.year) : "";
  return {
    category,
    location,
    year,
    canonical: `${siteUrl}/work/${slug}`,
    title: `${cleanText(album.title, 100)} — ${category || "Photography"} | Davide Solla`,
    description: cleanText(album.metaDescription || album.description, 300)
  };
};

const metadataRows = (metadata) => [
  ["Category", metadata.category],
  ["Location", metadata.location],
  ["Year", metadata.year]
].filter(([, value]) => value).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");

const creditRows = (credits) => credits.map((credit) => `<div><dt>${escapeHtml(credit.role)}</dt><dd>${escapeHtml(credit.name)}</dd></div>`).join("");

const renderProjectPage = (siteData, requestedSlug) => {
  const albums = listProjectPages(siteData);
  const slug = cleanText(requestedSlug, 80).toLowerCase();
  const index = albums.findIndex((album) => projectSlug(album) === slug);
  if (index < 0) return null;

  const album = albums[index];
  const images = projectImages(album);
  const credits = verifiedCredits(album);
  const metadata = pageMetadata(album, slug);
  const previous = albums[(index - 1 + albums.length) % albums.length];
  const next = albums[(index + 1) % albums.length];
  const primaryImage = images[0];
  const primaryImageUrl = absoluteUrl(primaryImage.src);
  const preload = canUseResponsiveSource(primaryImage.src)
    ? `<link rel="preload" as="image" href="${responsiveSource(primaryImage.src, 1200, "avif")}" imagesrcset="${responsiveSource(primaryImage.src, 720, "avif")} 720w, ${responsiveSource(primaryImage.src, 1200, "avif")} 1200w" imagesizes="(max-width: 760px) 100vw, 76vw" type="image/avif" fetchpriority="high">`
    : `<link rel="preload" as="image" href="/${escapeHtml(primaryImage.src)}" fetchpriority="high">`;
  const jsonLd = jsonLdMarkup(album, slug, images, credits, siteData);

  return `<!doctype html>
<html lang="en-GB" data-analytics="enabled">
  <head>
    <script src="/privacy-consent.js?v=2026-07-18" defer></script>
    <script src="/google-tag.js?v=3" defer></script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}">
    <meta name="author" content="Davide Solla">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${metadata.canonical}">
    ${preload}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${siteName}">
    <meta property="og:url" content="${metadata.canonical}">
    <meta property="og:title" content="${escapeHtml(metadata.title)}">
    <meta property="og:description" content="${escapeHtml(metadata.description)}">
    <meta property="og:image" content="${primaryImageUrl}">
    <meta property="og:image:alt" content="${escapeHtml(primaryImage.alt)}">
    <meta property="og:locale" content="en_GB">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(metadata.title)}">
    <meta name="twitter:description" content="${escapeHtml(metadata.description)}">
    <meta name="twitter:image" content="${primaryImageUrl}">
    <meta name="twitter:image:alt" content="${escapeHtml(primaryImage.alt)}">
    <link rel="icon" type="image/png" href="/assets/images/favicon.png">
    <link rel="apple-touch-icon" href="/assets/images/favicon.png">
    <meta name="theme-color" content="#080807">
    <link rel="stylesheet" href="/styles.css?v=30">
    <link rel="stylesheet" href="/project-page.css?v=1">
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body class="project-page">
    <header class="project-site-header">
      <a class="project-wordmark" href="/" aria-label="Davide Solla Studios home"><strong>Davide Solla</strong><span>Studios</span></a>
      <nav aria-label="Project navigation"><a href="/#work">Selected work</a><a href="/?utm_source=website&amp;utm_medium=project_page&amp;utm_campaign=portfolio_story&amp;utm_content=${escapeHtml(slug)}#contact">Enquire</a></nav>
    </header>
    <main>
      <article>
        <header class="project-intro">
          <nav class="project-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/#work">Selected work</a><span aria-hidden="true">/</span><span>${escapeHtml(album.title)}</span></nav>
          <p class="section-kicker">${escapeHtml(album.kicker || metadata.category)}</p>
          <h1>${escapeHtml(album.title)}</h1>
          <div class="project-intro-grid">
            <p class="project-description">${escapeHtml(album.description)}</p>
            <dl class="project-meta">${metadataRows(metadata)}</dl>
          </div>
        </header>
        <section class="project-gallery" aria-label="${escapeHtml(album.title)} image gallery">
          ${images.map((image, imageIndex) => `<figure class="project-frame${imageIndex === 0 ? " project-frame-featured" : ""}">${pictureMarkup(image, imageIndex)}</figure>`).join("\n          ")}
        </section>
        <section class="project-credits" aria-labelledby="project-credits-title">
          <div><p class="section-kicker">Verified credits</p><h2 id="project-credits-title">The people behind the work.</h2></div>
          <dl>${creditRows(credits)}</dl>
        </section>
        <aside class="project-cta" aria-labelledby="project-cta-title">
          <p class="section-kicker">Commission a story</p>
          <h2 id="project-cta-title">Planning an editorial, campaign, beauty story, or portrait commission?</h2>
          <p>Share the brief, timing, location, and intended usage. Davide will reply personally.</p>
          <a class="hero-primary" href="/?utm_source=website&amp;utm_medium=project_page&amp;utm_campaign=portfolio_story&amp;utm_content=${escapeHtml(slug)}#contact">Start an enquiry</a>
        </aside>
        <nav class="project-sequence" aria-label="More project stories">
          <a href="/work/${projectSlug(previous)}"><span>Previous story</span><strong>${escapeHtml(previous.title)}</strong></a>
          <a href="/work/${projectSlug(next)}"><span>Next story</span><strong>${escapeHtml(next.title)}</strong></a>
        </nav>
      </article>
    </main>
    <footer class="project-footer">
      <p>© ${new Date().getUTCFullYear()} Davide Solla Studios · London</p>
      <nav aria-label="Footer"><a href="/privacy">Privacy</a><button type="button" data-privacy-settings>Privacy settings</button><a href="https://www.instagram.com/davide.studios/" target="_blank" rel="noopener noreferrer">Instagram</a></nav>
    </footer>
  </body>
</html>`;
};

const notFoundPage = () => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Project not found | ${siteName}</title><link rel="stylesheet" href="/styles.css?v=30"><link rel="stylesheet" href="/project-page.css?v=1"></head><body class="project-page project-not-found"><main><p class="section-kicker">Selected work</p><h1>That project is not available.</h1><p>The story may have moved or returned to the private edit.</p><a class="hero-primary" href="/#work">Return to selected work</a></main></body></html>`;

const loadSiteData = () => JSON.parse(fs.readFileSync(siteDataPath, "utf8"));

const handleProjectPageRequest = (req, res) => {
  setSecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  const requestUrl = new URL(req.url, "https://www.davidesolla.com");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("allow", "GET, HEAD");
    res.statusCode = 405;
    res.end(req.method === "HEAD" ? undefined : "Method not allowed");
    return;
  }

  const routeSlug = requestUrl.pathname.startsWith("/work/")
    ? requestUrl.pathname.slice("/work/".length).replace(/\/+$/, "")
    : requestUrl.searchParams.get("slug") || "";
  const page = renderProjectPage(loadSiteData(), routeSlug);
  res.statusCode = page ? 200 : 404;
  const publicRoute = requestUrl.pathname.startsWith("/work/")
    || requestUrl.searchParams.get("public") === "1";
  if (!page || !publicRoute) res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(req.method === "HEAD" ? undefined : (page || notFoundPage()));
};

module.exports = {
  handleProjectPageRequest,
  listProjectPages,
  projectImages,
  projectSlug,
  renderProjectPage,
  reviewedCollaboratorCredits,
  validCreditReview,
  verifiedCredits
};
