const previewRoot = document.querySelector("[data-newsletter-preview]");
const statusMessage = document.querySelector("[data-preview-status]");
const issueInput = document.querySelector("[data-issue-input]");
const loadButton = document.querySelector("[data-load-issue]");
const productionLink = document.querySelector("[data-production-link]");
const dataLink = document.querySelector("[data-data-link]");
const sourcesLink = document.querySelector("[data-sources-link]");
const requestedIssue = new URLSearchParams(window.location.search).get("issue");
const { imageApproval, issueReadyForScopes, renderedImageSlots, rotatingImageForIssue } = window.NewsletterRights;
const adminToken = () => sessionStorage.getItem("davide-admin-session") || "";

if (requestedIssue) {
  issueInput.value = requestedIssue;
}

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const isUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const renderCta = (label, url) => {
  if (!isUrl(url)) {
    return `<span class="source-label">${escapeHtml(label || "Source required")}</span>`;
  }

  return `<a class="cta" href="${escapeHtml(url)}">${escapeHtml(label || "View source")}</a>`;
};

const renderImage = (image, issue, manifest, slot, officialSourceUrl, credit) => {
  const approval = imageApproval(issue, manifest, { slot, image, officialSourceUrl, credit });
  if (approval.approved) {
    return `
      <img src="${escapeHtml(approval.assetUrl)}" alt="${escapeHtml(image.alt || "")}">
      <p class="image-credit">${escapeHtml(approval.credit)}</p>
    `;
  }

  return `
    <div class="image-slot" role="img" aria-label="${escapeHtml(image?.alt || "Image placeholder")}">
      <div>
        <strong>Image withheld</strong>
        <p>Publication rights must be approved before this image can be displayed.</p>
      </div>
    </div>
    <p class="image-credit">Image usage pending</p>
  `;
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

const renderIssue = (issue, manifest) => {
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
        ${renderImage(
          art.featured.image,
          issue,
          manifest,
          "art.featured",
          art.featured.sourceUrl,
          art.featured.image?.credit || art.featured.image?.label || art.featured.image?.recommendedSize || ""
        )}
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
      ${fashion.stories.map((story, index) => `
        <article class="story">
          ${renderImage(story.image, issue, manifest, `fashion.stories.${index}`, story.sourceUrl, story.imageCredit)}
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
      ${renderImage(
        fieldImage,
        issue,
        manifest,
        "onTheField",
        field.cta?.url || issue.site?.websiteUrl,
        fieldImage?.credit || fieldImage?.label || fieldImage?.recommendedSize || ""
      )}
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
  dataLink.href = `/field-notes/${issueId}`;
  sourcesLink.href = "admin.html";
};

const loadIssue = async () => {
  const issueId = issueInput.value.trim() || "2026-07";
  issueInput.value = issueId;
  setLinks(issueId);
  statusMessage.textContent = "Loading issue...";

  try {
    const token = adminToken();
    if (!token) {
      throw new Error("Sign in through the admin editor before opening an editorial preview.");
    }
    const response = await fetch(`/api/admin?action=newsletterIssue&issueId=${encodeURIComponent(issueId)}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.issue) {
      throw new Error(payload.error || `Issue ${issueId} could not be loaded.`);
    }

    const { issue, manifest } = payload;
    renderIssue(issue, manifest);
    const slots = renderedImageSlots(issue);
    const pendingRights = slots.filter((slot) => !imageApproval(issue, manifest, slot, ["public-web", "live-newsletter"]).approved).length;
    productionLink.hidden = !issueReadyForScopes(issue, manifest, ["public-web", "live-newsletter"]);
    if (issue.status !== "research-approved") {
      statusMessage.textContent = `Draft status: ${issue.status}. Not for sending.`;
    } else if (manifest.schemaVersion !== 2 || pendingRights > 0) {
      statusMessage.textContent = `Research approved. Image rights are not cleared for live distribution (${pendingRights || "legacy manifest"}).`;
    } else {
      statusMessage.textContent = "Research approved. Rights recorded; final server-side send validation is still required.";
    }
  } catch (error) {
    previewRoot.innerHTML = "";
    productionLink.hidden = true;
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
