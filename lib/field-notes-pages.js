const fs = require("fs");
const path = require("path");
const { isNewsletterPublicationReady } = require("./newsletter-publication");
const { setSecurityHeaders } = require("./security");
const {
  imageSource,
  renderedImageSlots,
  rotatingImageForIssue
} = require("../newsletter-rights");

const rootDir = path.resolve(__dirname, "..");
const issueIndexPath = path.join(rootDir, "newsletter", "data", "issues", "index.json");
const issueDir = path.join(rootDir, "newsletter", "data", "issues");
const manifestDir = path.join(rootDir, "newsletter", "data", "sources");
const siteUrl = "https://www.davidesolla.com";
const siteName = "Davide Solla Studios";
const issueIdPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const fallbackSocialImage = Object.freeze({
  url: `${siteUrl}/assets/images/soho-01.jpg`,
  alt: "Davide Studios Soho fashion image from the website archive"
});

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const cleanText = (value = "", maxLength = 1000) => String(value || "").trim().slice(0, maxLength);

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");

const isFieldNotesIssueId = (value) => issueIdPattern.test(String(value || ""));

const safeHttpUrl = (value) => {
  try {
    const parsed = new URL(String(value || ""));
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    return parsed.href;
  } catch {
    return "";
  }
};

const normaliseDate = (value) => {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
};

const publicationDates = (issue, indexEntry = {}) => {
  const publishedAt = normaliseDate(
    indexEntry.publishedAt
      || indexEntry.datePublished
      || issue?.publishedAt
  );
  const updatedAt = normaliseDate(
    indexEntry.updatedAt
      || indexEntry.dateModified
      || issue?.updatedAt
  ) || publishedAt;
  return { publishedAt, updatedAt };
};

const listPublishedIssueEntries = (index = {}) => {
  const entries = Array.isArray(index?.issues) ? index.issues : [];
  const counts = entries.reduce((result, entry) => {
    const issueId = cleanText(entry?.issueId, 20);
    if (isFieldNotesIssueId(issueId)) result.set(issueId, (result.get(issueId) || 0) + 1);
    return result;
  }, new Map());

  return entries
    .filter((entry) => {
      const issueId = cleanText(entry?.issueId, 20);
      const publishedAt = normaliseDate(entry?.publishedAt);
      const updatedAt = normaliseDate(entry?.updatedAt || entry?.publishedAt);
      return entry?.status === "research-approved"
        && entry?.publicationStatus === "published"
        && Boolean(publishedAt && updatedAt)
        && isFieldNotesIssueId(issueId)
        && counts.get(issueId) === 1;
    })
    .map((entry) => ({ ...entry, issueId: cleanText(entry.issueId, 20) }))
    .sort((left, right) => right.issueId.localeCompare(left.issueId));
};

const issueMatchesIndex = (issue, entry, manifest) => {
  if (!issue || !entry || issue.issueId !== entry.issueId) return false;
  if (entry.publicationStatus !== "published" || issue.publication?.status !== "published") return false;
  if (!isNewsletterPublicationReady(issue, manifest)) return false;

  const issueYear = Number(issue.year);
  const indexedYear = Number(entry.year);
  if (Number.isFinite(issueYear) && Number.isFinite(indexedYear) && issueYear !== indexedYear) return false;
  if (cleanText(entry.month, 30) && cleanText(issue.month, 30) !== cleanText(entry.month, 30)) return false;
  return true;
};

const loadFieldNotesIndex = () => readJson(issueIndexPath);

const loadIndexedPublication = (indexEntry) => {
  const issueId = indexEntry.issueId;
  const issuePath = path.join(issueDir, `${issueId}.json`);
  if (!fs.existsSync(issuePath)) return null;
  const issue = readJson(issuePath);
  const manifestPath = path.join(manifestDir, `${issueId}.manifest.json`);
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  if (!issueMatchesIndex(issue, indexEntry, manifest)) return null;
  return { indexEntry, issue, manifest };
};

const loadFieldNotesPublications = (index = loadFieldNotesIndex()) => listPublishedIssueEntries(index)
  .map((entry) => {
    try {
      return loadIndexedPublication(entry);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const loadFieldNotesPublication = (issueId, index = loadFieldNotesIndex()) => {
  if (!isFieldNotesIssueId(issueId)) return null;
  const publications = loadFieldNotesPublications(index);
  const publication = publications.find((candidate) => candidate.issue.issueId === issueId);
  if (!publication) return null;
  return {
    ...publication,
    entries: publications.map((candidate) => candidate.indexEntry)
  };
};

const cleanIssueTitle = (title = "") => cleanText(title, 180)
  .replace(/^Davide Studios:\s*/i, "")
  .replace(/^Monthly Newsletter\s*[—-]\s*/i, "")
  .trim();

const socialImageForIssue = (issue) => {
  for (const definition of renderedImageSlots(issue)) {
    const source = imageSource(definition);
    if (source.assetUrl) {
      return {
        url: source.assetUrl,
        alt: cleanText(definition.image?.alt, 300) || fallbackSocialImage.alt
      };
    }
  }
  return fallbackSocialImage;
};

const renderCta = (label, value) => {
  const url = safeHttpUrl(value);
  if (!url) return "";
  return `<a class="text-link text-link-light" href="${escapeHtml(url)}">${escapeHtml(cleanText(label, 100) || "View source")}</a>`;
};

const renderImage = (definition, { eager = false } = {}) => {
  const source = imageSource(definition);
  if (!source.assetUrl) return "";
  const alt = cleanText(definition.image?.alt, 300);
  const credit = escapeHtml(cleanText(source.credit, 600) || "Official source");
  const sourceUrl = safeHttpUrl(source.sourceUrl);
  const caption = sourceUrl
    ? `Source: <a href="${escapeHtml(sourceUrl)}" rel="noreferrer">${credit}</a>`
    : `Source: ${credit}`;
  return `<figure class="field-image">
            <img src="${escapeHtml(source.assetUrl)}" alt="${escapeHtml(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? " fetchpriority=\"high\"" : ""}>
            <figcaption>${caption}</figcaption>
          </figure>`;
};

const renderArtItem = (item = {}) => `<article>
              <p class="field-meta">${escapeHtml(cleanText(item.institution, 200))} / ${escapeHtml(cleanText(item.location, 300))} / ${escapeHtml(cleanText(item.dates, 160))}</p>
              <h3>${escapeHtml(cleanText(item.title, 240))}</h3>
              <p>${escapeHtml(cleanText(item.description, 3000))}</p>
              <p class="field-why">Why it matters visually: ${escapeHtml(cleanText(item.whyItMatters, 2000))}</p>
              ${renderCta(item.ctaLabel, item.bookingUrl || item.sourceUrl)}
            </article>`;

const renderIssueContent = (issue, manifest) => {
  const art = issue.sections.art;
  const fashion = issue.sections.fashion;
  const field = issue.sections.onTheField;
  const fieldImage = rotatingImageForIssue(issue, field);
  const fieldNote = cleanText(field.note, 4000);
  const artDefinition = {
    slot: "art.featured",
    image: art.featured?.image,
    officialSourceUrl: art.featured?.sourceUrl,
    credit: art.featured?.image?.credit || art.featured?.image?.label || art.featured?.image?.recommendedSize || ""
  };
  const fieldNoteCard = fieldNote ? `<article class="field-note">
            <h3>Studio note</h3>
            <p>${escapeHtml(fieldNote)}</p>
            ${field.cta ? renderCta(field.cta.label, field.cta.url) : ""}
          </article>` : "";
  const fieldSection = field ? `<section class="field-section">
          <p class="section-kicker">${escapeHtml(cleanText(field.label, 120))}</p>
          <p class="field-section-intro">${escapeHtml(cleanText(field.intro, 1500))}</p>
          ${renderImage({
            slot: "onTheField",
            image: fieldImage,
            officialSourceUrl: field.cta?.url || issue.site?.websiteUrl,
            credit: fieldImage?.credit || fieldImage?.label || fieldImage?.recommendedSize || ""
          })}
          ${fieldNoteCard}
        </section>` : "";

  return `<header class="issue-head">
          <div>
            <p class="section-kicker">${escapeHtml(cleanText(issue.month, 30))} ${escapeHtml(cleanText(issue.year, 10))}</p>
            <h2>${escapeHtml(cleanIssueTitle(issue.title) || `Field Notes: ${cleanText(issue.month, 30)} ${cleanText(issue.year, 10)}`)}</h2>
            <p>${escapeHtml(cleanText(issue.openingNote, 5000))}</p>
          </div>
        </header>

        <section class="field-section">
          <p class="section-kicker">${escapeHtml(cleanText(art.label, 120))}</p>
          <p class="field-section-intro">${escapeHtml(cleanText(art.intro, 1500))}</p>
          <article class="field-feature">
            ${renderImage(artDefinition, { eager: true })}
            <p class="field-meta">${escapeHtml(cleanText(art.featured?.institution, 200))} / ${escapeHtml(cleanText(art.featured?.location, 300))} / ${escapeHtml(cleanText(art.featured?.dates, 160))}</p>
            <h3>${escapeHtml(cleanText(art.featured?.title, 240))}</h3>
            <p>${escapeHtml(cleanText(art.featured?.description, 3000))}</p>
            <p class="field-why">Why it matters visually: ${escapeHtml(cleanText(art.featured?.whyItMatters, 2000))}</p>
            ${renderCta(art.featured?.ctaLabel, art.featured?.bookingUrl || art.featured?.sourceUrl)}
          </article>
          <div class="field-list">${(art.items || []).map(renderArtItem).join("")}</div>
        </section>

        <section class="field-section">
          <p class="section-kicker">${escapeHtml(cleanText(fashion.label, 120))}</p>
          <p class="field-section-intro">${escapeHtml(cleanText(fashion.intro, 1500))}</p>
          ${(fashion.stories || []).map((story, index) => {
            const definition = {
              slot: `fashion.stories.${index}`,
              image: story.image,
              officialSourceUrl: story.sourceUrl,
              credit: story.imageCredit || ""
            };
            return `<article class="field-story">
            ${renderImage(definition)}
            <p class="field-meta">${escapeHtml(cleanText(story.brand, 200))} / ${escapeHtml(cleanText(story.releaseTiming, 160))}</p>
            <h3>${escapeHtml(cleanText(story.title, 240))}</h3>
            <p>${escapeHtml(cleanText(story.commentary, 3500))}</p>
            ${renderCta("View official source", story.sourceUrl)}
          </article>`;
          }).join("")}
        </section>

        ${fieldSection}`;
};

const renderArchive = (entries, activeIssueId) => entries.map((entry, index) => {
  const current = entry.issueId === activeIssueId;
  const issueLabel = cleanText(entry.month, 30) && cleanText(entry.year, 10)
    ? `${cleanText(entry.month, 30)} ${cleanText(entry.year, 10)}`
    : entry.issueId;
  return `<a class="archive-link" href="/field-notes/${escapeHtml(entry.issueId)}"${current ? " aria-current=\"page\"" : ""}>
                <span>${escapeHtml(issueLabel)}</span>
                <small>${index === 0 ? "Current issue" : (index === 1 ? "Prior issue" : "Archive")}</small>
              </a>`;
}).join("");

const metadataForIssue = (issue, indexEntry, manifest) => {
  const monthYear = `${cleanText(issue.month, 30)} ${cleanText(issue.year, 10)}`.trim();
  const canonical = `${siteUrl}/field-notes/${issue.issueId}`;
  const title = `Field Notes: ${monthYear} | Davide Solla Studios`;
  const description = cleanText(issue.preheader || issue.openingNote, 300);
  const dates = publicationDates(issue, indexEntry);
  return {
    canonical,
    title,
    headline: `Field Notes: ${monthYear}`,
    description,
    ...dates,
    socialImage: socialImageForIssue(issue, manifest)
  };
};

const articleStructuredData = (issue, metadata) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${metadata.canonical}#webpage`,
      url: metadata.canonical,
      name: metadata.title,
      description: metadata.description,
      inLanguage: "en-GB",
      isPartOf: { "@id": `${siteUrl}/#website` },
      primaryImageOfPage: { "@id": `${metadata.canonical}#primary-image` }
    },
    {
      "@type": "Article",
      "@id": `${metadata.canonical}#article`,
      url: metadata.canonical,
      headline: metadata.headline,
      description: metadata.description,
      inLanguage: "en-GB",
      mainEntityOfPage: { "@id": `${metadata.canonical}#webpage` },
      author: { "@id": `${siteUrl}/#person` },
      publisher: { "@id": `${siteUrl}/#organization` },
      datePublished: metadata.publishedAt || undefined,
      dateModified: metadata.updatedAt || metadata.publishedAt || undefined,
      image: {
        "@type": "ImageObject",
        "@id": `${metadata.canonical}#primary-image`,
        url: metadata.socialImage.url,
        caption: metadata.socialImage.alt
      }
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${metadata.canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Field Notes", item: `${siteUrl}/field-notes` },
        { "@type": "ListItem", position: 3, name: metadata.headline, item: metadata.canonical }
      ]
    }
  ]
});

const renderFieldNotesIssue = (issue, manifest, { entries = [], indexEntry = {} } = {}) => {
  const metadata = metadataForIssue(issue, indexEntry, manifest);
  const structuredData = articleStructuredData(issue, metadata);
  const publishedMeta = metadata.publishedAt
    ? `<meta property="article:published_time" content="${escapeHtml(metadata.publishedAt)}">`
    : "";
  const modifiedMeta = metadata.updatedAt
    ? `<meta property="article:modified_time" content="${escapeHtml(metadata.updatedAt)}">`
    : "";

  return `<!doctype html>
<html lang="en-GB" data-analytics="enabled">
  <head>
    <script src="/privacy-consent.js?v=1" defer></script>
    <script src="/google-tag.js?v=3" defer></script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}">
    <meta name="author" content="Davide Solla">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${metadata.canonical}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="${siteName}">
    <meta property="og:url" content="${metadata.canonical}">
    <meta property="og:title" content="${escapeHtml(metadata.title)}">
    <meta property="og:description" content="${escapeHtml(metadata.description)}">
    <meta property="og:image" content="${escapeHtml(metadata.socialImage.url)}">
    <meta property="og:image:alt" content="${escapeHtml(metadata.socialImage.alt)}">
    <meta property="og:locale" content="en_GB">
    ${publishedMeta}
    ${modifiedMeta}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(metadata.title)}">
    <meta name="twitter:description" content="${escapeHtml(metadata.description)}">
    <meta name="twitter:image" content="${escapeHtml(metadata.socialImage.url)}">
    <meta name="twitter:image:alt" content="${escapeHtml(metadata.socialImage.alt)}">
    <link rel="icon" type="image/png" href="/assets/images/favicon.png">
    <link rel="apple-touch-icon" href="/assets/images/favicon.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="theme-color" content="#080807">
    <link rel="stylesheet" href="/styles.css?v=30">
    <link rel="stylesheet" href="/field-notes.css?v=6">
    <script type="application/ld+json">${safeJson(structuredData)}</script>
  </head>
  <body>
    <header class="site-header is-scrolled" data-header>
      <a class="brand" href="/" aria-label="Davide Solla home"><span>Davide Solla</span><small>London / Naples</small></a>
      <div class="header-actions">
        <a class="header-social" href="https://www.instagram.com/davide.studios/" target="_blank" rel="noreferrer" aria-label="Davide Solla on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.3" cy="6.7" r="1.2"></circle></svg></a>
        <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" data-menu-toggle><span></span><span></span></button>
      </div>
      <nav class="site-nav" data-nav aria-label="Main navigation">
        <a href="/#work">Work</a><a href="/#services">Services</a><a href="/#fine-art">Fine Art</a><a href="/#about">About</a><a href="/#contact">Contact</a><a href="/field-notes/${escapeHtml(issue.issueId)}" aria-current="page">Field Notes</a><a href="/client-area.html">Client Area</a><a class="social-link" href="https://www.instagram.com/davide.studios/" target="_blank" rel="noreferrer" aria-label="Davide Solla on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.3" cy="6.7" r="1.2"></circle></svg></a>
      </nav>
    </header>

    <main class="field-notes-page" id="top">
      <section class="field-notes-hero" aria-labelledby="field-notes-title">
        <div class="field-notes-hero-copy">
          <p class="section-kicker">Field Notes</p>
          <h1 id="field-notes-title">Monthly visual notes from Davide Studios.</h1>
          <p>London exhibitions, fashion image-making, and studio-facing references gathered into one monthly edit.</p>
        </div>
        <form id="subscribe" class="newsletter-form field-notes-signup" action="/api/newsletter" method="post" data-newsletter-form data-newsletter-source="field-notes" aria-label="Join Field Notes by email" novalidate>
          <div class="newsletter-fields">
            <label><span>First name <small>optional</small></span><input name="firstName" type="text" autocomplete="given-name" maxlength="80"></label>
            <label><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          </div>
          <label class="newsletter-consent"><input name="consent" type="checkbox" value="yes" required><span>I agree to receive Field Notes emails from Davide Solla Photography. I can unsubscribe at any time.</span></label>
          <label class="form-honeypot" aria-hidden="true" tabindex="-1"><span>Website</span><input name="website" type="text" autocomplete="off" tabindex="-1"></label>
          <button class="submit-button" type="submit" data-newsletter-submit>Join Field Notes</button>
          <p class="newsletter-privacy">One email a month. No resale or third-party list sharing. <a class="inline-privacy-link" href="/privacy">Privacy notice.</a></p>
          <p class="form-status" aria-live="polite" data-newsletter-status></p>
        </form>
      </section>

      <section class="field-notes-shell" aria-label="Field Notes issue archive">
        <aside class="field-notes-archive" aria-label="Issue navigation"><div class="archive-inner"><p class="section-kicker">Issues</p><nav data-field-notes-archive>${renderArchive(entries, issue.issueId)}</nav></div></aside>
        <article class="field-notes-issue" data-field-notes-issue data-field-notes-prerendered>${renderIssueContent(issue, manifest)}</article>
      </section>
    </main>

    <footer class="site-footer"><p>Davide Solla</p><p>Fashion &amp; editorial photography / London</p><a href="/">Back to home</a><a href="/privacy">Privacy</a><button class="footer-button" type="button" data-privacy-settings>Privacy settings</button><a href="#top">Back to top</a></footer>
    <script src="/newsletter-signup.js?v=1"></script>
    <script src="/field-notes.js?v=5"></script>
  </body>
</html>`;
};

const notFoundPage = () => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Field Notes issue not found | ${siteName}</title><link rel="stylesheet" href="/styles.css?v=30"><link rel="stylesheet" href="/field-notes.css?v=6"></head><body><main class="newsletter-confirmation"><section><p class="section-kicker">Field Notes</p><h1>That issue is not available.</h1><p>It may still be in editorial review or the address may be incorrect.</p><a class="text-link text-link-light" href="/field-notes">Read the latest issue</a></section></main></body></html>`;

const endResponse = (req, res, body = "") => res.end(req.method === "HEAD" ? undefined : body);

const redirect = (req, res, statusCode, location) => {
  res.statusCode = statusCode;
  res.setHeader("location", location);
  res.setHeader("cache-control", "no-store");
  endResponse(req, res);
};

const respondNotFound = (req, res) => {
  res.statusCode = 404;
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  endResponse(req, res, notFoundPage());
};

const handleFieldNotesPageRequest = (req, res) => {
  setSecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  const requestUrl = new URL(req.url, siteUrl);

  if (!["GET", "HEAD"].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    endResponse(req, res, "Method not allowed");
    return;
  }

  let index;
  let publications;
  let entries;
  try {
    index = loadFieldNotesIndex();
    publications = loadFieldNotesPublications(index);
    entries = publications.map((publication) => publication.indexEntry);
  } catch {
    respondNotFound(req, res);
    return;
  }

  const pathname = requestUrl.pathname;
  const legacyAlias = pathname === "/field-notes"
    || pathname === "/field-notes.html"
    || requestUrl.searchParams.get("legacy") === "1";
  const legacyIssueId = legacyAlias ? cleanText(requestUrl.searchParams.get("issue"), 20) : "";

  if (pathname === "/field-notes/" || (pathname.startsWith("/field-notes/") && pathname.endsWith("/"))) {
    redirect(req, res, 308, pathname.replace(/\/+$/, "") || "/field-notes");
    return;
  }

  if (legacyAlias) {
    if (legacyIssueId) {
      if (!isFieldNotesIssueId(legacyIssueId) || !entries.some((entry) => entry.issueId === legacyIssueId)) {
        respondNotFound(req, res);
        return;
      }
      redirect(req, res, 308, `/field-notes/${legacyIssueId}`);
      return;
    }

    if (!entries.length) {
      respondNotFound(req, res);
      return;
    }
    redirect(req, res, 307, `/field-notes/${entries[0].issueId}`);
    return;
  }

  const routeMatch = pathname.match(/^\/field-notes\/(\d{4}-(?:0[1-9]|1[0-2]))$/);
  const issueId = routeMatch?.[1] || cleanText(requestUrl.searchParams.get("issueId"), 20);
  if (!isFieldNotesIssueId(issueId)) {
    respondNotFound(req, res);
    return;
  }

  const publication = publications.find((candidate) => candidate.issue.issueId === issueId);

  if (!publication) {
    respondNotFound(req, res);
    return;
  }

  const publicRoute = Boolean(routeMatch) || requestUrl.searchParams.get("public") === "1";
  if (!publicRoute) res.setHeader("x-robots-tag", "noindex, nofollow");
  res.setHeader("cache-control", "no-store");
  res.statusCode = 200;
  endResponse(req, res, renderFieldNotesIssue(publication.issue, publication.manifest, {
    ...publication,
    entries
  }));
};

module.exports = {
  handleFieldNotesPageRequest,
  isFieldNotesIssueId,
  listPublishedIssueEntries,
  loadFieldNotesIndex,
  loadFieldNotesPublication,
  metadataForIssue,
  renderFieldNotesIssue,
  socialImageForIssue
};
