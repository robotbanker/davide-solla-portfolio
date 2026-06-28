const previewRoot = document.querySelector("[data-newsletter-preview]");
const statusMessage = document.querySelector("[data-preview-status]");
const issueInput = document.querySelector("[data-issue-input]");
const loadButton = document.querySelector("[data-load-issue]");
const productionLink = document.querySelector("[data-production-link]");
const dataLink = document.querySelector("[data-data-link]");
const sourcesLink = document.querySelector("[data-sources-link]");
const requestedIssue = new URLSearchParams(window.location.search).get("issue");

if (requestedIssue) {
  issueInput.value = requestedIssue;
}

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const isUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const absoluteUrl = (src, baseUrl) => {
  if (!src) {
    return "";
  }

  if (isUrl(src)) {
    return src;
  }

  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(src).replace(/^\/+/, "")}`;
};

const renderCta = (label, url) => {
  if (!isUrl(url)) {
    return `<span class="source-label">${escapeHtml(label || "Source required")}</span>`;
  }

  return `<a class="cta" href="${escapeHtml(url)}">${escapeHtml(label || "View source")}</a>`;
};

const renderImage = (image, issue) => {
  if (image?.src) {
    return `
      <img src="${escapeHtml(absoluteUrl(image.src, issue.site.baseUrl))}" alt="${escapeHtml(image.alt || "")}">
      <p class="image-credit">${escapeHtml(image.credit || image.recommendedSize || "")}</p>
    `;
  }

  return `
    <div class="image-slot" role="img" aria-label="${escapeHtml(image?.alt || "Image placeholder")}">
      <div>
        <strong>${escapeHtml(image?.label || "Image pending")}</strong>
        <p>${escapeHtml(image?.recommendedSize || "Official image required before sending")}</p>
      </div>
    </div>
    <p class="image-credit">${escapeHtml(image?.label || "Image usage pending")}</p>
  `;
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

const renderEvent = (item) => `
  <article>
    <p class="meta">${escapeHtml(item.institution)} / ${escapeHtml(item.location)} / ${escapeHtml(item.dates)}</p>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.description)}</p>
    <p class="why">Why it matters visually: ${escapeHtml(item.whyItMatters)}</p>
    ${renderCta(item.ctaLabel, item.bookingUrl || item.sourceUrl)}
  </article>
`;

const renderIssue = (issue) => {
  const art = issue.sections.art;
  const fashion = issue.sections.fashion;
  const field = issue.sections.onTheField;
  const fieldImage = rotatingImageForIssue(issue, field);

  previewRoot.innerHTML = `
    <header class="newsletter-head">
      <p class="preview-kicker">London / Fashion / Portraiture</p>
      <h1>${escapeHtml(issue.site.brandName)}</h1>
      <h2>Monthly Newsletter — ${escapeHtml(issue.month)} Issue</h2>
      <p class="opening-note">${escapeHtml(issue.openingNote)}</p>
    </header>

    <section class="newsletter-section">
      <p class="preview-kicker">${escapeHtml(art.label)}</p>
      <p class="section-intro">${escapeHtml(art.intro)}</p>
      <article class="feature">
        ${renderImage(art.featured.image, issue)}
        <p class="meta">${escapeHtml(art.featured.institution)} / ${escapeHtml(art.featured.location)} / ${escapeHtml(art.featured.dates)}</p>
        <h3>${escapeHtml(art.featured.title)}</h3>
        <p>${escapeHtml(art.featured.description)}</p>
        <p class="why">Why it matters visually: ${escapeHtml(art.featured.whyItMatters)}</p>
        ${renderCta(art.featured.ctaLabel, art.featured.bookingUrl || art.featured.sourceUrl)}
      </article>
      <div class="event-list">${art.items.map(renderEvent).join("")}</div>
    </section>

    <section class="newsletter-section">
      <p class="preview-kicker">${escapeHtml(fashion.label)}</p>
      <p class="section-intro">${escapeHtml(fashion.intro)}</p>
      ${fashion.stories.map((story) => `
        <article class="story">
          ${renderImage(story.image, issue)}
          <p class="meta">${escapeHtml(story.brand)} / ${escapeHtml(story.releaseTiming)}</p>
          <h3>${escapeHtml(story.title)}</h3>
          <p>${escapeHtml(story.commentary)}</p>
          <p class="image-credit">Source visual: ${escapeHtml(story.imageCredit || "Usage pending")}</p>
          ${renderCta("View official source", story.sourceUrl)}
        </article>
      `).join("")}
    </section>

    <section class="newsletter-section">
      <p class="preview-kicker">${escapeHtml(field.label)}</p>
      <p class="section-intro">${escapeHtml(field.intro)}</p>
      ${renderImage(fieldImage, issue)}
      <article class="field-card">
        <p>${escapeHtml(field.note || "")}</p>
        ${field.cta ? renderCta(field.cta.label, field.cta.url) : ""}
      </article>
    </section>

    <footer class="footer-preview">
      <strong>${escapeHtml(issue.footer.wordmark)}</strong>
      <p>${escapeHtml(issue.site.location)} / <a href="${escapeHtml(issue.site.websiteUrl)}">Website</a> / <a href="${escapeHtml(issue.site.instagramUrl)}">Instagram</a></p>
      <p><a href="${escapeHtml(issue.site.unsubscribeUrl)}">Unsubscribe</a> or <a href="${escapeHtml(issue.site.preferencesUrl)}">manage preferences</a>.</p>
      <p>${escapeHtml(issue.footer.copyright)}</p>
    </footer>
  `;
};

const setLinks = (issueId) => {
  productionLink.href = `newsletter/dist/${issueId}.html`;
  dataLink.href = `newsletter/data/issues/${issueId}.json`;
  sourcesLink.href = `newsletter/data/sources/${issueId}.manifest.json`;
};

const loadIssue = async () => {
  const issueId = issueInput.value.trim() || "2026-07";
  issueInput.value = issueId;
  setLinks(issueId);
  statusMessage.textContent = "Loading issue...";

  try {
    const response = await fetch(`newsletter/data/issues/${encodeURIComponent(issueId)}.json`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Issue ${issueId} could not be loaded.`);
    }

    const issue = await response.json();
    renderIssue(issue);
    statusMessage.textContent = issue.status === "research-approved"
      ? "Research approved. Ready for final production review."
      : `Draft status: ${issue.status}. Not for sending.`;
  } catch (error) {
    previewRoot.innerHTML = "";
    statusMessage.textContent = error.message;
  }
};

loadButton.addEventListener("click", loadIssue);
issueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadIssue();
  }
});

loadIssue();
