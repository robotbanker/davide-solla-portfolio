const fs = require("fs");
const path = require("path");
const { dimensionsForImage } = require("./image-metadata");
const { listProjectPages, projectSlug } = require("./project-pages");
const { setSecurityHeaders } = require("./security");

const rootDir = path.resolve(__dirname, "..");
const homepagePath = path.join(rootDir, "index.html");
const siteDataPath = path.join(rootDir, "data", "site.json");

const markers = Object.freeze({
  hero: ["<!-- homepage-hero:start -->", "<!-- homepage-hero:end -->"],
  editorials: ["<!-- homepage-editorials:start -->", "<!-- homepage-editorials:end -->"],
  fineArt: ["<!-- homepage-fine-art:start -->", "<!-- homepage-fine-art:end -->"],
  data: ["<!-- homepage-data:start -->", "<!-- homepage-data:end -->"]
});

const categoryByProject = Object.freeze({
  dreamland: "Editorial portrait",
  roxana: "Beauty",
  cosmic: "Fashion",
  julia: "Portrait",
  sophie: "Fashion",
  inna: "Portrait",
  harvey: "Portrait",
  "dark-baroque": "Fashion",
  kintsugi: "Fine Art",
  petals: "Fine Art",
  "kihaya-blues": "Artist portrait"
});

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeCoverClasses = (value = "", baseClass = "work-tile") => {
  const allowed = baseClass === "work-tile"
    ? new Set(["tile-large", "tile-wide", "tile-tall"])
    : new Set(["fine-tall", "fine-wide", "fine-portrait"]);
  return String(value).split(/\s+/).filter((item) => allowed.has(item)).join(" ");
};

const responsiveSource = (src, width, extension) => {
  const fileName = src.slice(src.lastIndexOf("/") + 1);
  const baseName = fileName.slice(0, fileName.lastIndexOf("."));
  return `assets/images/responsive/${baseName}-${width}.${extension}`;
};

const originalExtension = (src) => src.toLowerCase().endsWith(".jpeg") ? "jpeg" : "jpg";

const canUseResponsiveSource = (src = "") => {
  if (!/^assets\/images\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.jpe?g$/i.test(src)) return false;
  return [720, 1200].every((width) => [originalExtension(src), "webp", "avif"].every((extension) =>
    fs.existsSync(path.join(rootDir, responsiveSource(src, width, extension)))));
};

const coverSizes = (baseClass, classes) => {
  const feature = /\b(tile-large|tile-wide|tile-tall|fine-tall|fine-wide|fine-portrait)\b/.test(classes);
  if (baseClass === "work-tile") {
    return feature
      ? "(max-width: 720px) 100vw, (max-width: 980px) 100vw, 50vw"
      : "(max-width: 720px) 50vw, (max-width: 980px) 50vw, 25vw";
  }
  return feature
    ? "(max-width: 720px) 100vw, (max-width: 980px) 50vw, 42vw"
    : "(max-width: 720px) 50vw, (max-width: 980px) 50vw, 30vw";
};

const pictureMarkup = (cover, { baseClass, classes }) => {
  const src = String(cover?.src || "");
  const alt = escapeHtml(cover?.alt || "Davide Solla photography");
  const sizes = coverSizes(baseClass, classes);
  const dimensions = dimensionsForImage(src);
  const dimensionAttributes = dimensions
    ? ` width="${dimensions.width}" height="${dimensions.height}"`
    : "";
  const hasResponsiveSources = canUseResponsiveSource(src);
  const image = `<img src="${escapeHtml(src)}"${hasResponsiveSources ? ` srcset="${responsiveSource(src, 720, originalExtension(src))} 720w, ${responsiveSource(src, 1200, originalExtension(src))} 1200w" sizes="${sizes}"` : ""} alt="${alt}"${dimensionAttributes} loading="lazy" decoding="async"${cover?.previewPosition ? ` style="object-position:${escapeHtml(cover.previewPosition)}"` : ""}>`;
  if (!hasResponsiveSources) return image;
  return `<picture>
              <source type="image/avif" srcset="${responsiveSource(src, 720, "avif")} 720w, ${responsiveSource(src, 1200, "avif")} 1200w" sizes="${sizes}">
              <source type="image/webp" srcset="${responsiveSource(src, 720, "webp")} 720w, ${responsiveSource(src, 1200, "webp")} 1200w" sizes="${sizes}">
              ${image}
            </picture>`;
};

const coverMarkup = (album, cover, baseClass) => {
  const slug = projectSlug(album);
  if (!slug || !cover?.src) return "";
  const classes = safeCoverClasses(
    baseClass === "work-tile"
      ? cover.workClassName || cover.className
      : cover.fineClassName || cover.className,
    baseClass
  );
  const className = [baseClass, classes].filter(Boolean).join(" ");
  const title = String(cover.label || album.title || "Portfolio story");
  const category = String(album.category || categoryByProject[album.id] || album.kicker || "Portfolio");
  return `          <a class="${className}" href="/work/${escapeHtml(slug)}" data-gallery="${escapeHtml(album.id)}" aria-label="Open ${escapeHtml(title)} story">
            ${pictureMarkup(cover, { baseClass, classes })}
            <span class="tile-caption"><span class="tile-category">${escapeHtml(category)}</span><span class="tile-title">${escapeHtml(title)}</span><span class="tile-action">View story</span></span>
          </a>`;
};

const coverEdit = [
  { id: "of-earth-and-ether", service: "Fine art", alt: "A direct gaze through cascading curls and baby's breath, with ivory silk against a painted green backdrop." },
  { id: "sophie", service: "Fashion", edition: "-02", alt: "Sophie looking across a Soho street, framed by violet and gold neon." },
  { id: "dreamland", service: "Location shoots", edition: "-02", alt: "A model in an ivory dress reclines on a coastal rock, with Atlantic waves behind her." },
  { id: "kintsugi", service: "Fine art", alt: "Gold leaf catches the light across a model’s cheek and shoulder against deep shadow." },
  { id: "roxana", service: "Fashion", alt: "Roxana looks up against pink neon and reflections in a London shop window." },
  { id: "julia", service: "Location shoots", edition: "-02", alt: "Julia seated beside a pale stone column, looking towards the camera over a winter scarf." },
  { id: "kihaya-blues", service: "Studio work", alt: "Kihaya Blues playing an electric guitar under blue studio light." }
];

const renderCoverEdit = (siteData) => {
  const projects = listProjectPages(siteData);
  const slides = coverEdit.flatMap((selection) => {
    const album = projects.find((project) => project.id === selection.id);
    return album ? [{ ...selection, title: album.title, slug: projectSlug(album) }] : [];
  });
  if (!slides.length) return '<div class="cover-bar"><h1 class="eyebrow">London fashion &amp; editorial photographer</h1><a href="#work">View work</a></div>';

  const frames = slides.map(({ id, service, alt, title, slug, edition = "" }, index) => {
    const base = 'assets/images/cover-series/' + id;
    const frame = `<article class="cover-slide" data-series="${id}" role="group" aria-roledescription="slide" aria-label="${index + 1} of ${slides.length}"${index ? ' inert' : ' data-current'}>
              <picture>
                <source media="(max-width: 740px)" srcset="${base}-phone${edition}.webp">
                <img src="${base}-wide${edition}.webp" alt="${escapeHtml(alt)}" decoding="async"${index ? '' : ' fetchpriority="high"'}>
              </picture>
              <div class="cover-legend">
                <h2>${service}</h2>
                <a href="/work/${escapeHtml(slug)}" aria-label="View ${escapeHtml(title)} story">${escapeHtml(title)} <span aria-hidden="true">↗</span></a>
              </div>
            </article>`;
    return index ? `<template>${frame}</template>` : frame;
  });
  return `<div class="cover-carousel" role="region" aria-roledescription="carousel" aria-label="Featured photography">
          <div class="cover-stage">
            ${frames.join("\n            ")}
            <h1 class="eyebrow">London fashion &amp; editorial photographer</h1>
          </div>
          <div class="cover-bar">
            <div class="cover-controls" hidden>
              <button type="button" data-play aria-label="Pause slideshow"><span aria-hidden="true"></span></button>
              <span class="cover-count" aria-hidden="true"><b>01</b> / ${String(slides.length).padStart(2, "0")}</span>
              <button type="button" data-step="-1" aria-label="Previous photograph">←</button>
              <button type="button" data-step="1" aria-label="Next photograph">→</button>
            </div>
            <div class="cover-actions">
              <a href="#work">View work</a>
              <a href="#contact">Book a shoot <span aria-hidden="true">↗</span></a>
              <a href="/field-notes#subscribe">Subscribe</a>
            </div>
          </div>
          <span class="cover-status" role="status"></span>
        </div>`;
};

const renderEditorialCovers = (siteData = {}) => listProjectPages(siteData)
  .filter((album) => album.section === "editorials")
  .map((album) => coverMarkup(album, (album.covers || [])[0], "work-tile"))
  .filter(Boolean)
  .join("\n");

const renderFineArtCovers = (siteData = {}) => listProjectPages(siteData)
  .filter((album) => album.section === "fine-art")
  .flatMap((album) => (album.covers || []).map((cover) => coverMarkup(album, cover, "fine-image")))
  .filter(Boolean)
  .join("\n");

const serialiseSiteData = (siteData = {}) => JSON.stringify(siteData)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const replaceMarkedContent = (template, [startMarker, endMarker], content) => {
  const start = template.indexOf(startMarker);
  const end = template.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`Homepage template marker is missing: ${startMarker}`);
  }
  const contentStart = start + startMarker.length;
  return `${template.slice(0, contentStart)}\n${content}\n${template.slice(end)}`;
};

const injectHomepageContent = (template, siteData = {}) => {
  let html = replaceMarkedContent(template, markers.hero, renderCoverEdit(siteData));
  html = replaceMarkedContent(html, markers.editorials, renderEditorialCovers(siteData));
  html = replaceMarkedContent(html, markers.fineArt, renderFineArtCovers(siteData));
  html = replaceMarkedContent(
    html,
    markers.data,
    `    <script id="site-data" type="application/json">${serialiseSiteData(siteData)}</script>`
  );
  return html;
};

const loadSiteData = () => JSON.parse(fs.readFileSync(siteDataPath, "utf8"));
const loadHomepageTemplate = () => fs.readFileSync(homepagePath, "utf8");
const renderHomepage = (siteData = loadSiteData(), template = loadHomepageTemplate()) => injectHomepageContent(template, siteData);

const handleHomepageRequest = (req, res) => {
  setSecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("allow", "GET, HEAD");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    res.statusCode = 405;
    res.end(req.method === "HEAD" ? undefined : "Method not allowed");
    return;
  }

  const requestUrl = new URL(req.url, "https://www.davidesolla.com");
  const publicRoute = requestUrl.pathname === "/" || requestUrl.searchParams.get("public") === "1";
  if (!publicRoute) res.setHeader("x-robots-tag", "noindex, nofollow");

  try {
    const html = renderHomepage();
    res.setHeader("cache-control", publicRoute
      ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
      : "no-store");
    res.statusCode = 200;
    res.end(req.method === "HEAD" ? undefined : html);
  } catch {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    res.statusCode = 500;
    res.end(req.method === "HEAD" ? undefined : "Homepage unavailable");
  }
};

module.exports = {
  handleHomepageRequest,
  injectHomepageContent,
  markers,
  renderEditorialCovers,
  renderFineArtCovers,
  renderHomepage
};
