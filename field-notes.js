const body = document.body;
const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const archiveRoot = document.querySelector("[data-field-notes-archive]");
const issueRoot = document.querySelector("[data-field-notes-issue]");
const { imageApproval, rotatingImageForIssue } = window.NewsletterRights;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const isUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const issueIdFromUrl = () => new URLSearchParams(window.location.search).get("issue");

const issuePath = (issueId) => `newsletter/data/issues/${encodeURIComponent(issueId)}.json`;

const cleanIssueTitle = (title = "") => String(title)
  .replace(/^Davide Studios:\s*/i, "")
  .replace(/^Monthly Newsletter\s*[—-]\s*/i, "")
  .trim();

const renderCta = (label, url) => {
  if (!isUrl(url)) {
    return "";
  }

  return `<a class="text-link text-link-light" href="${escapeHtml(url)}">${escapeHtml(label || "View source")}</a>`;
};

const renderImage = (image, issue, manifest, slot, officialSourceUrl, credit) => {
  const approval = imageApproval(issue, manifest, { slot, image, officialSourceUrl, credit });
  if (!approval.approved) {
    return "";
  }

  return `
    <figure class="field-image">
      <img src="${escapeHtml(approval.assetUrl)}" alt="${escapeHtml(image.alt || "")}" loading="lazy" decoding="async">
      <figcaption>${escapeHtml(approval.credit)}</figcaption>
    </figure>
  `;
};

const renderArtItem = (item) => `
  <article>
    <p class="field-meta">${escapeHtml(item.institution)} / ${escapeHtml(item.location)} / ${escapeHtml(item.dates)}</p>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.description)}</p>
    <p class="field-why">Why it matters visually: ${escapeHtml(item.whyItMatters)}</p>
    ${renderCta(item.ctaLabel, item.bookingUrl || item.sourceUrl)}
  </article>
`;

const renderIssue = (issue, manifest) => {
  const art = issue.sections.art;
  const fashion = issue.sections.fashion;
  const field = issue.sections.onTheField;
  const fieldImage = rotatingImageForIssue(issue, field);

  document.title = `Field Notes: ${issue.month} ${issue.year} | Davide Solla Studios`;

  issueRoot.innerHTML = `
    <header class="issue-head">
      <div>
        <p class="section-kicker">${escapeHtml(issue.month)} ${escapeHtml(issue.year)}</p>
        <h2>${escapeHtml(cleanIssueTitle(issue.title))}</h2>
        <p>${escapeHtml(issue.openingNote)}</p>
      </div>
    </header>

    <section class="field-section">
      <p class="section-kicker">${escapeHtml(art.label)}</p>
      <p class="field-section-intro">${escapeHtml(art.intro)}</p>
      <article class="field-feature">
        ${renderImage(
          art.featured.image,
          issue,
          manifest,
          "art.featured",
          art.featured.sourceUrl,
          art.featured.image?.credit || art.featured.image?.label || art.featured.image?.recommendedSize || ""
        )}
        <p class="field-meta">${escapeHtml(art.featured.institution)} / ${escapeHtml(art.featured.location)} / ${escapeHtml(art.featured.dates)}</p>
        <h3>${escapeHtml(art.featured.title)}</h3>
        <p>${escapeHtml(art.featured.description)}</p>
        <p class="field-why">Why it matters visually: ${escapeHtml(art.featured.whyItMatters)}</p>
        ${renderCta(art.featured.ctaLabel, art.featured.bookingUrl || art.featured.sourceUrl)}
      </article>
      <div class="field-list">${art.items.map(renderArtItem).join("")}</div>
    </section>

    <section class="field-section">
      <p class="section-kicker">${escapeHtml(fashion.label)}</p>
      <p class="field-section-intro">${escapeHtml(fashion.intro)}</p>
      ${fashion.stories.map((story, index) => `
        <article class="field-story">
          ${renderImage(story.image, issue, manifest, `fashion.stories.${index}`, story.sourceUrl, story.imageCredit)}
          <p class="field-meta">${escapeHtml(story.brand)} / ${escapeHtml(story.releaseTiming)}</p>
          <h3>${escapeHtml(story.title)}</h3>
          <p>${escapeHtml(story.commentary)}</p>
          <p class="field-source">Source visual: ${escapeHtml(story.imageCredit || "Usage pending")}</p>
          ${renderCta("View official source", story.sourceUrl)}
        </article>
      `).join("")}
    </section>

    <section class="field-section">
      <p class="section-kicker">${escapeHtml(field.label)}</p>
      <p class="field-section-intro">${escapeHtml(field.intro)}</p>
      ${renderImage(
        fieldImage,
        issue,
        manifest,
        "onTheField",
        field.cta?.url || issue.site?.websiteUrl,
        fieldImage?.credit || fieldImage?.label || fieldImage?.recommendedSize || ""
      )}
      <article class="field-note">
        <h3>Studio note</h3>
        <p>${escapeHtml(field.note || "")}</p>
        ${field.cta ? renderCta(field.cta.label, field.cta.url) : ""}
      </article>
    </section>
  `;
};

const renderIssueNavigation = (issues, activeIssueId) => {
  const [currentIssue, priorIssue] = issues;
  const visibleIssues = [
    currentIssue && { issue: currentIssue, label: "Current Issue", href: "field-notes.html" },
    priorIssue && { issue: priorIssue, label: "Prior Issue", href: `field-notes.html?issue=${encodeURIComponent(priorIssue.issueId)}` }
  ].filter(Boolean);

  const issueLinks = visibleIssues.map(({ issue, label, href }) => {
    const isActive = issue.issueId === activeIssueId;
    return `
      <a class="archive-link" href="${escapeHtml(href)}" ${isActive ? 'aria-current="page"' : ""}>
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(issue.month)} ${escapeHtml(String(issue.year))}</small>
      </a>
    `;
  });

  if (!priorIssue) {
    issueLinks.push(`
      <div class="archive-link archive-link-muted" aria-disabled="true">
        <span>Prior Issue</span>
        <small>Available next month</small>
      </div>
    `);
  }

  archiveRoot.innerHTML = issueLinks.join("");
};

const setMenuOpen = (isOpen) => {
  body.classList.toggle("menu-open", isOpen);
  header?.classList.toggle("is-open", isOpen);
  menuToggle?.setAttribute("aria-expanded", String(isOpen));
  menuToggle?.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
};

const loadFieldNotes = async () => {
  try {
    const indexResponse = await fetch("newsletter/data/issues/index.json", { cache: "no-store" });

    if (!indexResponse.ok) {
      throw new Error("Field Notes issues could not be loaded.");
    }

    const index = await indexResponse.json();
    const issues = [...(index.issues || [])].sort((a, b) => String(b.issueId).localeCompare(String(a.issueId)));
    const requestedIssueId = issueIdFromUrl();
    const activeIssue = issues.find((issue) => issue.issueId === requestedIssueId) || issues[0];

    if (!activeIssue) {
      throw new Error("No Field Notes issues are available yet.");
    }

    renderIssueNavigation(issues, activeIssue.issueId);

    const issueResponse = await fetch(issuePath(activeIssue.issueId), { cache: "no-store" });

    if (!issueResponse.ok) {
      throw new Error(`${activeIssue.month} ${activeIssue.year} could not be loaded.`);
    }

    const manifestResponse = await fetch(`newsletter/data/sources/${encodeURIComponent(activeIssue.issueId)}.manifest.json`, { cache: "no-store" });
    const [issue, manifest] = await Promise.all([
      issueResponse.json(),
      manifestResponse.ok ? manifestResponse.json() : Promise.resolve(null)
    ]);
    renderIssue(issue, manifest);
  } catch (error) {
    issueRoot.innerHTML = `<p class="field-notes-status">${escapeHtml(error.message)}</p>`;
  }
};

menuToggle?.addEventListener("click", () => setMenuOpen(!body.classList.contains("menu-open")));
nav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    setMenuOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
  }
});

loadFieldNotes();
