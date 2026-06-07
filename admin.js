const loginPanel = document.querySelector("[data-login-panel]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const adminShell = document.querySelector("[data-admin-shell]");
const adminStatus = document.querySelector("[data-admin-status]");
const albumList = document.querySelector("[data-album-list]");
const albumEditor = document.querySelector("[data-album-editor]");
const sectionEditor = document.querySelector("[data-section-editor]");
const saveButton = document.querySelector("[data-save-site]");
const createAlbumButton = document.querySelector("[data-create-album]");
const logoutButton = document.querySelector("[data-logout]");

let site = null;
let selectedAlbumId = "";

const storageKey = "davide-admin-password";

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const slugify = (value) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "new-album";

const setStatus = (message, target = adminStatus) => {
  target.textContent = message;
};

const password = () => sessionStorage.getItem(storageKey) || "";

const api = async (action, options = {}) => {
  const headers = {
    "x-admin-password": password(),
    ...(options.headers || {})
  };

  const response = await fetch(`/api/admin?action=${action}`, {
    ...options,
    headers
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Admin request failed");
  }

  return body;
};

const selectedAlbum = () => site?.albums.find((album) => album.id === selectedAlbumId);

const styleOptions = (selected = "") => [
  ["", "Standard"],
  ["tile-large", "Large editorial"],
  ["tile-wide", "Wide editorial"],
  ["fine-tall", "Tall fine art"],
  ["fine-portrait", "Portrait fine art"]
].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");

const renderSections = () => {
  const sections = site.sections || {};
  const services = Array.isArray(sections.services) ? sections.services.join("\n") : "";

  sectionEditor.innerHTML = `
    <label>
      <span>Editorial kicker</span>
      <input data-section-field="work.kicker" value="${escapeHtml(sections.work?.kicker)}">
    </label>
    <label>
      <span>Editorial heading</span>
      <input data-section-field="work.heading" value="${escapeHtml(sections.work?.heading)}">
    </label>
    <label>
      <span>Fine art kicker</span>
      <input data-section-field="fineArt.kicker" value="${escapeHtml(sections.fineArt?.kicker)}">
    </label>
    <label>
      <span>Fine art heading</span>
      <input data-section-field="fineArt.heading" value="${escapeHtml(sections.fineArt?.heading)}">
    </label>
    <label class="span-all">
      <span>Fine art intro</span>
      <textarea data-section-field="fineArt.intro">${escapeHtml(sections.fineArt?.intro)}</textarea>
    </label>
    <label class="span-all">
      <span>Services banner, one per line</span>
      <textarea data-section-field="services">${escapeHtml(services)}</textarea>
    </label>
  `;
};

const renderAlbumList = () => {
  albumList.innerHTML = site.albums.map((album) => `
    <button type="button" class="${album.id === selectedAlbumId ? "is-active" : ""}" data-select-album="${escapeHtml(album.id)}">
      ${escapeHtml(album.title || album.id)}
    </button>
  `).join("");
};

const renderMediaRows = (album, type) => {
  const items = album[type] || [];
  const isCover = type === "covers";

  if (!items.length) {
    return `<p class="admin-status">No ${isCover ? "covers" : "images"} yet.</p>`;
  }

  return items.map((item, index) => `
    <div class="media-row" data-media-type="${type}" data-media-index="${index}">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt || album.title)}">
      <div class="media-fields">
        <label class="span-all">
          <span>Image path</span>
          <input data-media-field="src" value="${escapeHtml(item.src)}">
        </label>
        <label>
          <span>Alt text</span>
          <input data-media-field="alt" value="${escapeHtml(item.alt)}">
        </label>
        ${isCover ? `
          <label>
            <span>Cover style</span>
            <select data-media-field="className">${styleOptions(item.className || "")}</select>
          </label>
        ` : `
          <label>
            <span>Preview crop</span>
            <input data-media-field="previewPosition" placeholder="50% 50%" value="${escapeHtml(item.previewPosition)}">
          </label>
        `}
        <div class="row-actions span-all">
          ${isCover ? "" : `<button class="secondary" type="button" data-promote-image="${index}">Use as cover</button>`}
          <button class="danger" type="button" data-remove-media="${type}:${index}">Remove</button>
        </div>
      </div>
    </div>
  `).join("");
};

const renderAlbumEditor = () => {
  const album = selectedAlbum();

  if (!album) {
    albumEditor.innerHTML = "<p>Select or create an album.</p>";
    return;
  }

  albumEditor.innerHTML = `
    <div class="editor-head">
      <div>
        <p class="admin-kicker">${escapeHtml(album.section)}</p>
        <h2>${escapeHtml(album.title || album.id)}</h2>
      </div>
      <div class="row-actions">
        <button class="secondary" type="button" data-duplicate-album>Duplicate</button>
        <button class="danger" type="button" data-delete-album>Delete</button>
      </div>
    </div>

    <div class="album-fields">
      <label>
        <span>Album id</span>
        <input data-album-field="id" value="${escapeHtml(album.id)}">
      </label>
      <label>
        <span>Section</span>
        <select data-album-field="section">
          <option value="editorials" ${album.section === "editorials" ? "selected" : ""}>Editorials</option>
          <option value="fine-art" ${album.section === "fine-art" ? "selected" : ""}>Fine art</option>
        </select>
      </label>
      <label>
        <span>Title</span>
        <input data-album-field="title" value="${escapeHtml(album.title)}">
      </label>
      <label>
        <span>Kicker</span>
        <input data-album-field="kicker" value="${escapeHtml(album.kicker)}">
      </label>
      <label class="span-all">
        <span>Description</span>
        <textarea data-album-field="description">${escapeHtml(album.description)}</textarea>
      </label>
    </div>

    <h3>Covers</h3>
    <div class="media-list">${renderMediaRows(album, "covers")}</div>
    <button class="secondary" type="button" data-add-cover>Add cover slot</button>

    <h3>Sub-gallery images</h3>
    <div class="media-list">${renderMediaRows(album, "images")}</div>

    <form class="upload-box" data-upload-form>
      <label>
        <span>Upload photo</span>
        <input name="photo" type="file" accept="image/*" required>
      </label>
      <label>
        <span>Alt text</span>
        <input name="alt" type="text" value="${escapeHtml(album.title)}">
      </label>
      <label>
        <span>Add as cover</span>
        <select name="asCover">
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </label>
      <button type="submit">Upload and add</button>
    </form>
  `;
};

const render = () => {
  renderSections();
  renderAlbumList();
  renderAlbumEditor();
};

const loadSite = async () => {
  setStatus("Loading content...");
  const response = await api("site");
  site = response.site;
  selectedAlbumId = site.albums[0]?.id || "";
  loginPanel.hidden = true;
  adminShell.hidden = false;
  render();
  setStatus("Content loaded.");
};

const saveSite = async () => {
  setStatus("Saving changes...");
  await api("site", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site })
  });
  setStatus("Saved. If this is production, Vercel will redeploy from GitHub.");
};

const setNested = (target, field, value) => {
  if (field === "services") {
    target.sections.services = value.split("\n").map((item) => item.trim()).filter(Boolean);
    return;
  }

  const [group, key] = field.split(".");
  target.sections[group] = target.sections[group] || {};
  target.sections[group][key] = value;
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sessionStorage.setItem(storageKey, new FormData(loginForm).get("password"));
  setStatus("Checking password...", loginStatus);

  try {
    await loadSite();
    setStatus("", loginStatus);
  } catch (error) {
    sessionStorage.removeItem(storageKey);
    setStatus(error.message, loginStatus);
  }
});

saveButton.addEventListener("click", () => {
  saveSite().catch((error) => setStatus(error.message));
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(storageKey);
  window.location.reload();
});

createAlbumButton.addEventListener("click", () => {
  const title = window.prompt("Album title");

  if (!title) {
    return;
  }

  const id = slugify(title);
  site.albums.push({
    id,
    section: "editorials",
    title,
    kicker: "Editorial story",
    description: "",
    covers: [],
    images: []
  });
  selectedAlbumId = id;
  render();
});

document.addEventListener("click", (event) => {
  const selectButton = event.target.closest("[data-select-album]");
  const removeButton = event.target.closest("[data-remove-media]");
  const promoteButton = event.target.closest("[data-promote-image]");
  const addCoverButton = event.target.closest("[data-add-cover]");

  if (selectButton) {
    selectedAlbumId = selectButton.dataset.selectAlbum;
    render();
    return;
  }

  const album = selectedAlbum();

  if (!album) {
    return;
  }

  if (removeButton) {
    const [type, index] = removeButton.dataset.removeMedia.split(":");
    album[type].splice(Number(index), 1);
    render();
    return;
  }

  if (promoteButton) {
    const image = album.images[Number(promoteButton.dataset.promoteImage)];
    album.covers = album.covers || [];
    album.covers[0] = {
      src: image.src,
      alt: image.alt || album.title,
      className: album.section === "fine-art" ? "fine-portrait" : ""
    };
    render();
    return;
  }

  if (addCoverButton) {
    const firstImage = album.images[0] || {};
    album.covers = album.covers || [];
    album.covers.push({
      src: firstImage.src || "",
      alt: firstImage.alt || album.title,
      className: album.section === "fine-art" ? "fine-portrait" : ""
    });
    render();
    return;
  }

  if (event.target.closest("[data-delete-album]")) {
    if (window.confirm(`Delete ${album.title}?`)) {
      site.albums = site.albums.filter((item) => item.id !== album.id);
      selectedAlbumId = site.albums[0]?.id || "";
      render();
    }
    return;
  }

  if (event.target.closest("[data-duplicate-album]")) {
    const clone = JSON.parse(JSON.stringify(album));
    clone.id = `${album.id}-copy`;
    clone.title = `${album.title} Copy`;
    site.albums.push(clone);
    selectedAlbumId = clone.id;
    render();
  }
});

const handleEditableChange = (event) => {
  if (!site) {
    return;
  }

  const sectionField = event.target.closest("[data-section-field]");
  const albumField = event.target.closest("[data-album-field]");
  const mediaField = event.target.closest("[data-media-field]");

  if (sectionField) {
    setNested(site, sectionField.dataset.sectionField, sectionField.value);
    return;
  }

  const album = selectedAlbum();

  if (!album) {
    return;
  }

  if (albumField) {
    const previousId = album.id;
    album[albumField.dataset.albumField] = albumField.value;

    if (albumField.dataset.albumField === "id") {
      selectedAlbumId = album.id || previousId;
    }
    return;
  }

  if (mediaField) {
    const row = mediaField.closest("[data-media-type]");
    const item = album[row.dataset.mediaType][Number(row.dataset.mediaIndex)];
    item[mediaField.dataset.mediaField] = mediaField.value;
  }
};

document.addEventListener("input", handleEditableChange);
document.addEventListener("change", handleEditableChange);

document.addEventListener("submit", async (event) => {
  const uploadForm = event.target.closest("[data-upload-form]");

  if (!uploadForm) {
    return;
  }

  event.preventDefault();
  const album = selectedAlbum();
  const formData = new FormData(uploadForm);

  try {
    setStatus("Uploading image...");
    const response = await api("upload", {
      method: "POST",
      body: formData
    });
    const image = {
      src: response.src,
      alt: formData.get("alt") || album.title
    };

    album.images.push(image);

    if (formData.get("asCover") === "yes") {
      album.covers.push({
        ...image,
        className: album.section === "fine-art" ? "fine-portrait" : ""
      });
    }

    render();
    setStatus("Image uploaded and added. Save changes to publish the album update.");
  } catch (error) {
    setStatus(error.message);
  }
});

if (password()) {
  loadSite().catch(() => {
    sessionStorage.removeItem(storageKey);
    loginPanel.hidden = false;
    adminShell.hidden = true;
  });
}
