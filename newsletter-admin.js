(() => {
const issueSelect = document.querySelector("[data-newsletter-issue-select]");
const loadButton = document.querySelector("[data-newsletter-load-issue]");
const previewLink = document.querySelector("[data-newsletter-preview-link]");
const statusMessage = document.querySelector("[data-newsletter-status]");
const editorRoot = document.querySelector("[data-newsletter-editor-root]");
const editorForm = document.querySelector("[data-newsletter-editor-form]");
const saveSectionButton = document.querySelector("[data-newsletter-save-section]");
const saveAllButton = document.querySelector("[data-newsletter-save-all]");
const buildButton = document.querySelector("[data-newsletter-build-email]");
const dryRunButton = document.querySelector("[data-newsletter-dry-run]");
const sendButton = document.querySelector("[data-newsletter-send-email]");
const sectionTabs = Array.from(document.querySelectorAll("[data-newsletter-section-tab]"));

let issues = [];
let currentIssue = null;
let currentManifest = null;
let currentValidationModes = null;
let currentRevision = "";
let activeSection = "overview";
let newsletterLoaded = false;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

const setStatus = (message) => {
  statusMessage.textContent = message;
};

if (!issueSelect || !editorRoot || !editorForm) {
  throw new Error("Newsletter admin panel is missing required markup.");
}

const field = ({ name, label, value = "", type = "text", full = false }) => `
  <label class="field${full ? " full" : ""}">
    <span class="field-label">${escapeHtml(label)}</span>
    <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}">
  </label>
`;

const checkbox = ({ name, label, checked = false }) => `
  <label class="field checkbox">
    <input name="${escapeHtml(name)}" type="checkbox"${checked ? " checked" : ""}>
    <span class="field-label">${escapeHtml(label)}</span>
  </label>
`;

const textarea = ({ name, label, value = "", full = true, json = false, rows = 5 }) => `
  <label class="field${full ? " full" : ""}">
    <span class="field-label">${escapeHtml(label)}</span>
    <textarea name="${escapeHtml(name)}" rows="${rows}"${json ? " data-json" : ""}>${escapeHtml(value)}</textarea>
  </label>
`;

const jsonTextarea = (name, label, value) => textarea({
  name,
  label,
  value: JSON.stringify(value || {}, null, 2),
  json: true,
  rows: 8
});

const sectionTitle = (title, copy) => `
  <div class="section-title">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(copy)}</p>
  </div>
`;

const formValue = (name) => {
  const element = editorForm.elements[name];
  return element ? element.value.trim() : "";
};

const formChecked = (name) => {
  const element = editorForm.elements[name];
  return element ? element.checked : false;
};

const parseJsonField = (name, fallback) => {
  const element = editorForm.elements[name];

  if (!element) {
    return fallback;
  }

  try {
    return element.value.trim() ? JSON.parse(element.value) : fallback;
  } catch (error) {
    throw new Error(`${name} must be valid JSON.`);
  }
};

const newsletterApi = async (action, options = {}) => {
  const token = sessionStorage.getItem("davide-admin-session") || "";
  const response = await fetch(`/api/admin?action=${action}`, {
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.statusCode = response.status;
    error.code = payload.code;
    error.currentRevision = payload.currentRevision;
    error.validation = payload.validation;
    throw error;
  }

  return payload;
};

const renderIssueOptions = () => {
  issueSelect.innerHTML = issues.map((issue) => `
    <option value="${escapeHtml(issue.issueId)}">${escapeHtml(issue.issueId)} - ${escapeHtml(issue.title || issue.month || "Untitled")}</option>
  `).join("");
};

const setActiveSection = (section) => {
  if (currentIssue) {
    collectActiveSection();
  }

  activeSection = section;
  sectionTabs.forEach((tab) => {
    tab.setAttribute("aria-pressed", String(tab.dataset.newsletterSectionTab === activeSection));
  });
  renderEditor();
};

const renderOverview = () => {
  const issue = currentIssue;

  editorRoot.innerHTML = `
    ${sectionTitle("Overview", "Edit issue metadata, opening note, site links, research status and the separate public-publishing decision.")}
    <div class="field-grid three">
      ${field({ name: "status", label: "Status", value: issue.status })}
      ${field({ name: "month", label: "Month", value: issue.month })}
      ${field({ name: "year", label: "Year", value: issue.year })}
      ${checkbox({ name: "allowPlaceholders", label: "Allow placeholders", checked: issue.allowPlaceholders })}
      ${checkbox({ name: "publication.published", label: "Publish this issue at its stable Field Notes URL", checked: issue.publication?.status === "published" })}
      ${field({ name: "title", label: "Title", value: issue.title, full: true })}
      ${textarea({ name: "preheader", label: "Preheader", value: issue.preheader, rows: 3 })}
      ${textarea({ name: "openingNote", label: "Opening note", value: issue.openingNote, rows: 5 })}
    </div>

    <div class="fieldset">
      <h3>Site links</h3>
      <div class="field-grid">
        ${field({ name: "site.brandName", label: "Brand name", value: issue.site?.brandName })}
        ${field({ name: "site.location", label: "Location", value: issue.site?.location })}
        ${field({ name: "site.baseUrl", label: "Base URL", value: issue.site?.baseUrl, full: true })}
        ${field({ name: "site.websiteUrl", label: "Website URL", value: issue.site?.websiteUrl })}
        ${field({ name: "site.instagramUrl", label: "Instagram URL", value: issue.site?.instagramUrl })}
        ${field({ name: "site.unsubscribeUrl", label: "Unsubscribe URL", value: issue.site?.unsubscribeUrl })}
        ${field({ name: "site.preferencesUrl", label: "Preferences URL", value: issue.site?.preferencesUrl })}
      </div>
    </div>

    <div class="fieldset">
      <h3>Research</h3>
      <div class="field-grid">
        ${field({ name: "research.dateChecked", label: "Date checked", value: issue.research?.dateChecked })}
        ${field({ name: "research.validationStatus", label: "Validation status", value: issue.research?.validationStatus })}
        ${textarea({ name: "research.notes", label: "Research notes", value: issue.research?.notes, rows: 5 })}
      </div>
    </div>
  `;
};

const renderArtItem = (item, index) => `
  <article class="repeat-item" data-repeat="art-item" data-index="${index}">
    <div class="repeat-heading">
      <div>
        <small>Supporting event ${index + 1}</small>
        <h4>${escapeHtml(item.title || "Untitled event")}</h4>
      </div>
      <button type="button" class="danger" data-remove-art-item="${index}">Remove</button>
    </div>
    <div class="field-grid">
      ${field({ name: `art.items.${index}.title`, label: "Title", value: item.title })}
      ${field({ name: `art.items.${index}.institution`, label: "Institution", value: item.institution })}
      ${field({ name: `art.items.${index}.dates`, label: "Dates", value: item.dates })}
      ${field({ name: `art.items.${index}.location`, label: "Location", value: item.location })}
      ${field({ name: `art.items.${index}.sourceUrl`, label: "Source URL", value: item.sourceUrl })}
      ${field({ name: `art.items.${index}.bookingUrl`, label: "Booking URL", value: item.bookingUrl })}
      ${field({ name: `art.items.${index}.ctaLabel`, label: "CTA label", value: item.ctaLabel })}
      ${textarea({ name: `art.items.${index}.description`, label: "Description", value: item.description, rows: 5 })}
      ${textarea({ name: `art.items.${index}.whyItMatters`, label: "Why it matters visually", value: item.whyItMatters, rows: 4 })}
    </div>
  </article>
`;

const renderArt = () => {
  const art = currentIssue.sections.art;
  const feature = art.featured || {};

  editorRoot.innerHTML = `
    ${sectionTitle("01 Art", "Edit the art section heading, featured event and supporting London listings.")}
    <div class="field-grid">
      ${field({ name: "art.label", label: "Section label", value: art.label })}
      ${textarea({ name: "art.intro", label: "Section intro", value: art.intro, rows: 4 })}
    </div>

    <div class="fieldset">
      <h3>Featured event</h3>
      <div class="field-grid">
        ${field({ name: "art.featured.title", label: "Title", value: feature.title })}
        ${field({ name: "art.featured.institution", label: "Institution", value: feature.institution })}
        ${field({ name: "art.featured.dates", label: "Dates", value: feature.dates })}
        ${field({ name: "art.featured.location", label: "Location", value: feature.location })}
        ${field({ name: "art.featured.sourceUrl", label: "Source URL", value: feature.sourceUrl })}
        ${field({ name: "art.featured.bookingUrl", label: "Booking URL", value: feature.bookingUrl })}
        ${field({ name: "art.featured.ctaLabel", label: "CTA label", value: feature.ctaLabel })}
        ${textarea({ name: "art.featured.description", label: "Description", value: feature.description, rows: 5 })}
        ${textarea({ name: "art.featured.whyItMatters", label: "Why it matters visually", value: feature.whyItMatters, rows: 4 })}
        ${jsonTextarea("art.featured.image", "Featured image JSON", feature.image)}
      </div>
    </div>

    <div class="fieldset">
      <h3>Supporting events</h3>
      <div class="repeat-list">
        ${(art.items || []).map(renderArtItem).join("")}
      </div>
      <button type="button" class="add-row" data-add-art-item>Add event</button>
    </div>
  `;
};

const renderFashionStory = (story, index) => `
  <article class="repeat-item" data-repeat="fashion-story" data-index="${index}">
    <div class="repeat-heading">
      <div>
        <small>Fashion story ${index + 1}</small>
        <h4>${escapeHtml(story.brand || story.title || "Untitled story")}</h4>
      </div>
      <button type="button" class="danger" data-remove-fashion-story="${index}">Remove</button>
    </div>
    <div class="field-grid">
      ${field({ name: `fashion.stories.${index}.brand`, label: "Brand", value: story.brand })}
      ${field({ name: `fashion.stories.${index}.title`, label: "Title", value: story.title })}
      ${field({ name: `fashion.stories.${index}.releaseTiming`, label: "Release timing", value: story.releaseTiming })}
      ${field({ name: `fashion.stories.${index}.sourceUrl`, label: "Source URL", value: story.sourceUrl })}
      ${textarea({ name: `fashion.stories.${index}.commentary`, label: "Commentary", value: story.commentary, rows: 6 })}
      ${textarea({ name: `fashion.stories.${index}.imageCredit`, label: "Image credit", value: story.imageCredit, rows: 3 })}
      ${jsonTextarea(`fashion.stories.${index}.image`, "Image JSON", story.image)}
    </div>
  </article>
`;

const renderFashion = () => {
  const fashion = currentIssue.sections.fashion;

  editorRoot.innerHTML = `
    ${sectionTitle("02 Fashion", "Edit campaign stories and image details selected for visual direction.")}
    <div class="field-grid">
      ${field({ name: "fashion.label", label: "Section label", value: fashion.label })}
      ${textarea({ name: "fashion.intro", label: "Section intro", value: fashion.intro, rows: 4 })}
    </div>

    <div class="fieldset">
      <h3>Stories</h3>
      <div class="repeat-list">
        ${(fashion.stories || []).map(renderFashionStory).join("")}
      </div>
      <button type="button" class="add-row" data-add-fashion-story>Add story</button>
    </div>
  `;
};

const renderField = () => {
  const fieldSection = currentIssue.sections.onTheField;

  editorRoot.innerHTML = `
    ${sectionTitle("03 On the Field", "Edit the studio-led note and the rotating Davide Studios image pool.")}
    <div class="field-grid">
      ${field({ name: "field.label", label: "Section label", value: fieldSection.label })}
      ${textarea({ name: "field.intro", label: "Section intro", value: fieldSection.intro, rows: 4 })}
      ${textarea({ name: "field.note", label: "Studio note", value: fieldSection.note, rows: 5 })}
      ${field({ name: "field.cta.label", label: "CTA label", value: fieldSection.cta?.label })}
      ${field({ name: "field.cta.url", label: "CTA URL", value: fieldSection.cta?.url })}
      ${jsonTextarea("field.image", "Optional fixed image JSON", fieldSection.image || {})}
      ${jsonTextarea("field.imageRotation", "Image rotation JSON", fieldSection.imageRotation || {})}
    </div>
  `;
};

const renderFooter = () => {
  const footer = currentIssue.footer || {};

  editorRoot.innerHTML = `
    ${sectionTitle("Footer", "Edit the wordmark and footer copyright used in the rendered email.")}
    <div class="field-grid">
      ${field({ name: "footer.wordmark", label: "Wordmark", value: footer.wordmark })}
      ${field({ name: "footer.copyright", label: "Copyright", value: footer.copyright })}
    </div>
  `;
};

const renderJson = () => {
  editorRoot.innerHTML = `
    ${sectionTitle("Full JSON", "Advanced editor for the complete issue object. Save only after checking the JSON is valid.")}
    <div class="field-grid">
      ${textarea({ name: "fullJson", label: "Issue JSON", value: JSON.stringify(currentIssue, null, 2), json: true, rows: 28 })}
    </div>
  `;
};

const renderEditor = () => {
  if (!currentIssue) {
    editorRoot.innerHTML = "";
    return;
  }

  if (activeSection === "overview") renderOverview();
  if (activeSection === "art") renderArt();
  if (activeSection === "fashion") renderFashion();
  if (activeSection === "field") renderField();
  if (activeSection === "footer") renderFooter();
  if (activeSection === "json") renderJson();
};

const collectOverview = () => {
  currentIssue.status = formValue("status");
  currentIssue.allowPlaceholders = formChecked("allowPlaceholders");
  currentIssue.publication = {
    ...(currentIssue.publication || {}),
    status: formChecked("publication.published") ? "published" : "draft"
  };
  currentIssue.month = formValue("month");
  currentIssue.year = formValue("year");
  currentIssue.title = formValue("title");
  currentIssue.preheader = formValue("preheader");
  currentIssue.openingNote = formValue("openingNote");
  currentIssue.site = {
    ...(currentIssue.site || {}),
    brandName: formValue("site.brandName"),
    location: formValue("site.location"),
    baseUrl: formValue("site.baseUrl"),
    websiteUrl: formValue("site.websiteUrl"),
    instagramUrl: formValue("site.instagramUrl"),
    unsubscribeUrl: formValue("site.unsubscribeUrl"),
    preferencesUrl: formValue("site.preferencesUrl")
  };
  currentIssue.research = {
    ...(currentIssue.research || {}),
    dateChecked: formValue("research.dateChecked"),
    validationStatus: formValue("research.validationStatus"),
    notes: formValue("research.notes")
  };
};

const collectArtItems = () => Array.from(editorRoot.querySelectorAll("[data-repeat='art-item']")).map((item) => {
  const index = item.dataset.index;
  return {
    title: formValue(`art.items.${index}.title`),
    institution: formValue(`art.items.${index}.institution`),
    dates: formValue(`art.items.${index}.dates`),
    location: formValue(`art.items.${index}.location`),
    description: formValue(`art.items.${index}.description`),
    sourceUrl: formValue(`art.items.${index}.sourceUrl`),
    bookingUrl: formValue(`art.items.${index}.bookingUrl`),
    ctaLabel: formValue(`art.items.${index}.ctaLabel`),
    whyItMatters: formValue(`art.items.${index}.whyItMatters`)
  };
});

const collectArt = () => {
  currentIssue.sections.art = {
    ...(currentIssue.sections.art || {}),
    label: formValue("art.label"),
    intro: formValue("art.intro"),
    featured: {
      ...(currentIssue.sections.art?.featured || {}),
      title: formValue("art.featured.title"),
      institution: formValue("art.featured.institution"),
      dates: formValue("art.featured.dates"),
      location: formValue("art.featured.location"),
      description: formValue("art.featured.description"),
      sourceUrl: formValue("art.featured.sourceUrl"),
      bookingUrl: formValue("art.featured.bookingUrl"),
      ctaLabel: formValue("art.featured.ctaLabel"),
      whyItMatters: formValue("art.featured.whyItMatters"),
      image: parseJsonField("art.featured.image", {})
    },
    items: collectArtItems()
  };
};

const collectFashionStories = () => Array.from(editorRoot.querySelectorAll("[data-repeat='fashion-story']")).map((item) => {
  const index = item.dataset.index;
  return {
    brand: formValue(`fashion.stories.${index}.brand`),
    title: formValue(`fashion.stories.${index}.title`),
    releaseTiming: formValue(`fashion.stories.${index}.releaseTiming`),
    commentary: formValue(`fashion.stories.${index}.commentary`),
    sourceUrl: formValue(`fashion.stories.${index}.sourceUrl`),
    imageCredit: formValue(`fashion.stories.${index}.imageCredit`),
    image: parseJsonField(`fashion.stories.${index}.image`, {})
  };
});

const collectFashion = () => {
  currentIssue.sections.fashion = {
    ...(currentIssue.sections.fashion || {}),
    label: formValue("fashion.label"),
    intro: formValue("fashion.intro"),
    stories: collectFashionStories()
  };
};

const collectField = () => {
  const image = parseJsonField("field.image", {});
  currentIssue.sections.onTheField = {
    ...(currentIssue.sections.onTheField || {}),
    label: formValue("field.label"),
    intro: formValue("field.intro"),
    note: formValue("field.note"),
    cta: {
      label: formValue("field.cta.label"),
      url: formValue("field.cta.url")
    },
    imageRotation: parseJsonField("field.imageRotation", {})
  };

  if (Object.keys(image).length) {
    currentIssue.sections.onTheField.image = image;
  } else {
    delete currentIssue.sections.onTheField.image;
  }
};

const collectFooter = () => {
  currentIssue.footer = {
    ...(currentIssue.footer || {}),
    wordmark: formValue("footer.wordmark"),
    copyright: formValue("footer.copyright")
  };
};

const collectJson = () => {
  currentIssue = parseJsonField("fullJson", currentIssue);
};

const collectActiveSection = () => {
  if (!currentIssue || !editorRoot.childElementCount) {
    return;
  }

  if (activeSection === "overview") collectOverview();
  if (activeSection === "art") collectArt();
  if (activeSection === "fashion") collectFashion();
  if (activeSection === "field") collectField();
  if (activeSection === "footer") collectFooter();
  if (activeSection === "json") collectJson();
};

const validationSummary = (validation) => {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];

  if (errors.length) {
    return `Saved with ${errors.length} validation error${errors.length === 1 ? "" : "s"}.`;
  }

  if (warnings.length) {
    return `Saved with ${warnings.length} validation warning${warnings.length === 1 ? "" : "s"}.`;
  }

  return "Saved. No validation issues.";
};

const applyValidationControls = () => {
  const liveBlocked = (currentValidationModes?.liveSend?.errors || []).length > 0;
  const dryRunBlocked = (currentValidationModes?.dryRun?.errors || []).length > 0;
  sendButton.disabled = liveBlocked;
  sendButton.title = liveBlocked ? "Resolve the live-send validation blockers first." : "";
  dryRunButton.disabled = dryRunBlocked;
  dryRunButton.title = dryRunBlocked ? "Resolve the dry-run validation blockers first." : "";
};

const loadIssues = async () => {
  const payload = await newsletterApi("newsletterIssues");
  issues = payload.issues || [];
  renderIssueOptions();
  if (issues.length) {
    issueSelect.value = issues[issues.length - 1].issueId;
  }
};

const loadIssue = async (issueId = issueSelect.value) => {
  if (!issueId) {
    setStatus("No newsletter issue is available.");
    return;
  }

  setStatus(`Loading ${issueId}...`);
  const payload = await newsletterApi(`newsletterIssue&issueId=${encodeURIComponent(issueId)}`);
  if (!payload.revision) {
    throw new Error("The newsletter revision is missing. Reload the admin page before editing.");
  }
  currentIssue = clone(payload.issue);
  currentManifest = clone(payload.manifest);
  currentValidationModes = clone(payload.validationModes);
  currentRevision = payload.revision;
  issueSelect.value = currentIssue.issueId;
  previewLink.href = `newsletter-preview.html?issue=${encodeURIComponent(currentIssue.issueId)}`;
  const liveErrors = currentValidationModes?.liveSend?.errors?.length || 0;
  setStatus(liveErrors
    ? `Loaded ${currentIssue.issueId}. Live send blocked by ${liveErrors} validation issue${liveErrors === 1 ? "" : "s"}.`
    : `Loaded ${currentIssue.issueId}. Ready for live-send review.`);
  renderEditor();
  applyValidationControls();
};

const saveIssue = async () => {
  collectActiveSection();
  setStatus(`Saving ${currentIssue.issueId}...`);
  const payload = await newsletterApi(`newsletterIssue&issueId=${encodeURIComponent(currentIssue.issueId)}`, {
    method: "POST",
    body: JSON.stringify({
      issue: currentIssue,
      manifest: currentManifest,
      revision: currentRevision
    })
  });
  if (!payload.revision) {
    throw new Error("The saved newsletter revision is missing. Reload the issue before making another change.");
  }
  currentIssue = clone(payload.issue);
  currentManifest = clone(payload.manifest);
  currentValidationModes = clone(payload.validationModes);
  currentRevision = payload.revision;
  issues = payload.issues || issues;
  renderIssueOptions();
  issueSelect.value = currentIssue.issueId;
  renderEditor();
  setStatus(validationSummary(payload.validation));
  applyValidationControls();
};

const buildEmail = async () => {
  await saveIssue();
  setStatus(`Building ${currentIssue.issueId}...`);
  const payload = await newsletterApi(`newsletterBuild&issueId=${encodeURIComponent(currentIssue.issueId)}`, {
    method: "POST",
    body: "{}"
  });
  setStatus(`Built ${payload.output}.`);
};

const dryRunEmail = async () => {
  await saveIssue();
  dryRunButton.disabled = true;
  setStatus(`Sending dry run for ${currentIssue.issueId}...`);

  try {
    const payload = await newsletterApi(`newsletterDryRun&issueId=${encodeURIComponent(currentIssue.issueId)}`, {
      method: "POST",
      body: "{}"
    });
    const delivery = payload.delivery || {};
    setStatus(`Dry run sent to ${delivery.recipient || "davidesolla@outlook.it"} via ${delivery.provider || "email provider"}.`);
  } finally {
    applyValidationControls();
  }
};

const sendEmail = async () => {
  await saveIssue();
  const sendRevision = currentRevision;
  const confirmation = window.prompt(`Type ${currentIssue.issueId} to send this issue now.`);

  if (confirmation !== currentIssue.issueId) {
    setStatus("Send cancelled.");
    return;
  }

  sendButton.disabled = true;
  setStatus(`Sending ${currentIssue.issueId}...`);

  try {
    const payload = await newsletterApi(`newsletterSend&issueId=${encodeURIComponent(currentIssue.issueId)}`, {
      method: "POST",
      body: JSON.stringify({ confirmation, revision: sendRevision })
    });
    const delivery = payload.delivery || {};
    const provider = delivery.provider || (delivery.id ? "resend" : "email provider");
    const detail = delivery.id
      ? `Broadcast ${delivery.id}.`
      : `${delivery.recipientCount || "Configured"} recipient${delivery.recipientCount === 1 ? "" : "s"}.`;
    setStatus(`Sent ${currentIssue.issueId} via ${provider}. ${detail}`);
  } finally {
    applyValidationControls();
  }
};

const initialiseNewsletter = async () => {
  if (newsletterLoaded || !sessionStorage.getItem("davide-admin-session")) {
    return;
  }

  newsletterLoaded = true;
  try {
    await loadIssues();
    await loadIssue(issueSelect.value || issues.at(-1)?.issueId);
  } catch (error) {
    newsletterLoaded = false;
    setStatus(error.message);
  }
};

const addArtItem = () => {
  collectActiveSection();
  currentIssue.sections.art.items = currentIssue.sections.art.items || [];
  currentIssue.sections.art.items.push({
    title: "",
    institution: "",
    dates: "",
    location: "",
    description: "",
    sourceUrl: "",
    bookingUrl: "",
    ctaLabel: "View programme",
    whyItMatters: ""
  });
  renderEditor();
};

const addFashionStory = () => {
  collectActiveSection();
  currentIssue.sections.fashion.stories = currentIssue.sections.fashion.stories || [];
  currentIssue.sections.fashion.stories.push({
    brand: "",
    title: "",
    releaseTiming: "",
    commentary: "",
    sourceUrl: "",
    imageCredit: "",
    image: {
      type: "official-page-image",
      src: "",
      label: "",
      alt: "",
      recommendedSize: "1200 x 900 px"
    }
  });
  renderEditor();
};

editorRoot.addEventListener("click", (event) => {
  const target = event.target;

  if (target.matches("[data-add-art-item]")) {
    addArtItem();
  }

  if (target.matches("[data-add-fashion-story]")) {
    addFashionStory();
  }

  if (target.matches("[data-remove-art-item]")) {
    collectActiveSection();
    currentIssue.sections.art.items.splice(Number(target.dataset.removeArtItem), 1);
    renderEditor();
  }

  if (target.matches("[data-remove-fashion-story]")) {
    collectActiveSection();
    currentIssue.sections.fashion.stories.splice(Number(target.dataset.removeFashionStory), 1);
    renderEditor();
  }
});

sectionTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveSection(tab.dataset.newsletterSectionTab));
});

document.querySelector("[data-admin-tab='newsletter']")?.addEventListener("click", () => {
  initialiseNewsletter();
});

loadButton.addEventListener("click", () => loadIssue());
saveSectionButton.addEventListener("click", () => saveIssue().catch((error) => setStatus(error.message)));
saveAllButton.addEventListener("click", () => saveIssue().catch((error) => setStatus(error.message)));
buildButton.addEventListener("click", () => buildEmail().catch((error) => setStatus(error.message)));
dryRunButton.addEventListener("click", () => dryRunEmail().catch((error) => {
  if (dryRunButton) {
    dryRunButton.disabled = false;
  }

  setStatus(error.message);
}));
sendButton.addEventListener("click", () => sendEmail().catch((error) => {
  if (sendButton) {
    sendButton.disabled = false;
  }

  setStatus(error.message);
}));

initialiseNewsletter();
})();
