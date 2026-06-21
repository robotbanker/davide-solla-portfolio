const loginPanel = document.querySelector("[data-login-panel]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const adminShell = document.querySelector("[data-admin-shell]");
const adminStatus = document.querySelector("[data-admin-status]");
const albumList = document.querySelector("[data-album-list]");
const albumEditor = document.querySelector("[data-album-editor]");
const sectionEditor = document.querySelector("[data-section-editor]");
const clientEditor = document.querySelector("[data-client-editor]");
const saveButton = document.querySelector("[data-save-site]");
const createAlbumButton = document.querySelector("[data-create-album]");
const createAlbumForm = document.querySelector("[data-create-album-form]");
const logoutButton = document.querySelector("[data-logout]");

let site = null;
let selectedAlbumId = "";
let activeUploadAbort = false;
let dragTarget = null;
let pendingDeleteAlbumId = "";

const storageKey = "davide-admin-session";
const defaultCoverStyle = "fine-portrait";
const coverStyles = [
  ["", "Standard"],
  ["tile-large", "Large editorial"],
  ["tile-wide", "Wide editorial"],
  ["tile-tall", "Tall editorial"],
  ["fine-tall", "Tall fine art"],
  ["fine-portrait", "Portrait fine art"]
];

const albumSections = [
  ["editorials", "Editorials"],
  ["fine-art", "Fine Art"]
];

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const slugify = (value) => String(value)
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "new-album";

const clamp = (value, min = 0, max = 100) => Math.min(Math.max(Number(value) || 0, min), max);

const parsePosition = (value = "50% 50%") => {
  const matches = String(value).match(/(-?\d+(?:\.\d+)?)%?/g) || [];
  return {
    x: clamp(String(matches[0] ?? 50).replace("%", "")),
    y: clamp(String(matches[1] ?? 50).replace("%", ""))
  };
};

const formatPosition = (x, y) => `${Math.round(clamp(x))}% ${Math.round(clamp(y))}%`;

const setStatus = (message, target = adminStatus) => {
  target.textContent = message;
};

const markDirty = () => {
  saveButton.dataset.dirty = "true";
};

const markClean = () => {
  delete saveButton.dataset.dirty;
};

const authToken = () => sessionStorage.getItem(storageKey) || "";

const api = async (action, options = {}) => {
  const headers = {
    authorization: `Bearer ${authToken()}`,
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

const sectionLabel = (section = "editorials") => albumSections.find(([value]) => value === section)?.[1] || "Editorials";

const ensureSiteShape = () => {
  site.sections = site.sections || {};
  site.albums = Array.isArray(site.albums) ? site.albums : [];
  site.clients = Array.isArray(site.clients) ? site.clients : [];
  site.clients.forEach((client, index) => {
    client.id = client.id || `client-${Date.now().toString(36)}-${index + 1}`;
  });
};

const ensureAlbumShape = (album) => {
  album.covers = Array.isArray(album.covers) ? album.covers : [];
  album.images = Array.isArray(album.images) ? album.images : [];
  return album;
};

const imageCountLabel = (album) => {
  const count = album.images?.length || 0;
  return `${count} image${count === 1 ? "" : "s"}`;
};

const coverCountLabel = (album) => {
  const count = album.covers?.length || 0;
  return `${count} cover${count === 1 ? "" : "s"}`;
};

const styleOptions = (selected = "", section = "editorials") => {
  const allowedValues = section === "fine-art"
    ? ["", "fine-tall", "fine-portrait"]
    : ["", "tile-large", "tile-wide", "tile-tall"];

  return coverStyles
    .filter(([value]) => allowedValues.includes(value))
    .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
  .join("");
};

const imageName = (src = "") => {
  const clean = String(src).split("?")[0].split("#")[0];
  return decodeURIComponent(clean.split("/").pop() || "image");
};

const normaliseImageUrlInput = (value = "") => String(value)
  .split(/\n|,/)
  .map((item) => item.trim())
  .filter(Boolean);

const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("Could not read image"));
  reader.readAsDataURL(file);
});

const loadPreviewImage = (file) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Could not prepare image preview"));
  image.src = URL.createObjectURL(file);
});

const resizeImageFile = async (file, maxEdge, quality) => {
  if (!maxEdge || maxEdge === "original" || !file.type.startsWith("image/")) {
    return file;
  }

  let image;

  try {
    image = await loadPreviewImage(file);
  } catch (error) {
    return file;
  }

  const scale = Math.min(1, Number(maxEdge) / Math.max(image.naturalWidth, image.naturalHeight));

  if (scale >= 1) {
    URL.revokeObjectURL(image.src);
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(image.src);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", Number(quality) || 0.86);
  });

  if (!blob) {
    return file;
  }

  const baseName = imageName(file.name).replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
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

const renderClients = () => {
  const clients = site.clients || [];
  const clientCards = clients.map((client) => {
    const hasPassword = Boolean(client.passwordHash || client.password);
    const hasGallery = Boolean(client.lightroomUrl);

    return `
      <article class="client-card" data-client-id="${escapeHtml(client.id)}">
        <div class="client-card-head">
          <div>
            <p class="admin-kicker">${escapeHtml(hasGallery ? "Gallery assigned" : "Awaiting gallery")}</p>
            <h3>${escapeHtml(client.name || client.email || "New client")}</h3>
          </div>
          <span class="client-pill ${hasPassword ? "is-ready" : ""}">${hasPassword ? "Password set" : "Needs password"}</span>
        </div>
        <div class="client-fields">
          <label>
            <span>Client name</span>
            <input data-client-field="name" value="${escapeHtml(client.name || "")}">
          </label>
          <label>
            <span>Email login</span>
            <input data-client-field="email" type="email" autocomplete="off" value="${escapeHtml(client.email || "")}">
          </label>
          <label>
            <span>New password</span>
            <input data-client-password type="password" autocomplete="new-password" placeholder="${hasPassword ? "Leave blank to keep current password" : "Set a password"}">
          </label>
          <label>
            <span>Lightroom gallery link</span>
            <input data-client-field="lightroomUrl" placeholder="https://lightroom.adobe.com/..." value="${escapeHtml(client.lightroomUrl || "")}">
          </label>
        </div>
        <div class="row-actions client-card-actions">
          <a class="button-link secondary ${client.lightroomUrl ? "" : "is-disabled"}" href="${escapeHtml(client.lightroomUrl || "#")}" target="_blank" rel="noreferrer">Open gallery</a>
          <button class="danger" type="button" data-remove-client="${escapeHtml(client.id)}">Remove client</button>
        </div>
      </article>
    `;
  }).join("");

  clientEditor.innerHTML = `
    <div class="client-toolbar">
      <p class="editor-meta">Create private logins and assign the Lightroom link each client will see in the Client Area.</p>
      <button type="button" data-create-client>Create client</button>
    </div>
    <div class="client-grid">
      ${clientCards || `<p class="empty-state">No client logins yet.</p>`}
    </div>
  `;
};

const albumSectionItems = (section) => site.albums.filter((album) => (album.section || "editorials") === section);

const canMoveAlbum = (album, direction) => {
  const sectionAlbums = albumSectionItems(album.section || "editorials");
  const index = sectionAlbums.findIndex((item) => item.id === album.id);
  return direction < 0 ? index > 0 : index >= 0 && index < sectionAlbums.length - 1;
};

const sanitizeAlbumCoverClasses = (album) => {
  const allowedValues = album.section === "fine-art"
    ? ["", "fine-tall", "fine-portrait"]
    : ["", "tile-large", "tile-wide", "tile-tall"];

  ensureAlbumShape(album).covers.forEach((cover) => {
    if (!allowedValues.includes(cover.className || "")) {
      cover.className = "";
    }
  });
};

const renderAlbumItem = (album) => `
  <article class="album-list-item ${album.id === selectedAlbumId ? "is-active" : ""}">
    <button type="button" class="album-select-button" data-select-album="${escapeHtml(album.id)}">
      <span>${escapeHtml(album.title || album.id)}</span>
      <small>${imageCountLabel(album)}</small>
    </button>
    <div class="album-order-actions" aria-label="Move ${escapeHtml(album.title || album.id)} album">
      <button class="secondary" type="button" data-move-album="${escapeHtml(album.id)}:-1" ${canMoveAlbum(album, -1) ? "" : "disabled"}>Up</button>
      <button class="secondary" type="button" data-move-album="${escapeHtml(album.id)}:1" ${canMoveAlbum(album, 1) ? "" : "disabled"}>Down</button>
    </div>
  </article>
`;

const renderAlbumSection = ([section, label]) => {
  const albums = albumSectionItems(section);

  return `
    <section class="album-list-section" data-album-section="${escapeHtml(section)}">
      <h3>${escapeHtml(label)}</h3>
      <div class="album-section-list">
        ${albums.length ? albums.map(renderAlbumItem).join("") : `<p class="empty-state">No ${escapeHtml(label.toLowerCase())} albums yet.</p>`}
      </div>
    </section>
  `;
};

const renderAlbumList = () => {
  albumList.innerHTML = albumSections.map(renderAlbumSection).join("");
};

const renderCropFrame = (item, album, type, index, label) => {
  const position = parsePosition(item.previewPosition);

  return `
    <button class="crop-frame" type="button" data-crop-target="${type}:${index}" aria-label="Reposition ${escapeHtml(label)} preview">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt || album.title)}" style="object-position: ${formatPosition(position.x, position.y)}">
      <span>${escapeHtml(label)}</span>
    </button>
  `;
};

const renderCoverCards = (album) => {
  if (!album.covers.length) {
    return `<p class="empty-state">Choose any gallery image as a cover, or upload new images and add them as covers.</p>`;
  }

  return album.covers.map((cover, index) => {
    const position = parsePosition(cover.previewPosition);

    return `
      <article class="media-card cover-card" data-media-type="covers" data-media-index="${index}">
        ${renderCropFrame(cover, album, "covers", index, `Cover ${index + 1}`)}
        <div class="card-fields">
          <label>
            <span>Alt text</span>
            <input data-media-field="alt" value="${escapeHtml(cover.alt || "")}">
          </label>
          <label>
            <span>Cover shape</span>
            <select data-media-field="className">${styleOptions(cover.className || "", album.section)}</select>
          </label>
          <label>
            <span>Left/right</span>
            <input type="range" min="0" max="100" value="${position.x}" data-position-axis="x">
          </label>
          <label>
            <span>Up/down</span>
            <input type="range" min="0" max="100" value="${position.y}" data-position-axis="y">
          </label>
          <label class="span-all">
            <span>Image source</span>
            <input data-media-field="src" value="${escapeHtml(cover.src || "")}">
          </label>
        </div>
        <div class="card-actions">
          <button class="secondary icon-button" type="button" title="Move cover earlier" data-move-media="covers:${index}:-1">Up</button>
          <button class="secondary icon-button" type="button" title="Move cover later" data-move-media="covers:${index}:1">Down</button>
          <button class="danger" type="button" data-remove-media="covers:${index}">Remove</button>
        </div>
      </article>
    `;
  }).join("");
};

const renderImageCards = (album) => {
  if (!album.images.length) {
    return `<p class="empty-state">Drop images into the upload area to build this gallery.</p>`;
  }

  return album.images.map((image, index) => {
    const position = parsePosition(image.previewPosition);

    return `
      <article class="media-card" data-media-type="images" data-media-index="${index}">
        ${renderCropFrame(image, album, "images", index, imageName(image.src))}
        <div class="card-fields">
          <label class="span-all">
            <span>Alt text</span>
            <input data-media-field="alt" value="${escapeHtml(image.alt || "")}">
          </label>
          <label>
            <span>Left/right</span>
            <input type="range" min="0" max="100" value="${position.x}" data-position-axis="x">
          </label>
          <label>
            <span>Up/down</span>
            <input type="range" min="0" max="100" value="${position.y}" data-position-axis="y">
          </label>
          <details class="source-details span-all">
            <summary>Source</summary>
            <input data-media-field="src" value="${escapeHtml(image.src || "")}">
          </details>
        </div>
        <div class="card-actions">
          <button class="secondary" type="button" data-promote-image="${index}">Make cover</button>
          <button class="secondary icon-button" type="button" title="Move image earlier" data-move-media="images:${index}:-1">Up</button>
          <button class="secondary icon-button" type="button" title="Move image later" data-move-media="images:${index}:1">Down</button>
          <button class="danger" type="button" data-remove-media="images:${index}">Remove</button>
        </div>
      </article>
    `;
  }).join("");
};

const renderAlbumEditor = () => {
  const album = selectedAlbum();

  if (!album) {
    albumEditor.innerHTML = "<p>Select or create an album.</p>";
    return;
  }

  ensureAlbumShape(album);

  albumEditor.innerHTML = `
    <div class="editor-head">
      <div>
        <p class="admin-kicker">${escapeHtml(sectionLabel(album.section))}</p>
        <h2>${escapeHtml(album.title || album.id)}</h2>
        <p class="editor-meta">${imageCountLabel(album)} - ${coverCountLabel(album)}</p>
      </div>
      <div class="row-actions">
        <button class="secondary" type="button" data-duplicate-album>Duplicate</button>
        ${pendingDeleteAlbumId === album.id ? `
          <button class="danger" type="button" data-confirm-delete-album>Confirm delete</button>
          <button class="secondary" type="button" data-cancel-delete-album>Cancel</button>
        ` : `
          <button class="danger" type="button" data-delete-album>Delete</button>
        `}
      </div>
    </div>

    <div class="portal-grid">
      <section class="control-panel">
        <h3>Album</h3>
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
            <input data-album-field="title" value="${escapeHtml(album.title || "")}">
          </label>
          <label>
            <span>Kicker</span>
            <input data-album-field="kicker" value="${escapeHtml(album.kicker || "")}">
          </label>
          <label class="span-all">
            <span>Description</span>
            <textarea data-album-field="description">${escapeHtml(album.description || "")}</textarea>
          </label>
        </div>
      </section>

      <section class="control-panel upload-panel">
        <h3>Upload</h3>
        <form class="upload-box" data-upload-form>
          <label class="drop-zone" data-drop-zone>
            <span>Drop photos or choose files</span>
            <input name="photo" type="file" accept="image/*" multiple required>
          </label>
          <div class="upload-options">
            <label>
              <span>Resize long edge</span>
              <select name="maxEdge">
                <option value="2400">2400 px</option>
                <option value="3000">3000 px</option>
                <option value="1800">1800 px</option>
                <option value="original">Original</option>
              </select>
            </label>
            <label>
              <span>JPEG quality</span>
              <input name="quality" type="number" min="0.55" max="0.95" step="0.01" value="0.86">
            </label>
            <label>
              <span>Alt prefix</span>
              <input name="alt" type="text" value="${escapeHtml(album.title || "")}">
            </label>
            <label>
              <span>Also create covers</span>
              <select name="asCover">
                <option value="first">First image only</option>
                <option value="no">No</option>
                <option value="all">Every image</option>
              </select>
            </label>
          </div>
          <div class="upload-preview" data-upload-preview></div>
          <button type="submit">Upload selected</button>
        </form>
      </section>

      <section class="control-panel lightroom-panel span-all">
        <h3>Lightroom</h3>
        <div class="lightroom-grid">
          <label>
            <span>Shared gallery link</span>
            <input data-album-field="lightroomUrl" placeholder="https://lightroom.adobe.com/..." value="${escapeHtml(album.lightroomUrl || "")}">
          </label>
          <a class="button-link secondary ${album.lightroomUrl ? "" : "is-disabled"}" href="${escapeHtml(album.lightroomUrl || "#")}" target="_blank" rel="noreferrer">Open Lightroom</a>
        </div>
        <div class="remote-import">
          <label>
            <span>Import image URLs</span>
            <textarea data-remote-urls placeholder="Paste direct image URLs, one per line"></textarea>
          </label>
          <div class="row-actions">
            <button type="button" data-import-lightroom>Import Lightroom gallery</button>
            <button class="secondary" type="button" data-add-remote-images>Add URLs to gallery</button>
          </div>
        </div>
      </section>
    </div>

    <section class="gallery-workbench">
      <div class="section-head">
        <div>
          <h3>Covers</h3>
          <p>Drag a preview or use the sliders to set the crop shown on the home page.</p>
        </div>
        <button class="secondary" type="button" data-add-cover>Add cover slot</button>
      </div>
      <div class="cover-grid">${renderCoverCards(album)}</div>
    </section>

    <section class="gallery-workbench">
      <div class="section-head">
        <div>
          <h3>Gallery images</h3>
          <p>Order images, write alt text, and tune each preview position without editing JSON by hand.</p>
        </div>
      </div>
      <div class="image-grid">${renderImageCards(album)}</div>
    </section>
  `;
};

const render = () => {
  ensureSiteShape();
  renderSections();
  renderClients();
  renderAlbumList();
  renderAlbumEditor();
};

const loadSite = async () => {
  setStatus("Loading content...");
  const response = await api("site");
  site = response.site;
  ensureSiteShape();
  selectedAlbumId = site.albums[0]?.id || "";
  loginPanel.hidden = true;
  adminShell.hidden = false;
  render();
  markClean();
  setStatus("Content loaded.");
};

const saveSite = async () => {
  setStatus("Saving changes...");
  const response = await api("site", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site })
  });
  site = response.site || site;
  markClean();

  if (response.deployment?.triggered) {
    setStatus("Saved. Vercel deployment started.");
    return;
  }

  if (response.deployment?.configured) {
    setStatus(`Saved. Vercel deployment was not started: ${response.deployment.error || "check the deploy hook"}.`);
    return;
  }

  setStatus("Saved. Add a Vercel deploy hook URL to start deployments immediately.");
};

const updatePositionControls = (container, position) => {
  const image = container.querySelector(".crop-frame img");
  const xInput = container.querySelector('[data-position-axis="x"]');
  const yInput = container.querySelector('[data-position-axis="y"]');

  if (image) {
    image.style.objectPosition = formatPosition(position.x, position.y);
  }

  if (xInput) {
    xInput.value = position.x;
  }

  if (yInput) {
    yInput.value = position.y;
  }
};

const updateMediaPosition = (card, nextPosition) => {
  const album = selectedAlbum();

  if (!album || !card) {
    return;
  }

  const item = album[card.dataset.mediaType]?.[Number(card.dataset.mediaIndex)];

  if (!item) {
    return;
  }

  const position = {
    x: clamp(nextPosition.x),
    y: clamp(nextPosition.y)
  };

  item.previewPosition = formatPosition(position.x, position.y);
  updatePositionControls(card, position);
  markDirty();
};

const moveMedia = (album, type, index, direction) => {
  const items = album[type];
  const nextIndex = index + direction;

  if (!items || nextIndex < 0 || nextIndex >= items.length) {
    return;
  }

  const [item] = items.splice(index, 1);
  items.splice(nextIndex, 0, item);
};

const moveAlbum = (albumId, direction) => {
  const album = site.albums.find((item) => item.id === albumId);

  if (!album) {
    return false;
  }

  const section = album.section || "editorials";
  const sectionIndexes = site.albums
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (item.section || "editorials") === section);
  const sectionPosition = sectionIndexes.findIndex(({ item }) => item.id === albumId);
  const targetPosition = sectionPosition + direction;

  if (sectionPosition < 0 || targetPosition < 0 || targetPosition >= sectionIndexes.length) {
    return false;
  }

  const currentIndex = sectionIndexes[sectionPosition].index;
  const targetIndex = sectionIndexes[targetPosition].index;
  [site.albums[currentIndex], site.albums[targetIndex]] = [site.albums[targetIndex], site.albums[currentIndex]];
  selectedAlbumId = albumId;
  return true;
};

const buildCoverFromImage = (album, image) => ({
  src: image.src,
  alt: image.alt || album.title,
  previewPosition: image.previewPosition || "50% 50%",
  className: album.section === "fine-art" ? defaultCoverStyle : ""
});

const addImagesToAlbum = (album, images, asCover = "no") => {
  ensureAlbumShape(album);
  album.images.push(...images);

  if (asCover === "first" && images[0]) {
    album.covers.push(buildCoverFromImage(album, images[0]));
  }

  if (asCover === "all") {
    album.covers.push(...images.map((image) => buildCoverFromImage(album, image)));
  }
};

const createAlbum = (title) => {
  const id = slugify(title);
  const uniqueId = site.albums.some((album) => album.id === id) ? `${id}-${Date.now().toString(36)}` : id;

  site.albums.push({
    id: uniqueId,
    section: "editorials",
    title,
    kicker: "Editorial story",
    description: "",
    lightroomUrl: "",
    covers: [],
    images: []
  });
  selectedAlbumId = uniqueId;
  markDirty();
  render();
};

const createClient = () => {
  const id = `client-${Date.now().toString(36)}`;

  site.clients.push({
    id,
    name: "New client",
    email: "",
    password: "",
    passwordHash: "",
    lightroomUrl: ""
  });
  markDirty();
  render();
  setStatus("Client draft added. Add an email, password, and gallery link, then save changes.");
};

const renderSelectedFiles = async (input) => {
  const preview = document.querySelector("[data-upload-preview]");

  if (!preview) {
    return;
  }

  const files = [...(input.files || [])];
  preview.innerHTML = "";

  for (const file of files.slice(0, 10)) {
    const item = document.createElement("div");
    item.className = "upload-thumb";
    item.textContent = imageName(file.name);

    try {
      const src = await readImageAsDataUrl(file);
      const image = document.createElement("img");
      image.src = src;
      image.alt = "";
      item.prepend(image);
    } catch (error) {
      item.dataset.noPreview = "true";
    }

    preview.append(item);
  }

  if (files.length > 10) {
    const more = document.createElement("div");
    more.className = "upload-thumb more-thumb";
    more.textContent = `+${files.length - 10}`;
    preview.append(more);
  }
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Checking password...", loginStatus);

  try {
    const result = await api("login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: new FormData(loginForm).get("password") })
    });
    sessionStorage.setItem(storageKey, result.token);
    loginForm.reset();
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
  createAlbumForm.hidden = false;
  createAlbumForm.elements.title.focus();
});

createAlbumForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = new FormData(createAlbumForm).get("title")?.trim();

  if (!title) {
    return;
  }

  createAlbum(title);
  createAlbumForm.reset();
  createAlbumForm.hidden = true;
});

document.addEventListener("click", async (event) => {
  const selectButton = event.target.closest("[data-select-album]");
  const removeButton = event.target.closest("[data-remove-media]");
  const promoteButton = event.target.closest("[data-promote-image]");
  const addCoverButton = event.target.closest("[data-add-cover]");
  const moveButton = event.target.closest("[data-move-media]");
  const addRemoteButton = event.target.closest("[data-add-remote-images]");
  const importLightroomButton = event.target.closest("[data-import-lightroom]");
  const createClientButton = event.target.closest("[data-create-client]");
  const removeClientButton = event.target.closest("[data-remove-client]");
  const cancelCreateAlbumButton = event.target.closest("[data-cancel-create-album]");
  const moveAlbumButton = event.target.closest("[data-move-album]");

  if (cancelCreateAlbumButton) {
    createAlbumForm.reset();
    createAlbumForm.hidden = true;
    return;
  }

  if (selectButton) {
    selectedAlbumId = selectButton.dataset.selectAlbum;
    pendingDeleteAlbumId = "";
    render();
    return;
  }

  if (moveAlbumButton) {
    const [albumId, direction] = moveAlbumButton.dataset.moveAlbum.split(":");

    if (moveAlbum(albumId, Number(direction))) {
      markDirty();
      render();
      setStatus(`${selectedAlbum()?.title || "Album"} moved. Save changes to publish the new order.`);
    }

    return;
  }

  if (createClientButton) {
    createClient();
    return;
  }

  if (removeClientButton) {
    site.clients = site.clients.filter((client) => client.id !== removeClientButton.dataset.removeClient);
    markDirty();
    render();
    setStatus("Client removed. Save changes to publish.");
    return;
  }

  const album = selectedAlbum();

  if (!album) {
    return;
  }

  ensureAlbumShape(album);

  if (removeButton) {
    const [type, index] = removeButton.dataset.removeMedia.split(":");
    album[type].splice(Number(index), 1);
    markDirty();
    render();
    return;
  }

  if (moveButton) {
    const [type, index, direction] = moveButton.dataset.moveMedia.split(":");
    moveMedia(album, type, Number(index), Number(direction));
    markDirty();
    render();
    return;
  }

  if (promoteButton) {
    const image = album.images[Number(promoteButton.dataset.promoteImage)];

    if (image) {
      album.covers.push(buildCoverFromImage(album, image));
      markDirty();
      render();
    }

    return;
  }

  if (addCoverButton) {
    const firstImage = album.images[0] || {};
    album.covers.push({
      src: firstImage.src || "",
      alt: firstImage.alt || album.title,
      previewPosition: firstImage.previewPosition || "50% 50%",
      className: album.section === "fine-art" ? defaultCoverStyle : ""
    });
    markDirty();
    render();
    return;
  }

  if (addRemoteButton) {
    const textarea = document.querySelector("[data-remote-urls]");
    const urls = normaliseImageUrlInput(textarea?.value);

    if (!urls.length) {
      setStatus("Paste at least one image URL first.");
      return;
    }

    const images = urls.map((src, index) => ({
      src,
      alt: `${album.title || "Gallery"} ${album.images.length + index + 1}`,
      previewPosition: "50% 50%"
    }));

    addImagesToAlbum(album, images, "no");
    markDirty();
    render();
    setStatus(`${images.length} remote image URL${images.length === 1 ? "" : "s"} added. Save changes to publish.`);
    return;
  }

  if (importLightroomButton) {
    const url = album.lightroomUrl?.trim();

    if (!url) {
      setStatus("Add the Lightroom shared gallery link first.");
      return;
    }

    try {
      importLightroomButton.disabled = true;
      setStatus("Importing Lightroom gallery...");
      const response = await api("lightroom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const images = response.imported || [];
      addImagesToAlbum(album, images, album.covers.length ? "no" : "first");
      album.lightroomUrl = response.lightroomUrl || url;

      if (response.albumTitle && !album.title) {
        album.title = response.albumTitle;
      }

      markDirty();
      render();
      setStatus(`${images.length} Lightroom image${images.length === 1 ? "" : "s"} imported. Save changes to publish.`);
    } catch (error) {
      setStatus(error.message);
      importLightroomButton.disabled = false;
    }

    return;
  }

  if (event.target.closest("[data-delete-album]")) {
    pendingDeleteAlbumId = album.id;
    render();
    setStatus(`Confirm deletion of ${album.title}.`);
    return;
  }

  if (event.target.closest("[data-cancel-delete-album]")) {
    pendingDeleteAlbumId = "";
    render();
    return;
  }

  if (event.target.closest("[data-confirm-delete-album]")) {
    site.albums = site.albums.filter((item) => item.id !== album.id);
    selectedAlbumId = site.albums[0]?.id || "";
    pendingDeleteAlbumId = "";
    markDirty();
    render();
    return;
  }

  if (event.target.closest("[data-duplicate-album]")) {
    const clone = JSON.parse(JSON.stringify(album));
    clone.id = `${album.id}-copy`;
    clone.title = `${album.title} Copy`;
    site.albums.push(clone);
    selectedAlbumId = clone.id;
    pendingDeleteAlbumId = "";
    markDirty();
    render();
  }
});

const handleEditableChange = (event) => {
  if (!site) {
    return;
  }

  const sectionField = event.target.closest("[data-section-field]");
  const clientField = event.target.closest("[data-client-field]");
  const clientPassword = event.target.closest("[data-client-password]");
  const albumField = event.target.closest("[data-album-field]");
  const mediaField = event.target.closest("[data-media-field]");
  const positionAxis = event.target.closest("[data-position-axis]");
  const fileInput = event.target.closest('[data-upload-form] input[type="file"]');

  if (fileInput) {
    renderSelectedFiles(fileInput);
    return;
  }

  if (sectionField) {
    setNested(site, sectionField.dataset.sectionField, sectionField.value);
    markDirty();
    return;
  }

  if (clientField || clientPassword) {
    const card = event.target.closest("[data-client-id]");
    const client = site.clients.find((item) => item.id === card?.dataset.clientId);

    if (!client) {
      return;
    }

    if (clientField) {
      client[clientField.dataset.clientField] = clientField.value;
    }

    if (clientPassword) {
      if (clientPassword.value) {
        client.password = clientPassword.value;
      } else {
        delete client.password;
      }
    }

    markDirty();
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

    if (albumField.dataset.albumField === "section") {
      sanitizeAlbumCoverClasses(album);
    }

    markDirty();
    render();
    return;
  }

  if (mediaField) {
    const row = mediaField.closest("[data-media-type]");
    const item = album[row.dataset.mediaType][Number(row.dataset.mediaIndex)];
    item[mediaField.dataset.mediaField] = mediaField.value;
    markDirty();
    return;
  }

  if (positionAxis) {
    const card = positionAxis.closest("[data-media-type]");
    const current = parsePosition(album[card.dataset.mediaType][Number(card.dataset.mediaIndex)]?.previewPosition);
    current[positionAxis.dataset.positionAxis] = Number(positionAxis.value);
    updateMediaPosition(card, current);
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
  activeUploadAbort = false;
  const album = selectedAlbum();
  const formData = new FormData(uploadForm);
  const fileInput = uploadForm.querySelector('input[type="file"]');
  const files = [...(fileInput.files || [])];

  if (!album || !files.length) {
    setStatus("Choose at least one image to upload.");
    return;
  }

  try {
    const maxEdge = formData.get("maxEdge");
    const quality = formData.get("quality");
    const uploadData = new FormData();

    for (let index = 0; index < files.length; index += 1) {
      if (activeUploadAbort) {
        return;
      }

      setStatus(`Preparing ${index + 1} of ${files.length}...`);
      const resized = await resizeImageFile(files[index], maxEdge, quality);
      uploadData.append("photo", resized, resized.name);
    }

    setStatus(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);
    const response = await api("upload", {
      method: "POST",
      body: uploadData
    });
    const uploaded = response.files?.length ? response.files : [{ src: response.src }];
    const altPrefix = formData.get("alt") || album.title || "Gallery image";
    const images = uploaded.map((item, index) => ({
      src: item.src,
      alt: files.length === 1 ? altPrefix : `${altPrefix} ${album.images.length + index + 1}`,
      previewPosition: "50% 50%"
    }));

    addImagesToAlbum(album, images, formData.get("asCover"));
    uploadForm.reset();
    markDirty();
    render();
    setStatus(`${images.length} image${images.length === 1 ? "" : "s"} uploaded and added. Save changes to publish.`);
  } catch (error) {
    setStatus(error.message);
  }
});

document.addEventListener("dragover", (event) => {
  const dropZone = event.target.closest("[data-drop-zone]");

  if (dropZone) {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  }
});

document.addEventListener("dragleave", (event) => {
  const dropZone = event.target.closest("[data-drop-zone]");

  if (dropZone) {
    dropZone.classList.remove("is-dragging");
  }
});

document.addEventListener("drop", (event) => {
  const dropZone = event.target.closest("[data-drop-zone]");

  if (!dropZone) {
    return;
  }

  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const input = dropZone.querySelector('input[type="file"]');

  if (!input) {
    return;
  }

  input.files = event.dataTransfer.files;
  renderSelectedFiles(input);
});

document.addEventListener("pointerdown", (event) => {
  const cropButton = event.target.closest("[data-crop-target]");

  if (!cropButton) {
    return;
  }

  const card = cropButton.closest("[data-media-type]");
  const album = selectedAlbum();
  const item = album?.[card.dataset.mediaType]?.[Number(card.dataset.mediaIndex)];

  if (!card || !item) {
    return;
  }

  event.preventDefault();
  cropButton.setPointerCapture(event.pointerId);
  dragTarget = {
    pointerId: event.pointerId,
    button: cropButton,
    card,
    startX: event.clientX,
    startY: event.clientY,
    startPosition: parsePosition(item.previewPosition)
  };
});

document.addEventListener("pointermove", (event) => {
  if (!dragTarget || event.pointerId !== dragTarget.pointerId) {
    return;
  }

  const rect = dragTarget.button.getBoundingClientRect();
  const nextPosition = {
    x: dragTarget.startPosition.x - ((event.clientX - dragTarget.startX) / rect.width) * 100,
    y: dragTarget.startPosition.y - ((event.clientY - dragTarget.startY) / rect.height) * 100
  };

  updateMediaPosition(dragTarget.card, nextPosition);
});

document.addEventListener("pointerup", (event) => {
  if (dragTarget && event.pointerId === dragTarget.pointerId) {
    dragTarget = null;
  }
});

window.addEventListener("beforeunload", (event) => {
  if (saveButton.dataset.dirty === "true") {
    event.preventDefault();
    event.returnValue = "";
  }
});

if (authToken()) {
  loadSite().catch(() => {
    sessionStorage.removeItem(storageKey);
    loginPanel.hidden = false;
    adminShell.hidden = true;
  });
}
