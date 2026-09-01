const fs = require("fs");
const path = require("path");
const { dimensionsForImage } = require("./image-metadata");
const { projectSlug } = require("./project-pages");
const { setSecurityHeaders } = require("./security");

const rootDir = path.resolve(__dirname, "..");
const homepagePath = path.join(rootDir, "index.html");
const siteDataPath = path.join(rootDir, "data", "site.json");

const markers = Object.freeze({
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

const canUseResponsiveSource = (src = "") => /^assets\/images\/[^/]+\.jpe?g$/i.test(src);

const responsiveSource = (src, width, extension) => {
  const fileName = src.slice(src.lastIndexOf("/") + 1);
  const baseName = fileName.slice(0, fileName.lastIndexOf("."));
  return `assets/images/responsive/${baseName}-${width}.${extension}`;
};

const originalExtension = (src) => src.toLowerCase().endsWith(".jpeg") ? "jpeg" : "jpg";

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
  const image = `<img src="${escapeHtml(src)}"${canUseResponsiveSource(src) ? ` srcset="${responsiveSource(src, 720, originalExtension(src))} 720w, ${responsiveSource(src, 1200, originalExtension(src))} 1200w" sizes="${sizes}"` : ""} alt="${alt}"${dimensionAttributes} loading="lazy" decoding="async"${cover?.previewPosition ? ` style="object-position:${escapeHtml(cover.previewPosition)}"` : ""}>`;
  if (!canUseResponsiveSource(src)) return image;
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

const renderEditorialCovers = (siteData = {}) => (siteData.albums || [])
  .filter((album) => album?.section === "editorials" && album?.projectPage?.published !== false)
  .map((album) => coverMarkup(album, (album.covers || [])[0], "work-tile"))
  .filter(Boolean)
  .join("\n");

const renderFineArtCovers = (siteData = {}) => (siteData.albums || [])
  .filter((album) => album?.section === "fine-art" && album?.projectPage?.published !== false)
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
  let html = replaceMarkedContent(template, markers.editorials, renderEditorialCovers(siteData));
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
    res.setHeader("cache-control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
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
