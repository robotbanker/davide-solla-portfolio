const body = document.body;
const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const loginPanel = document.querySelector("[data-client-login-panel]");
const loginForm = document.querySelector("[data-client-login-form]");
const clientStatus = document.querySelector("[data-client-status]");
const gallerySection = document.querySelector("[data-client-gallery]");
const galleryTitle = document.querySelector("[data-client-gallery-title]");
const galleryCopy = document.querySelector("[data-client-gallery-copy]");
const galleryGrid = document.querySelector("[data-client-gallery-grid]");
const downloadLink = document.querySelector("[data-client-download]");
const logoutButton = document.querySelector("[data-client-logout]");
const lightbox = document.querySelector("[data-client-lightbox]");
const lightboxMedia = document.querySelector("[data-client-lightbox-media]");
const lightboxImage = document.querySelector("[data-client-lightbox-image]");
const lightboxTitle = document.querySelector("[data-client-lightbox-title]");
const lightboxCounter = document.querySelector("[data-client-lightbox-counter]");
const lightboxCloseButton = document.querySelector("[data-client-lightbox-close]");
const lightboxPreviousButton = document.querySelector("[data-client-lightbox-prev]");
const lightboxNextButton = document.querySelector("[data-client-lightbox-next]");
const feedbackForm = document.querySelector("[data-client-feedback-form]");
const feedbackComment = document.querySelector("[data-client-feedback-comment]");
const feedbackStatus = document.querySelector("[data-client-feedback-status]");
const feedbackSaveButton = document.querySelector("[data-client-feedback-save]");
const feedbackClearButton = document.querySelector("[data-client-feedback-clear]");
const commentCount = document.querySelector("[data-client-comment-count]");
const ratingValue = document.querySelector("[data-client-rating-value]");
const ratingButtons = [...document.querySelectorAll("[data-client-rating]")];
const clientStorageKey = "davide-client-gallery";
const clientSessionMs = 8 * 60 * 60 * 1000;
const focusableSelector = 'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
const menuBackgroundState = new Map();
const lightboxBackgroundState = new Map();
const feedbackDrafts = new Map();

let activeClient = null;
let activeSessionToken = "";
let activeSessionExpiresAt = 0;
let activeImageIndex = -1;
let lastLightboxTrigger = null;
let lightboxTouchStartX = 0;
let lightboxTouchStartY = 0;

const visibleFocusableElements = (container) => [...container.querySelectorAll(focusableSelector)]
  .filter((element) => !element.hidden && element.getClientRects().length > 0);

const trapFocus = (event, container) => {
  if (event.key !== "Tab") return;
  const focusable = visibleFocusableElements(container);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
};

const setMenuBackgroundInert = (isInert) => {
  if (isInert) {
    if (menuBackgroundState.size) return;
    [...body.children].forEach((element) => {
      if (element === header || element.tagName === "SCRIPT") return;
      menuBackgroundState.set(element, element.inert);
      element.inert = true;
    });
    return;
  }

  menuBackgroundState.forEach((wasInert, element) => {
    element.inert = wasInert;
  });
  menuBackgroundState.clear();
};

const setLightboxBackgroundInert = (isInert) => {
  if (isInert) {
    if (lightboxBackgroundState.size) return;
    [...body.children].forEach((element) => {
      if (element === lightbox || element.tagName === "SCRIPT") return;
      lightboxBackgroundState.set(element, element.inert);
      element.inert = true;
    });
    return;
  }

  lightboxBackgroundState.forEach((wasInert, element) => {
    element.inert = wasInert;
  });
  lightboxBackgroundState.clear();
};

const setHeaderState = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

const closeMenu = ({ returnFocus = false } = {}) => {
  body.classList.remove("menu-open");
  header?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Open navigation");
  setMenuBackgroundInert(false);
  if (returnFocus) requestAnimationFrame(() => menuToggle?.focus({ preventScroll: true }));
};

const openMenu = () => {
  body.classList.add("menu-open");
  header?.classList.add("is-open");
  menuToggle?.setAttribute("aria-expanded", "true");
  menuToggle?.setAttribute("aria-label", "Close navigation");
  setMenuBackgroundInert(true);
  requestAnimationFrame(() => nav?.querySelector("a")?.focus({ preventScroll: true }));
};

const setStatus = (message) => {
  clientStatus.textContent = message;
};

const saveClientSession = (client, token, { expiresAt: requestedExpiry = 0 } = {}) => {
  const defaultExpiry = Date.now() + clientSessionMs;
  let storedExpiry = 0;

  try {
    const savedSession = JSON.parse(sessionStorage.getItem(clientStorageKey) || "{}");
    if (savedSession.token === token) storedExpiry = Number(savedSession.expiresAt || 0);
  } catch (error) {
    // Storage may be unavailable in strict privacy modes.
  }

  const validRequestedExpiry = Number(requestedExpiry) > Date.now() ? Number(requestedExpiry) : 0;
  const validStoredExpiry = storedExpiry > Date.now() ? storedExpiry : 0;
  const expiresAt = Math.min(validRequestedExpiry || validStoredExpiry || defaultExpiry, defaultExpiry);
  activeSessionExpiresAt = expiresAt;

  try {
    sessionStorage.setItem(clientStorageKey, JSON.stringify({
      client,
      token,
      expiresAt
    }));
  } catch (error) {
    // The active in-memory session still works when browser storage is unavailable.
  }

  return expiresAt;
};

const clearClientSession = () => {
  activeSessionExpiresAt = 0;
  try {
    sessionStorage.removeItem(clientStorageKey);
  } catch (error) {
    // Storage may be unavailable in strict privacy modes.
  }
};

const readClientSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem(clientStorageKey) || "{}");

    if (!session.client || !session.token || Date.now() > Number(session.expiresAt || 0)) {
      clearClientSession();
      return null;
    }

    return {
      token: String(session.token),
      expiresAt: Number(session.expiresAt)
    };
  } catch (error) {
    clearClientSession();
    return null;
  }
};

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const galleryImages = () => Array.isArray(activeClient?.images) ? activeClient.images : [];

const imageIdentifier = (image, index) => String(image?.lightroomAssetId || image?.id || `image-${index + 1}`);

const feedbackRecords = () => Array.isArray(activeClient?.feedback) ? activeClient.feedback : [];

const feedbackForImage = (image, index) => {
  const lightroomAssetId = imageIdentifier(image, index);
  return feedbackRecords().find((record) => String(record?.lightroomAssetId || "") === lightroomAssetId) || null;
};

const feedbackDraftForImage = (image, index) => feedbackDrafts.get(imageIdentifier(image, index)) || null;

const updateCurrentFeedbackDraft = () => {
  const image = galleryImages()[activeImageIndex];
  if (!image) return;
  const lightroomAssetId = imageIdentifier(image, activeImageIndex);
  const saved = feedbackForImage(image, activeImageIndex);
  const rating = selectedRating();
  const comment = feedbackComment.value;
  const matchesSaved = rating === Number(saved?.rating || 0)
    && comment === String(saved?.comment || "");

  if (matchesSaved) {
    feedbackDrafts.delete(lightroomAssetId);
    feedbackStatus.textContent = "";
  } else {
    feedbackDrafts.set(lightroomAssetId, { rating, comment });
    feedbackStatus.textContent = "Unsaved changes.";
  }
  feedbackClearButton.hidden = !saved && matchesSaved;
};

const isProtectedImageTarget = (target) => Boolean(
  body.classList.contains("client-page") && target?.closest?.("img, picture, source")
);

const updateThumbnailFeedbackState = (imageIndex) => {
  const image = galleryImages()[imageIndex];
  const button = galleryGrid.querySelector(`[data-client-image-index="${imageIndex}"]`);
  if (!image || !button) return;
  const record = feedbackForImage(image, imageIndex);
  const rating = Number(record?.rating || 0);
  const description = image.alt || activeClient?.galleryTitle || activeClient?.name || "Client gallery image";
  const reviewLabel = rating >= 1 && rating <= 5
    ? ` Rated ${rating} out of 5 stars.`
    : record
      ? " Feedback saved."
      : "";
  button.setAttribute("aria-label", `Open image ${imageIndex + 1} of ${galleryImages().length}: ${description}.${reviewLabel}`);
  button.classList.toggle("has-feedback", Boolean(record));

  let badge = button.querySelector("[data-client-thumbnail-rating]");
  if (rating >= 1 && rating <= 5) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "client-gallery-rating";
      badge.dataset.clientThumbnailRating = "";
      badge.setAttribute("aria-hidden", "true");
      button.append(badge);
    }
    badge.textContent = `${rating} ★`;
  } else {
    badge?.remove();
  }
};

const renderGalleryImages = (client) => {
  const images = Array.isArray(client.images) ? client.images : [];
  const canDownload = client.downloadEnabled === true && Boolean(client.lightroomUrl);

  if (!images.length) {
    const fallbackLink = canDownload
      ? `<a class="text-link text-link-light" href="${escapeHtml(client.lightroomUrl)}" target="_blank" rel="noreferrer">Open Lightroom</a>`
      : "";
    galleryGrid.innerHTML = `
      <div class="client-gallery-empty">
        <p>${escapeHtml(client.embedError || "The gallery preview is not available right now. Please contact the studio if you need help.")}</p>
        ${fallbackLink}
      </div>
    `;
    return;
  }

  galleryGrid.innerHTML = images.map((image, index) => {
    const record = feedbackForImage(image, index);
    const rating = Number(record?.rating || 0);
    const description = image.alt || client.galleryTitle || client.name || "Client gallery image";
    const reviewLabel = rating >= 1 && rating <= 5
      ? ` Rated ${rating} out of 5 stars.`
      : record
        ? " Feedback saved."
        : "";
    const badge = rating >= 1 && rating <= 5
      ? `<span class="client-gallery-rating" data-client-thumbnail-rating aria-hidden="true">${rating} &#9733;</span>`
      : "";

    return `
      <button class="client-gallery-item ${index % 5 === 0 ? "is-wide" : ""} ${record ? "has-feedback" : ""}" type="button" data-client-image-index="${index}" aria-label="Open image ${index + 1} of ${images.length}: ${escapeHtml(description)}.${reviewLabel}">
        <img src="${escapeHtml(image.src)}" alt="${escapeHtml(description)}" loading="${index < 3 ? "eager" : "lazy"}" decoding="async" draggable="false">
        ${badge}
      </button>
    `;
  }).join("");
};

const selectedRating = () => Number(feedbackForm.dataset.rating || 0);

const setSelectedRating = (rating, { focus = false } = {}) => {
  const nextRating = Math.min(Math.max(Number(rating) || 0, 0), 5);
  feedbackForm.dataset.rating = String(nextRating);
  ratingButtons.forEach((button) => {
    const value = Number(button.dataset.clientRating);
    button.classList.toggle("is-filled", nextRating > 0 && value <= nextRating);
    button.classList.toggle("is-selected", value === nextRating);
    button.setAttribute("aria-pressed", String(value === nextRating));
  });
  ratingValue.textContent = nextRating
    ? `${nextRating} out of 5 stars selected`
    : "No rating selected";
  if (focus && nextRating) {
    ratingButtons[nextRating - 1]?.focus({ preventScroll: true });
  }
};

const updateCommentCount = () => {
  commentCount.textContent = `${feedbackComment.value.length} / 1500`;
};

const hydrateFeedbackForm = () => {
  const image = galleryImages()[activeImageIndex];
  const record = image ? feedbackForImage(image, activeImageIndex) : null;
  const draft = image ? feedbackDraftForImage(image, activeImageIndex) : null;
  setSelectedRating(draft ? draft.rating : record?.rating || 0);
  feedbackComment.value = draft ? draft.comment : record?.comment || "";
  feedbackClearButton.hidden = !record && !draft;
  feedbackStatus.textContent = draft ? "Unsaved changes." : "";
  updateCommentCount();
};

const showLightboxImage = (index, { resetScroll = false } = {}) => {
  const images = galleryImages();
  if (!images.length) return;
  if (activeImageIndex >= 0 && activeImageIndex !== Number(index)) {
    updateCurrentFeedbackDraft();
  }
  activeImageIndex = Math.min(Math.max(Number(index) || 0, 0), images.length - 1);
  const image = images[activeImageIndex];
  const description = image.alt || activeClient?.galleryTitle || activeClient?.name || "Client gallery image";

  lightboxImage.src = image.src;
  lightboxImage.alt = description;
  lightboxTitle.textContent = description;
  lightboxCounter.textContent = `Image ${activeImageIndex + 1} of ${images.length}`;
  lightboxPreviousButton.disabled = activeImageIndex === 0;
  lightboxNextButton.disabled = activeImageIndex === images.length - 1;
  hydrateFeedbackForm();

  if (resetScroll) {
    lightbox.scrollTo({ top: 0, behavior: "auto" });
  }
};

const stepLightboxImage = (direction) => {
  const nextIndex = activeImageIndex + direction;
  if (nextIndex < 0 || nextIndex >= galleryImages().length) return;
  showLightboxImage(nextIndex, { resetScroll: true });
};

const openLightbox = (index, trigger) => {
  if (!galleryImages()[index]) return;
  closeMenu();
  lastLightboxTrigger = trigger || document.activeElement;
  showLightboxImage(index);
  lightbox.hidden = false;
  lightbox.inert = false;
  lightbox.setAttribute("aria-hidden", "false");
  body.classList.add("client-lightbox-open");
  setLightboxBackgroundInert(true);
  lightbox.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(() => lightboxCloseButton.focus({ preventScroll: true }));
};

const closeLightbox = ({ restoreFocus = true } = {}) => {
  if (lightbox.hidden) return;
  const trigger = lastLightboxTrigger;
  updateCurrentFeedbackDraft();
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.inert = true;
  lightbox.hidden = true;
  body.classList.remove("client-lightbox-open");
  setLightboxBackgroundInert(false);
  lightboxImage.src = "";
  lightboxImage.alt = "";
  activeImageIndex = -1;
  lastLightboxTrigger = null;
  if (restoreFocus && trigger?.isConnected) {
    requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  }
};

const showGallery = (client, token, expiresAt = activeSessionExpiresAt) => {
  const name = client.name || "Your";
  const images = Array.isArray(client.images) ? client.images : [];
  const canDownload = client.downloadEnabled === true && Boolean(client.lightroomUrl);
  activeClient = {
    ...client,
    feedback: Array.isArray(client.feedback) ? client.feedback : []
  };
  activeSessionToken = token;
  activeSessionExpiresAt = Number(expiresAt) || activeSessionExpiresAt;
  body.classList.add("client-gallery-active");
  galleryTitle.textContent = `${name} gallery`;

  if (images.length) {
    galleryCopy.textContent = canDownload
      ? "Open any image to rate it or leave a comment. Downloads are enabled for this gallery."
      : "Open any image to rate it or leave a comment. Downloads are not enabled for this gallery.";
  } else {
    galleryCopy.textContent = canDownload
      ? "The embedded preview is unavailable, but downloads are enabled below."
      : "The gallery preview is temporarily unavailable. Please contact the studio if you need help.";
  }

  downloadLink.hidden = !canDownload;
  if (canDownload) {
    downloadLink.href = client.lightroomUrl;
  } else {
    downloadLink.removeAttribute("href");
  }

  renderGalleryImages(activeClient);
  loginPanel.hidden = true;
  gallerySection.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(() => galleryTitle.focus({ preventScroll: true }));
};

const showLogin = (message = "") => {
  closeLightbox({ restoreFocus: false });
  feedbackDrafts.clear();
  activeClient = null;
  activeSessionToken = "";
  activeSessionExpiresAt = 0;
  body.classList.remove("client-gallery-active");
  galleryGrid.innerHTML = '<p class="client-gallery-message is-loading">Preparing your private gallery preview.</p>';
  downloadLink.hidden = true;
  downloadLink.removeAttribute("href");
  loginPanel.hidden = false;
  gallerySection.hidden = true;
  loginForm.reset();
  loginForm.classList.remove("was-submitted");
  setStatus(message);
  requestAnimationFrame(() => loginForm.elements.email?.focus({ preventScroll: true }));
};

const replaceFeedbackRecord = (record, deleted = false, submittedAssetId = "") => {
  const records = feedbackRecords();
  const lightroomAssetId = String(record?.lightroomAssetId || submittedAssetId);
  const nextRecords = records.filter((item) => String(item?.lightroomAssetId || "") !== lightroomAssetId);
  if (!deleted && record) nextRecords.push(record);
  activeClient.feedback = nextRecords;
};

const setFeedbackPending = (isPending) => {
  feedbackSaveButton.disabled = isPending;
  feedbackClearButton.disabled = isPending;
  feedbackComment.disabled = isPending;
  ratingButtons.forEach((button) => {
    button.disabled = isPending;
  });
};

const submitFeedback = async ({ clear = false } = {}) => {
  const image = galleryImages()[activeImageIndex];
  if (!image || !activeSessionToken) return;
  const submittedImageIndex = activeImageIndex;
  const submittedAssetId = imageIdentifier(image, submittedImageIndex);
  const rating = clear ? 0 : selectedRating();
  const comment = clear ? "" : feedbackComment.value.trim();

  if (!clear && rating === 0 && !comment) {
    feedbackStatus.textContent = "Choose a star rating or add a comment before saving.";
    feedbackComment.focus({ preventScroll: true });
    return;
  }

  setFeedbackPending(true);
  feedbackStatus.textContent = clear ? "Clearing feedback..." : "Saving feedback...";

  try {
    const response = await fetch("/api/client?action=feedback", {
      method: "POST",
      headers: {
        authorization: `Bearer ${activeSessionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        lightroomAssetId: submittedAssetId,
        rating,
        comment
      })
    });
    const responseBody = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearClientSession();
        showLogin("Your gallery session has expired. Please sign in again.");
        return;
      }
      throw new Error(responseBody.error || "Feedback could not be saved.");
    }

    const wasDeleted = Boolean(responseBody.deleted || clear);
    replaceFeedbackRecord(responseBody.feedback, wasDeleted, submittedAssetId);
    feedbackDrafts.delete(submittedAssetId);
    saveClientSession(activeClient, activeSessionToken, { expiresAt: activeSessionExpiresAt });
    updateThumbnailFeedbackState(submittedImageIndex);
    const activeImage = galleryImages()[activeImageIndex];
    if (!lightbox.hidden && imageIdentifier(activeImage, activeImageIndex) === submittedAssetId) {
      hydrateFeedbackForm();
      feedbackStatus.textContent = wasDeleted
        ? "Feedback cleared."
        : "Your feedback has been saved.";
    }
  } catch (error) {
    const activeImage = galleryImages()[activeImageIndex];
    if (!lightbox.hidden && imageIdentifier(activeImage, activeImageIndex) === submittedAssetId) {
      feedbackStatus.textContent = error.message || "Feedback could not be saved.";
    }
  } finally {
    setFeedbackPending(false);
  }
};

menuToggle?.addEventListener("click", () => {
  if (body.classList.contains("menu-open")) {
    closeMenu({ returnFocus: true });
  } else {
    openMenu();
  }
});

nav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});

galleryGrid.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-client-image-index]");
  if (!trigger) return;
  openLightbox(Number(trigger.dataset.clientImageIndex), trigger);
});

lightboxCloseButton.addEventListener("click", () => closeLightbox());
lightboxPreviousButton.addEventListener("click", () => stepLightboxImage(-1));
lightboxNextButton.addEventListener("click", () => stepLightboxImage(1));

ratingButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setSelectedRating(Number(button.dataset.clientRating));
    updateCurrentFeedbackDraft();
  });

  button.addEventListener("keydown", (event) => {
    const current = Number(button.dataset.clientRating);
    const next = event.key === "ArrowRight" || event.key === "ArrowUp"
      ? Math.min(current + 1, 5)
      : event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? Math.max(current - 1, 1)
        : event.key === "Home"
          ? 1
          : event.key === "End"
            ? 5
            : 0;
    if (!next) return;
    event.preventDefault();
    setSelectedRating(next, { focus: true });
    updateCurrentFeedbackDraft();
  });
});

feedbackComment.addEventListener("input", () => {
  updateCommentCount();
  updateCurrentFeedbackDraft();
});

feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitFeedback();
});

feedbackClearButton.addEventListener("click", () => {
  submitFeedback({ clear: true });
});

lightboxMedia.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  lightboxTouchStartX = touch.clientX;
  lightboxTouchStartY = touch.clientY;
}, { passive: true });

lightboxMedia.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - lightboxTouchStartX;
  const deltaY = touch.clientY - lightboxTouchStartY;
  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
  stepLightboxImage(deltaX > 0 ? -1 : 1);
}, { passive: true });

document.addEventListener("keydown", (event) => {
  if (!lightbox.hidden) {
    if (event.key === "Tab") {
      trapFocus(event, lightbox);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }

    const insideFeedbackControl = Boolean(event.target.closest?.("[data-client-feedback-form]"));
    if (!insideFeedbackControl && event.key === "ArrowLeft") {
      event.preventDefault();
      stepLightboxImage(-1);
      return;
    }
    if (!insideFeedbackControl && event.key === "ArrowRight") {
      event.preventDefault();
      stepLightboxImage(1);
    }
    return;
  }

  if (event.key === "Tab" && body.classList.contains("menu-open")) {
    trapFocus(event, header);
  }
  if (event.key === "Escape" && body.classList.contains("menu-open")) {
    closeMenu({ returnFocus: true });
  }
});

document.addEventListener("contextmenu", (event) => {
  if (isProtectedImageTarget(event.target)) event.preventDefault();
});

document.addEventListener("dragstart", (event) => {
  if (isProtectedImageTarget(event.target)) event.preventDefault();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginForm.classList.add("was-submitted");

  if (!loginForm.checkValidity()) return;

  const submitButton = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  submitButton.disabled = true;
  setStatus("Checking access...");

  try {
    const response = await fetch("/api/client?action=login", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });
    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(responseBody.error || "Client login failed.");
    }
    if (!responseBody.client || !responseBody.token) {
      throw new Error("A secure gallery session could not be created. Please try again.");
    }

    feedbackDrafts.clear();
    const expiresAt = saveClientSession(responseBody.client, responseBody.token);
    showGallery(responseBody.client, responseBody.token, expiresAt);
  } catch (error) {
    setStatus(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener("click", () => {
  clearClientSession();
  showLogin();
});

window.addEventListener("scroll", setHeaderState, { passive: true });
setHeaderState();

const savedSession = readClientSession();

if (savedSession) {
  const restoreClientSession = async () => {
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus("Restoring secure gallery access...");

    try {
      const response = await fetch("/api/client?action=session", {
        method: "GET",
        headers: {
          authorization: `Bearer ${savedSession.token}`
        }
      });
      const responseBody = await response.json();

      if (!response.ok || !responseBody.client) {
        throw new Error("Your gallery session could not be restored.");
      }

      const token = String(responseBody.token || savedSession.token);
      const expiresAt = saveClientSession(responseBody.client, token, {
        expiresAt: savedSession.expiresAt
      });
      showGallery(responseBody.client, token, expiresAt);
    } catch (error) {
      clearClientSession();
      showLogin("Please sign in again to view your gallery.");
    } finally {
      submitButton.disabled = false;
    }
  };

  restoreClientSession();
}
