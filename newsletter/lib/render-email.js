const fs = require("fs");
const path = require("path");

const newsletterRoot = path.resolve(__dirname, "..");
const issueDir = path.join(newsletterRoot, "data", "issues");
const sourceDir = path.join(newsletterRoot, "data", "sources");

const tokens = {
  paper: "#0b0a09",
  charcoal: "#080807",
  panel: "#11100e",
  bone: "#151310",
  porcelain: "#f1ede6",
  softInk: "#cfc6bb",
  muted: "#a9a29a",
  accent: "#bca66e",
  line: "rgba(241, 237, 230, 0.16)",
  warmLine: "rgba(188, 166, 110, 0.34)",
  display: "Didot, Bodoni 72, Baskerville, Times New Roman, serif",
  sans: "Avenir Next, Neue Haas Grotesk Text, Helvetica Neue, Arial, sans-serif"
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const loadIssue = (issueId) => readJson(path.join(issueDir, `${issueId}.json`));

const loadManifest = (issueId) => {
  const manifestPath = path.join(sourceDir, `${issueId}.manifest.json`);
  return fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const escapeAttr = (value = "") => escapeHtml(value).replace(/"/g, "&quot;");

const stripTrailingSlash = (value = "") => String(value).replace(/\/+$/, "");

const absoluteUrl = (src, baseUrl) => {
  if (!src) {
    return "";
  }

  if (/^https?:\/\//i.test(src)) {
    return src;
  }

  return `${stripTrailingSlash(baseUrl)}/${String(src).replace(/^\/+/, "")}`;
};

const isUsableUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || ""));

const hasPlaceholder = (value) => {
  if (!value) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasPlaceholder);
  }

  if (typeof value === "object") {
    return value.isPlaceholder || Object.values(value).some(hasPlaceholder);
  }

  return String(value).toLowerCase().includes("placeholder");
};

const wordCount = (value = "") => String(value).trim().split(/\s+/).filter(Boolean).length;

const validationModes = new Set(["preview", "dry-run", "live-send"]);
const canonicalSiteBaseUrl = "https://www.davidesolla.com";

const validationMode = (options = {}) => {
  const requested = options.mode || (options.strict ? "live-send" : "preview");
  if (!validationModes.has(requested)) {
    throw new TypeError(`Unsupported newsletter validation mode: ${requested}`);
  }
  return requested;
};

const rotatingImageForIssue = (issue, field) => {
  if (field?.image?.src) {
    return field.image;
  }

  const pool = field?.imageRotation?.pool || [];
  if (!pool.length) {
    return field?.image;
  }

  const year = Number(String(issue.issueId || "").match(/(\d{4})-\d{2}/)?.[1] || issue.year || 0);
  const month = Number(String(issue.issueId || "").match(/\d{4}-(\d{2})/)?.[1] || 1);
  const index = Math.abs((year * 12) + month - 1) % pool.length;
  return pool[index];
};

const requireField = (errors, value, label) => {
  if (value === undefined || value === null || value === "") {
    errors.push(`${label} is required.`);
  }
};

const validateIssue = (issue, manifest, options = {}) => {
  const errors = [];
  const warnings = [];
  const mode = validationMode(options);
  const strict = mode === "live-send";

  requireField(errors, issue.issueId, "issueId");
  requireField(errors, issue.month, "month");
  requireField(errors, issue.year, "year");
  requireField(errors, issue.openingNote, "openingNote");
  if (strict) requireField(errors, issue.title, "title");

  const openingWords = wordCount(issue.openingNote);
  if (openingWords < 35 || openingWords > 60) {
    warnings.push(`Opening note is ${openingWords} words; target is 35-60.`);
  }

  const art = issue.sections?.art;
  const fashion = issue.sections?.fashion;
  const onTheField = issue.sections?.onTheField;

  requireField(errors, art?.featured?.title, "art.featured.title");
  if (!Array.isArray(art?.items) || art.items.length < 2 || art.items.length > 4) {
    errors.push("art.items must contain 2-4 supporting events, creating 3-5 art listings including the feature.");
  }

  const artListings = [art?.featured, ...(art?.items || [])].filter(Boolean);
  artListings.forEach((item, index) => {
    requireField(errors, item.title, `art listing ${index + 1} title`);
    requireField(errors, item.institution, `art listing ${index + 1} institution`);
    requireField(errors, item.dates, `art listing ${index + 1} dates`);
    requireField(errors, item.location, `art listing ${index + 1} location`);
    requireField(errors, item.description, `art listing ${index + 1} description`);
    requireField(errors, item.whyItMatters, `art listing ${index + 1} whyItMatters`);

    const descriptionWords = wordCount(item.description);
    if (descriptionWords < 40 || descriptionWords > 70) {
      warnings.push(`${item.title} art description is ${descriptionWords} words; target is 40-70.`);
    }

    if (strict && (!isUsableUrl(item.sourceUrl) || !isUsableUrl(item.bookingUrl || item.sourceUrl))) {
      errors.push(`${item.title} needs official source and booking/view URL before sending.`);
    }
  });

  if (!Array.isArray(fashion?.stories) || fashion.stories.length < 3 || fashion.stories.length > 4) {
    errors.push("fashion.stories must contain 3-4 stories.");
  }

  (fashion?.stories || []).forEach((story, index) => {
    requireField(errors, story.brand, `fashion story ${index + 1} brand`);
    requireField(errors, story.title, `fashion story ${index + 1} title`);
    requireField(errors, story.releaseTiming, `fashion story ${index + 1} releaseTiming`);
    requireField(errors, story.commentary, `fashion story ${index + 1} commentary`);

    const commentaryWords = wordCount(story.commentary);
    if (commentaryWords < 50 || commentaryWords > 90) {
      warnings.push(`${story.brand} commentary is ${commentaryWords} words; target is 50-90.`);
    }

    if (strict && !isUsableUrl(story.sourceUrl)) {
      errors.push(`${story.brand} needs an official source URL before sending.`);
    }
  });

  requireField(errors, onTheField?.label, "onTheField.label");
  if (!onTheField?.image?.src && !onTheField?.imageRotation?.pool?.length) {
    errors.push("onTheField needs either image.src or imageRotation.pool.");
  }

  if (strict && hasPlaceholder(issue)) {
    errors.push("Strict validation failed: placeholder content remains in the issue data.");
  }

  if (strict && stripTrailingSlash(issue.site?.baseUrl) !== canonicalSiteBaseUrl) {
    errors.push(`Strict validation failed: site.baseUrl must be ${canonicalSiteBaseUrl}.`);
  }

  if (strict && issue.status !== "research-approved") {
    errors.push("Strict validation failed: issue status must be research-approved.");
  }

  if (strict && issue.research?.validationStatus !== "research-approved") {
    errors.push("Strict validation failed: issue research.validationStatus must be research-approved.");
  }

  if (strict && manifest?.status !== "research-approved") {
    errors.push("Strict validation failed: source manifest status must be research-approved.");
  }

  return { errors, warnings };
};

const text = (copy, style = "") => `<p style="${style}">${escapeHtml(copy)}</p>`;

const sectionRule = () => (
  `<tr><td style="padding:0 0 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:1px solid ${tokens.line};font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>`
);

const renderCta = (label, href) => {
  const safeLabel = escapeHtml(label || "View source");

  if (!isUsableUrl(href)) {
    return `<span style="color:${tokens.muted};font-family:${tokens.sans};font-size:11px;font-weight:700;letter-spacing:0;text-transform:uppercase;">${safeLabel}</span>`;
  }

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="border:1px solid rgba(241,237,230,0.48);padding:13px 17px;">
          <a href="${escapeAttr(href)}" style="color:${tokens.porcelain};display:inline-block;font-family:${tokens.sans};font-size:11px;font-weight:700;line-height:1;text-decoration:none;text-transform:uppercase;">${safeLabel}</a>
        </td>
      </tr>
    </table>
  `;
};

const renderImage = (image, issue, { height = 360, sourceUrl = "" } = {}) => {
  const baseUrl = issue.site?.baseUrl || "";
  const credit = image?.credit || image?.label || "Official source";
  const source = isUsableUrl(sourceUrl)
    ? `<a href="${escapeAttr(sourceUrl)}" style="color:${tokens.muted};text-decoration:underline;">${escapeHtml(credit)}</a>`
    : escapeHtml(credit);
  const sourceCredit = `<p style="color:${tokens.muted};font-family:${tokens.sans};font-size:10px;line-height:1.4;margin:9px 0 0;text-transform:uppercase;">Source: ${source}</p>`;

  if (image?.src) {
    return `
      <img src="${escapeAttr(absoluteUrl(image.src, baseUrl))}" width="620" alt="${escapeAttr(image.alt || "")}" style="border:0;display:block;height:auto;max-width:620px;width:100%;">
      ${sourceCredit}
    `;
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${tokens.bone};border:1px solid ${tokens.warmLine};">
      <tr>
        <td height="${height}" style="height:${height}px;padding:28px;text-align:center;vertical-align:middle;">
          <p style="color:${tokens.accent};font-family:${tokens.sans};font-size:11px;font-weight:700;line-height:1.45;margin:0;text-transform:uppercase;">${escapeHtml(image?.label || "Image pending")}</p>
          <p style="color:${tokens.muted};font-family:${tokens.sans};font-size:12px;line-height:1.5;margin:10px auto 0;max-width:280px;">${escapeHtml(image?.recommendedSize || "Official image required before sending")}</p>
        </td>
      </tr>
    </table>
    ${sourceCredit}
  `;
};

const renderSectionHeading = (label, intro) => `
  <tr>
    <td style="padding:0 0 26px;">
      <p style="color:${tokens.accent};font-family:${tokens.sans};font-size:11px;font-weight:700;line-height:1.35;margin:0 0 13px;text-transform:uppercase;">${escapeHtml(label)}</p>
      ${intro ? text(intro, `color:${tokens.softInk};font-family:${tokens.sans};font-size:15px;line-height:1.65;margin:0;max-width:560px;`) : ""}
    </td>
  </tr>
`;

const renderArt = (issue) => {
  const art = issue.sections.art;
  const feature = art.featured;
  const featureHref = feature.bookingUrl || feature.sourceUrl;

  return `
    ${renderSectionHeading(art.label, art.intro)}
    <tr>
      <td style="padding:0 0 26px;">
        ${renderImage(feature.image, issue, { height: 360, sourceUrl: feature.sourceUrl })}
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 26px;">
        <p style="color:${tokens.muted};font-family:${tokens.sans};font-size:11px;font-weight:700;line-height:1.4;margin:0 0 11px;text-transform:uppercase;">${escapeHtml(feature.institution)} / ${escapeHtml(feature.location)} / ${escapeHtml(feature.dates)}</p>
        <h3 style="color:${tokens.porcelain};font-family:${tokens.display};font-size:32px;font-weight:400;line-height:1.08;margin:0 0 14px;">${escapeHtml(feature.title)}</h3>
        ${text(feature.description, `color:${tokens.softInk};font-family:${tokens.sans};font-size:15px;line-height:1.7;margin:0 0 15px;`)}
        ${text(`Why it matters visually: ${feature.whyItMatters}`, `color:${tokens.muted};font-family:${tokens.sans};font-size:13px;line-height:1.6;margin:0 0 20px;`)}
        ${renderCta(feature.ctaLabel, featureHref)}
      </td>
    </tr>
    ${(art.items || []).map((item) => `
      <tr>
        <td style="border-top:1px solid ${tokens.line};padding:22px 0;">
          <p style="color:${tokens.accent};font-family:${tokens.sans};font-size:10px;font-weight:700;line-height:1.4;margin:0 0 9px;text-transform:uppercase;">${escapeHtml(item.institution)} / ${escapeHtml(item.location)} / ${escapeHtml(item.dates)}</p>
          <h4 style="color:${tokens.porcelain};font-family:${tokens.display};font-size:24px;font-weight:400;line-height:1.12;margin:0 0 10px;">${escapeHtml(item.title)}</h4>
          ${text(item.description, `color:${tokens.softInk};font-family:${tokens.sans};font-size:14px;line-height:1.68;margin:0 0 12px;`)}
          ${text(`Why it matters visually: ${item.whyItMatters}`, `color:${tokens.muted};font-family:${tokens.sans};font-size:12px;line-height:1.55;margin:0 0 14px;`)}
          ${renderCta(item.ctaLabel, item.bookingUrl || item.sourceUrl)}
        </td>
      </tr>
    `).join("")}
  `;
};

const renderFashion = (issue) => {
  const fashion = issue.sections.fashion;

  return `
    ${renderSectionHeading(fashion.label, fashion.intro)}
    ${(fashion.stories || []).map((story) => `
      <tr>
        <td style="padding:0 0 30px;">
          ${renderImage({ ...story.image, credit: story.imageCredit }, issue, { height: 300, sourceUrl: story.sourceUrl })}
          <p style="color:${tokens.accent};font-family:${tokens.sans};font-size:10px;font-weight:700;line-height:1.4;margin:17px 0 9px;text-transform:uppercase;">${escapeHtml(story.brand)} / ${escapeHtml(story.releaseTiming)}</p>
          <h3 style="color:${tokens.porcelain};font-family:${tokens.display};font-size:29px;font-weight:400;line-height:1.1;margin:0 0 12px;">${escapeHtml(story.title)}</h3>
          ${text(story.commentary, `color:${tokens.softInk};font-family:${tokens.sans};font-size:15px;line-height:1.68;margin:0 0 14px;`)}
          ${renderCta("View official source", story.sourceUrl)}
        </td>
      </tr>
    `).join("")}
  `;
};

const renderOnTheField = (issue) => {
  const field = issue.sections.onTheField;
  const fieldImage = rotatingImageForIssue(issue, field);

  return `
    ${renderSectionHeading(field.label, field.intro)}
    <tr>
      <td style="padding:0 0 20px;">${renderImage(fieldImage, issue, { height: 340, sourceUrl: field.cta?.url || issue.site?.websiteUrl })}</td>
    </tr>
    <tr>
      <td style="border-top:1px solid ${tokens.warmLine};padding:22px 0 0;">
        ${field.note ? text(field.note, `color:${tokens.softInk};font-family:${tokens.sans};font-size:14px;line-height:1.68;margin:0 0 18px;`) : ""}
        ${field.cta ? renderCta(field.cta.label || "Visit Davide Studios", field.cta.url) : ""}
      </td>
    </tr>
  `;
};

const renderEmail = (issue) => {
  const title = `${issue.site.brandName}: Monthly Newsletter — ${issue.month} Issue`;
  const preheader = issue.preheader || title;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="background:${tokens.paper};margin:0;padding:0;-webkit-font-smoothing:antialiased;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;mso-hide:all;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${tokens.paper};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:28px 14px 40px;">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="background:${tokens.charcoal};border-collapse:collapse;max-width:680px;width:100%;">
            <tr>
              <td style="padding:42px 30px 34px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-bottom:1px solid ${tokens.warmLine};padding:0 0 26px;">
                      <p style="color:${tokens.accent};font-family:${tokens.sans};font-size:11px;font-weight:700;line-height:1.35;margin:0 0 16px;text-transform:uppercase;">London / Fashion / Portraiture</p>
                      <h1 style="color:${tokens.porcelain};font-family:${tokens.display};font-size:46px;font-weight:400;line-height:1;margin:0 0 14px;">${escapeHtml(issue.site.brandName)}</h1>
                      <h2 style="color:${tokens.softInk};font-family:${tokens.display};font-size:28px;font-weight:400;line-height:1.12;margin:0;">Monthly Newsletter — ${escapeHtml(issue.month)} Issue</h2>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 0 32px;">
                      ${text(issue.openingNote, `color:${tokens.softInk};font-family:${tokens.sans};font-size:16px;line-height:1.75;margin:0;`)}
                    </td>
                  </tr>
                  ${sectionRule()}
                  ${renderArt(issue)}
                  ${sectionRule()}
                  ${renderFashion(issue)}
                  ${sectionRule()}
                  ${renderOnTheField(issue)}
                  <tr>
                    <td style="padding:46px 0 0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${tokens.warmLine};">
                        <tr>
                          <td style="padding:26px 0 0;">
                            <p style="color:${tokens.porcelain};font-family:${tokens.display};font-size:25px;line-height:1;margin:0 0 10px;">${escapeHtml(issue.footer?.wordmark || issue.site.brandName)}</p>
                            <p style="color:${tokens.muted};font-family:${tokens.sans};font-size:12px;line-height:1.7;margin:0 0 12px;">${escapeHtml(issue.site.location)} / <a href="${escapeAttr(issue.site.websiteUrl)}" style="color:${tokens.softInk};text-decoration:none;">Website</a> / <a href="${escapeAttr(issue.site.instagramUrl)}" style="color:${tokens.softInk};text-decoration:none;">Instagram</a></p>
                            <p style="color:${tokens.muted};font-family:${tokens.sans};font-size:11px;line-height:1.6;margin:0 0 8px;"><a href="${escapeAttr(issue.site.unsubscribeUrl)}" style="color:${tokens.muted};text-decoration:underline;">Unsubscribe</a> or <a href="${escapeAttr(issue.site.preferencesUrl)}" style="color:${tokens.muted};text-decoration:underline;">manage preferences</a>.</p>
                            <p style="color:${tokens.muted};font-family:${tokens.sans};font-size:11px;line-height:1.6;margin:0;">${escapeHtml(issue.footer?.copyright || "")}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};

module.exports = {
  loadIssue,
  loadManifest,
  renderEmail,
  validateIssue
};
