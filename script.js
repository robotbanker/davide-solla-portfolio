const body = document.body;
const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const galleryModal = document.querySelector("[data-gallery-modal]");
const galleryTitle = document.querySelector("[data-gallery-title]");
const galleryKicker = document.querySelector("[data-gallery-kicker]");
const galleryDescription = document.querySelector("[data-gallery-description]");
const galleryStrip = document.querySelector("[data-gallery-strip]");
const galleryCloseButtons = document.querySelectorAll("[data-gallery-close]");
const imageLightbox = document.querySelector("[data-image-lightbox]");
const imageLightboxImage = document.querySelector("[data-image-lightbox-image]");
const imageLightboxCaption = document.querySelector("[data-image-lightbox-caption]");
const imageLightboxClose = document.querySelector("[data-image-lightbox-close]");
const imageLightboxPrevButton = document.querySelector("[data-image-lightbox-prev]");
const imageLightboxNextButton = document.querySelector("[data-image-lightbox-next]");
const editorialGrid = document.querySelector("[data-editorial-grid]");
const fineGrid = document.querySelector("[data-fine-grid]");
const servicesList = document.querySelector("[data-services-list]");
const form = document.querySelector(".inquiry-form");
const statusMessage = document.querySelector("[data-form-status]");

let galleries = {};
let activeGallery = null;
let activeGalleryIndex = -1;
let galleryScrollFrame = null;
let galleryTouchStartX = 0;
let galleryTouchStartY = 0;
let lightboxTouchStartX = 0;
let lightboxTouchStartY = 0;
let lastGalleryTrigger = null;
let lastLightboxTrigger = null;

const defaultSiteData = {
  sections: {
    work: {
      kicker: "Selected editorials",
      heading: "London fashion editorials, beauty stories, and cinematic portrait work."
    },
    fineArt: {
      kicker: "Fine art",
      heading: "Fine-art portrait studies in beauty, fracture, and transformation.",
      intro: "Available as large-format, gallery-quality prints for private collectors, interiors, and curated spaces."
    },
    services: [
      "Fashion editorials in London",
      "Beauty portraits",
      "Model portfolio tests",
      "Fine-art portrait commissions"
    ]
  },
  albums: [
    {
      id: "roxana",
      section: "editorials",
      title: "Roxana",
      kicker: "Editorial story",
      description: "A polished London beauty editorial shaped with soft glamour, reflective colour, and poised studio direction.",
      covers: [{ src: "assets/images/roxana-01.jpg", alt: "London editorial beauty portrait in warm directional light", className: "tile-large", previewPosition: "50% 52%" }],
      images: [
        { src: "assets/images/roxana-01.jpg", alt: "Roxana editorial beauty portrait in warm directional light" },
        { src: "assets/images/roxana-02.jpg", alt: "Roxana London fashion portrait with refined styling" },
        { src: "assets/images/roxana-03.jpg", alt: "Roxana beauty portrait with cinematic colour" },
        { src: "assets/images/roxana-04.jpg", alt: "Roxana editorial portrait with sculptural styling" }
      ]
    },
    {
      id: "cosmic",
      section: "editorials",
      title: "Cosmic Girl",
      kicker: "Fashion editorial",
      description: "A futuristic fashion editorial with blue-red studio light, metallic texture, and a beauty mood built around gaze and gesture.",
      covers: [{ src: "assets/images/cosmic-02.jpg", alt: "Cosmic Girl cinematic fashion close portrait with blue-red light", className: "", previewPosition: "50% 52%" }],
      images: [
        { src: "assets/images/cosmic-01.jpg", alt: "Cosmic Girl full-length fashion portrait with futuristic styling", previewPosition: "50% 18%" },
        { src: "assets/images/cosmic-02.jpg", alt: "Cosmic Girl cinematic close portrait with blue-red studio light" },
        { src: "assets/images/cosmic-03.jpg", alt: "Cosmic Girl blue-lit editorial pose" },
        { src: "assets/images/cosmic-04.jpg", alt: "Cosmic Girl beauty detail with metallic texture" },
        { src: "assets/images/cosmic-05.jpg", alt: "Cosmic Girl atmospheric fashion portrait" },
        { src: "assets/images/cosmic-06.jpg", alt: "Cosmic Girl blue-lit fashion portrait" },
        { src: "assets/images/cosmic-07.jpg", alt: "Cosmic Girl futuristic editorial portrait" }
      ]
    },
    {
      id: "julia",
      section: "editorials",
      title: "Julia",
      kicker: "Portrait story",
      description: "A quiet fashion portrait series with winter styling, direct expression, and a restrained editorial palette.",
      covers: [{ src: "assets/images/julia-01.jpg", alt: "Quiet editorial portrait with refined winter styling", className: "", previewPosition: "50% 38%" }],
      images: [
        { src: "assets/images/julia-01.jpg", alt: "Julia quiet editorial portrait with winter styling" },
        { src: "assets/images/julia-02.jpg", alt: "Julia studio portrait with direct expression" },
        { src: "assets/images/julia-03.jpg", alt: "Julia fashion portrait with restrained editorial styling" },
        { src: "assets/images/julia-04.jpg", alt: "Julia portrait with soft cinematic light" },
        { src: "assets/images/julia-05.jpg", alt: "Julia editorial beauty portrait" }
      ]
    },
    {
      id: "sophie",
      section: "editorials",
      title: "Sophie",
      kicker: "Night editorial",
      description: "A nocturnal Soho sequence with cinematic street light, motion, and after-dark fashion energy.",
      covers: [{ src: "assets/images/sophie-01.jpg", alt: "Nocturnal Soho fashion editorial portrait in London", className: "tile-wide", previewPosition: "50% 43%" }],
      images: [
        { src: "assets/images/sophie-01.jpg", alt: "Sophie nocturnal Soho editorial portrait" },
        { src: "assets/images/sophie-08.jpg", alt: "Sophie London fashion portrait with cinematic street light" },
        { src: "assets/images/sophie-02.jpg", alt: "Sophie after-dark editorial portrait with motion" },
        { src: "assets/images/sophie-03.jpg", alt: "Sophie night portrait with urban fashion styling" },
        { src: "assets/images/sophie-07.jpg", alt: "Sophie editorial portrait with Soho location light" },
        { src: "assets/images/sophie-06.jpg", alt: "Sophie cinematic fashion portrait in London" },
        { src: "assets/images/sophie-09.jpg", alt: "Sophie nocturnal portrait with after-dark styling" },
        { src: "assets/images/sophie-11.jpg", alt: "Sophie London editorial portrait with dramatic light" },
        { src: "assets/images/sophie-04.jpg", alt: "Sophie fashion portrait with cinematic city mood" }
      ]
    },
    {
      id: "harvey",
      section: "editorials",
      title: "Harvey",
      kicker: "Menswear portrait",
      description: "A masculine portrait study with low-key light, sculptural shadow, and an intimate studio mood.",
      covers: [{ src: "assets/images/harvey-01.jpg", alt: "Menswear portrait with moody London studio light", className: "", previewPosition: "50% 38%" }],
      images: [
        { src: "assets/images/harvey-01.jpg", alt: "Harvey menswear fashion portrait with low-key light" },
        { src: "assets/images/harvey-02.jpg", alt: "Harvey intimate studio portrait with sculptural shadow" },
        { src: "assets/images/harvey-03.jpg", alt: "Harvey menswear portrait study for editorial portfolio" }
      ]
    },
    {
      id: "studio",
      section: "editorials",
      title: "Studio",
      kicker: "Studio fashion",
      description: "Controlled London studio fashion portraits built around posture, styling, and a clean high-fashion atmosphere.",
      covers: [{ src: "assets/images/studio-02.jpg", alt: "Controlled studio fashion portrait for a London portfolio session", className: "", previewPosition: "50% 38%" }],
      images: [
        { src: "assets/images/studio-01.jpg", alt: "London studio fashion portrait with elegant styling" },
        { src: "assets/images/studio-02.jpg", alt: "Studio editorial portrait for a model portfolio" },
        { src: "assets/images/studio-03.jpg", alt: "Studio beauty portrait with controlled light" },
        { src: "assets/images/studio-04.jpg", alt: "Studio fashion study with clean high-fashion atmosphere" },
        { src: "assets/images/studio-05.jpg", alt: "London studio editorial portrait with poised styling" }
      ]
    },
    {
      id: "dark-baroque",
      section: "editorials",
      title: "Dark Baroque",
      kicker: "Fashion editorial",
      description: "A theatrical fashion editorial shaped with candlelight, velvet drapery, black satin, pearls, and baroque glamour.",
      covers: [{ src: "assets/images/dark-baroque-01.jpg", alt: "Dark Baroque fashion portrait on a leather chaise beneath a chandelier", className: "tile-wide", previewPosition: "50% 42%" }],
      images: [
        { src: "assets/images/dark-baroque-01.jpg", alt: "Dark Baroque reclining portrait with red velvet drapery and chandelier" },
        { src: "assets/images/dark-baroque-02.jpg", alt: "Dark Baroque staged fashion portrait with blue satin and ivory floral prop" },
        { src: "assets/images/dark-baroque-03.jpg", alt: "Dark Baroque vertical editorial portrait beneath a chandelier" },
        { src: "assets/images/dark-baroque-04.jpg", alt: "Dark Baroque intimate portrait with pearls and sculptural ivory prop" },
        { src: "assets/images/dark-baroque-05.jpg", alt: "Dark Baroque motion portrait with red fan and sweeping satin" },
        { src: "assets/images/dark-baroque-06.jpg", alt: "Dark Baroque fashion portrait with theatrical red-room styling" }
      ]
    },
    {
      id: "kintsugi",
      section: "fine-art",
      title: "Kintsugi",
      kicker: "Fine art collection",
      description: "Self-produced fine-art portrait studies in beauty, fracture, repair, and transformation.",
      covers: [
        { src: "assets/images/fine-art-01.jpg", alt: "Fine-art portrait with sculptural styling and transformation theme", className: "fine-tall" },
        { src: "assets/images/kintsugi-01.jpg", alt: "Kintsugi fine-art portrait study with delicate texture", className: "" },
        { src: "assets/images/kintsugi-02.jpg", alt: "Kintsugi fine-art portrait study with contemplative pose", className: "" }
      ],
      images: [
        { src: "assets/images/fine-art-01.jpg", alt: "Kintsugi fine-art portrait with sculptural styling" },
        { src: "assets/images/kintsugi-01.jpg", alt: "Kintsugi fine-art portrait study with delicate texture" },
        { src: "assets/images/kintsugi-02.jpg", alt: "Kintsugi fine-art portrait study with contemplative pose" },
        { src: "assets/images/kintsugi-03.jpg", alt: "Kintsugi fine-art portrait study in repair and transformation" },
        { src: "assets/images/kintsugi-04.jpg", alt: "Kintsugi fine-art portrait study with symbolic texture" }
      ]
    },
    {
      id: "petals",
      section: "fine-art",
      title: "Petals",
      kicker: "Fine art portrait",
      description: "A standalone fine-art portrait built around softness, body, silk, and scattered rose petals.",
      covers: [{ src: "assets/images/fine-art-02.jpg", alt: "Fine-art portrait with rose petals on white silk", className: "fine-portrait" }],
      images: [
        { src: "assets/images/fine-art-02.jpg", alt: "Fine-art portrait with rose petals on white silk" },
        { src: "assets/images/petals-02.jpg", alt: "Petals fine-art portrait with softness and body" },
        { src: "assets/images/petals-03.jpg", alt: "Petals fine-art portrait with white silk and rose petals" }
      ]
    }
  ]
};

const canUseResponsiveDerivative = (src) => {
  if (!src || !src.startsWith("assets/images/") || src.includes("/uploads/")) {
    return false;
  }

  const relativePath = src.slice("assets/images/".length);
  return !relativePath.includes("/") && /\.(jpe?g)$/i.test(relativePath);
};

const responsiveDerivative = (src, width) => {
  const fileName = src.slice(src.lastIndexOf("/") + 1);
  const extensionIndex = fileName.lastIndexOf(".");
  const name = fileName.slice(0, extensionIndex);
  const extension = fileName.slice(extensionIndex);

  return `assets/images/responsive/${name}-${width}${extension}`;
};

const responsiveFormatDerivative = (src, width, extension) => {
  const fileName = src.slice(src.lastIndexOf("/") + 1);
  const extensionIndex = fileName.lastIndexOf(".");
  const name = fileName.slice(0, extensionIndex);

  return `assets/images/responsive/${name}-${width}.${extension}`;
};

const setResponsiveImage = (image, src, sizes = "100vw") => {
  image.src = src;

  if (canUseResponsiveDerivative(src)) {
    image.srcset = `${responsiveDerivative(src, 720)} 720w, ${responsiveDerivative(src, 1200)} 1200w`;
    image.sizes = sizes;
  } else {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
  }
};

const createResponsivePicture = (image, src, sizes = "100vw") => {
  if (!canUseResponsiveDerivative(src)) {
    setResponsiveImage(image, src, sizes);
    return image;
  }

  const picture = document.createElement("picture");

  [
    { type: "image/avif", extension: "avif" },
    { type: "image/webp", extension: "webp" }
  ].forEach((format) => {
    const source = document.createElement("source");
    source.type = format.type;
    source.srcset = `${responsiveFormatDerivative(src, 720, format.extension)} 720w, ${responsiveFormatDerivative(src, 1200, format.extension)} 1200w`;
    source.sizes = sizes;
    picture.append(source);
  });

  picture.append(image);
  setResponsiveImage(image, src, sizes);
  return picture;
};

const getCoverSizes = (item, baseClass) => {
  const isFeature = /\b(tile-large|tile-wide|fine-tall|fine-portrait|fine-wide)\b/.test(item.className || "");

  if (baseClass === "work-tile") {
    return isFeature
      ? "(max-width: 720px) 100vw, (max-width: 980px) 50vw, 50vw"
      : "(max-width: 720px) 50vw, (max-width: 980px) 50vw, 25vw";
  }

  return isFeature
    ? "(max-width: 720px) 100vw, (max-width: 980px) 50vw, 42vw"
    : "(max-width: 720px) 50vw, (max-width: 980px) 50vw, 30vw";
};

const scrollToTarget = (hash, smooth = true) => {
  if (!hash || hash === "#") {
    return false;
  }

  const target = document.querySelector(hash);

  if (!target) {
    return false;
  }

  const headerOffset = header ? header.offsetHeight + 22 : 92;
  const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
  const scrollTop = Math.max(0, top);
  document.documentElement.scrollTop = scrollTop;
  document.body.scrollTop = scrollTop;
  window.scrollTo({ top: scrollTop, behavior: smooth ? "smooth" : "auto" });
  return true;
};

const setText = (selector, value) => {
  const element = document.querySelector(selector);

  if (element && value) {
    element.textContent = value;
  }
};

const createImageButton = (item, baseClass) => {
  const button = document.createElement("button");
  button.className = [baseClass, item.className].filter(Boolean).join(" ");
  button.type = "button";
  button.dataset.gallery = item.galleryId;
  button.setAttribute("aria-label", `Open ${item.title} gallery`);

  const image = document.createElement("img");
  image.alt = item.alt || item.title;
  image.decoding = "async";
  image.loading = item.loading || "lazy";

  if (item.previewPosition) {
    image.style.objectPosition = item.previewPosition;
  }

  button.append(createResponsivePicture(image, item.src, getCoverSizes(item, baseClass)));

  if (item.label) {
    const label = document.createElement("span");
    label.textContent = item.label;
    button.append(label);
  }

  return button;
};

const normaliseCover = (album, cover) => ({
  galleryId: album.id,
  title: album.title,
  label: cover.label || album.title,
  src: cover.src,
  alt: cover.alt || album.title,
  className: cover.className || "",
  previewPosition: cover.previewPosition || "",
  loading: album.section === "fine-art" ? "eager" : "lazy"
});

const renderPortfolio = (siteData) => {
  const data = siteData && Array.isArray(siteData.albums) ? siteData : defaultSiteData;
  const sections = data.sections || defaultSiteData.sections;

  setText("[data-work-kicker]", sections.work?.kicker);
  setText("[data-work-heading]", sections.work?.heading);
  setText("[data-fine-art-kicker]", sections.fineArt?.kicker);
  setText("[data-fine-art-heading]", sections.fineArt?.heading);
  setText("[data-fine-art-intro]", sections.fineArt?.intro);

  galleries = data.albums.reduce((collection, album) => {
    collection[album.id] = album;
    return collection;
  }, {});

  if (editorialGrid) {
    editorialGrid.innerHTML = "";
    data.albums
      .filter((album) => album.section === "editorials")
      .flatMap((album) => (album.covers || []).map((cover) => normaliseCover(album, cover)))
      .forEach((cover) => editorialGrid.append(createImageButton(cover, "work-tile")));
  }

  if (fineGrid) {
    fineGrid.innerHTML = "";
    data.albums
      .filter((album) => album.section === "fine-art")
      .flatMap((album) => (album.covers || []).map((cover) => normaliseCover(album, cover)))
      .forEach((cover) => fineGrid.append(createImageButton(cover, "fine-image")));
  }

  if (servicesList && Array.isArray(sections.services)) {
    servicesList.innerHTML = "";
    sections.services.forEach((service) => {
      const item = document.createElement("span");
      item.textContent = service;
      servicesList.append(item);
    });
  }
};

const loadSiteData = async () => {
  try {
    const response = await fetch(`data/site.json?v=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Site data unavailable");
    }

    renderPortfolio(await response.json());
  } catch (error) {
    renderPortfolio(defaultSiteData);
  }
};

const setHeaderState = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
};

const closeMenu = () => {
  body.classList.remove("menu-open");
  header.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
};

const galleryImageCount = () => activeGallery?.images?.length || 0;

const setNavButtonState = (button, disabled) => {
  if (button) {
    button.disabled = disabled;
  }
};

const updateGalleryNavigation = () => {
  const count = galleryImageCount();
  const atStart = activeGalleryIndex <= 0;
  const atEnd = activeGalleryIndex >= count - 1;
  const disabled = count < 2;

  setNavButtonState(imageLightboxPrevButton, disabled || atStart);
  setNavButtonState(imageLightboxNextButton, disabled || atEnd);
};

const setActiveGalleryIndex = (index) => {
  const count = galleryImageCount();

  if (!count) {
    activeGalleryIndex = -1;
    updateGalleryNavigation();
    return activeGalleryIndex;
  }

  activeGalleryIndex = Math.min(Math.max(index, 0), count - 1);
  updateGalleryNavigation();
  return activeGalleryIndex;
};

const getGalleryFrames = () => [...galleryStrip.querySelectorAll(".gallery-frame")];

const scrollToGalleryImage = (index, smooth = true) => {
  const frames = getGalleryFrames();
  const nextIndex = setActiveGalleryIndex(index);
  const frame = frames[nextIndex];

  if (frame) {
    frame.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
      inline: "nearest"
    });
  }
};

const stepGalleryImage = (direction) => {
  const count = galleryImageCount();

  if (!count) {
    return;
  }

  if (activeGalleryIndex < 0 && direction < 0) {
    return;
  }

  const baseIndex = activeGalleryIndex < 0 && direction > 0 ? -1 : activeGalleryIndex;
  const nextIndex = Math.min(Math.max(baseIndex + direction, 0), count - 1);

  if (nextIndex !== activeGalleryIndex || activeGalleryIndex < 0) {
    scrollToGalleryImage(nextIndex);
  }
};

const showLightboxImage = (index) => {
  const count = galleryImageCount();

  if (!count) {
    return;
  }

  const nextIndex = setActiveGalleryIndex(index);
  const item = activeGallery.images[nextIndex];
  const caption = item.alt || activeGallery.title;

  imageLightboxImage.src = item.src;
  imageLightboxImage.removeAttribute("srcset");
  imageLightboxImage.alt = caption;
  imageLightboxCaption.textContent = `${nextIndex + 1} / ${count} | ${caption}`;
};

const stepLightboxImage = (direction) => {
  const count = galleryImageCount();

  if (count < 2) {
    return;
  }

  const nextIndex = Math.min(Math.max(activeGalleryIndex + direction, 0), count - 1);

  if (nextIndex !== activeGalleryIndex) {
    showLightboxImage(nextIndex);
  }
};

const syncGalleryIndexToViewport = () => {
  galleryScrollFrame = null;

  if (!galleryModal.classList.contains("is-open") || imageLightbox.classList.contains("is-open")) {
    return;
  }

  const frames = getGalleryFrames();
  const viewportCenter = window.innerHeight / 2;
  let closestIndex = -1;
  let closestDistance = Infinity;

  frames.forEach((frame, index) => {
    const rect = frame.getBoundingClientRect();

    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return;
    }

    const frameCenter = rect.top + rect.height / 2;
    const distance = Math.abs(frameCenter - viewportCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  if (closestIndex >= 0 && closestIndex !== activeGalleryIndex) {
    setActiveGalleryIndex(closestIndex);
  }
};

const queueGalleryIndexSync = () => {
  if (!galleryScrollFrame) {
    galleryScrollFrame = requestAnimationFrame(syncGalleryIndexToViewport);
  }
};

const handleSwipe = (startX, startY, endX, endY, onPrevious, onNext) => {
  const deltaX = endX - startX;
  const deltaY = endY - startY;

  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
    return false;
  }

  if (deltaX > 0) {
    onPrevious();
  } else {
    onNext();
  }

  return true;
};

const openGallery = (galleryId) => {
  const gallery = galleries[galleryId];

  if (!gallery) {
    return;
  }

  activeGallery = gallery;
  activeGalleryIndex = -1;
  galleryTitle.textContent = gallery.title;
  galleryKicker.textContent = gallery.kicker;
  galleryDescription.textContent = gallery.description;
  galleryStrip.innerHTML = "";

  gallery.images.forEach((item, index) => {
    const frame = document.createElement("button");
    frame.className = index === 0
      ? `gallery-frame gallery-frame-featured gallery-frame-${galleryId}-featured`
      : "gallery-frame";
    frame.type = "button";
    frame.dataset.galleryIndex = String(index);
    frame.setAttribute("aria-label", `Open ${item.alt || gallery.title}`);
    frame.addEventListener("click", () => openImageLightbox(index));
    frame.addEventListener("focus", () => setActiveGalleryIndex(index));

    const image = document.createElement("img");
    image.alt = item.alt || gallery.title;
    image.decoding = "async";
    image.loading = index < 4 ? "eager" : "lazy";

    if (item.previewPosition) {
      image.style.objectPosition = item.previewPosition;
    }

    const sizes = index === 0
      ? "(max-width: 720px) 100vw, 66vw"
      : "(max-width: 720px) 100vw, 33vw";

    frame.append(createResponsivePicture(image, item.src, sizes));
    galleryStrip.append(frame);
  });

  galleryModal.classList.add("is-open");
  galleryModal.setAttribute("aria-hidden", "false");
  body.classList.add("gallery-open");
  galleryModal.scrollTo(0, 0);
  updateGalleryNavigation();
  requestAnimationFrame(() => galleryCloseButtons[0]?.focus({ preventScroll: true }));
};

const openImageLightbox = (index) => {
  lastLightboxTrigger = document.activeElement;
  showLightboxImage(index);
  imageLightbox.classList.add("is-open");
  imageLightbox.setAttribute("aria-hidden", "false");
  body.classList.add("image-open");
  requestAnimationFrame(() => imageLightboxClose.focus({ preventScroll: true }));
};

const closeImageLightbox = () => {
  const shouldReturnFocus = imageLightbox.classList.contains("is-open") && galleryModal.classList.contains("is-open");

  imageLightbox.classList.remove("is-open");
  imageLightbox.setAttribute("aria-hidden", "true");
  body.classList.remove("image-open");
  imageLightboxImage.src = "";
  imageLightboxImage.removeAttribute("srcset");
  imageLightboxImage.alt = "";
  imageLightboxCaption.textContent = "";

  if (shouldReturnFocus && lastLightboxTrigger) {
    lastLightboxTrigger.focus({ preventScroll: true });
  }

  lastLightboxTrigger = null;
};

const closeGallery = () => {
  const trigger = lastGalleryTrigger;

  closeImageLightbox();
  galleryModal.classList.remove("is-open");
  galleryModal.setAttribute("aria-hidden", "true");
  body.classList.remove("gallery-open");
  activeGallery = null;
  activeGalleryIndex = -1;
  updateGalleryNavigation();

  if (trigger) {
    trigger.focus({ preventScroll: true });
  }

  lastGalleryTrigger = null;
};

menuToggle.addEventListener("click", () => {
  const isOpen = body.classList.toggle("menu-open");
  header.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

nav.addEventListener("click", (event) => {
  const link = event.target.closest("a");

  if (link && link.hash) {
    event.preventDefault();
    closeMenu();

    if (scrollToTarget(link.hash)) {
      history.pushState(null, "", link.hash);
    }

    return;
  }

  if (link) {
    closeMenu();
  }
});

document.addEventListener("click", (event) => {
  const item = event.target.closest("[data-gallery]");

  if (item) {
    lastGalleryTrigger = item;
    openGallery(item.dataset.gallery);
  }
});

galleryCloseButtons.forEach((button) => {
  button.addEventListener("click", closeGallery);
});

galleryModal.addEventListener("click", (event) => {
  if (event.target === galleryModal) {
    closeGallery();
  }
});

galleryModal.addEventListener("scroll", queueGalleryIndexSync, { passive: true });

galleryStrip.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  galleryTouchStartX = touch.clientX;
  galleryTouchStartY = touch.clientY;
}, { passive: true });

galleryStrip.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  handleSwipe(
    galleryTouchStartX,
    galleryTouchStartY,
    touch.clientX,
    touch.clientY,
    () => stepGalleryImage(-1),
    () => stepGalleryImage(1)
  );
}, { passive: true });

imageLightboxClose.addEventListener("click", closeImageLightbox);
imageLightboxPrevButton.addEventListener("click", () => stepLightboxImage(-1));
imageLightboxNextButton.addEventListener("click", () => stepLightboxImage(1));

imageLightbox.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  lightboxTouchStartX = touch.clientX;
  lightboxTouchStartY = touch.clientY;
}, { passive: true });

imageLightbox.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  handleSwipe(
    lightboxTouchStartX,
    lightboxTouchStartY,
    touch.clientX,
    touch.clientY,
    () => stepLightboxImage(-1),
    () => stepLightboxImage(1)
  );
}, { passive: true });

imageLightbox.addEventListener("click", (event) => {
  if (event.target === imageLightbox) {
    closeImageLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.key === "ArrowRight" || event.key === "ArrowDown") && galleryModal.classList.contains("is-open")) {
    event.preventDefault();

    if (imageLightbox.classList.contains("is-open")) {
      stepLightboxImage(1);
    } else {
      stepGalleryImage(1);
    }

    return;
  }

  if ((event.key === "ArrowLeft" || event.key === "ArrowUp") && galleryModal.classList.contains("is-open")) {
    event.preventDefault();

    if (imageLightbox.classList.contains("is-open")) {
      stepLightboxImage(-1);
    } else {
      stepGalleryImage(-1);
    }

    return;
  }

  if (event.key === "Escape") {
    if (imageLightbox.classList.contains("is-open")) {
      closeImageLightbox();
      return;
    }

    if (galleryModal.classList.contains("is-open")) {
      closeGallery();
      return;
    }

    closeMenu();
  }
});

form.addEventListener("invalid", (event) => {
  form.classList.add("was-submitted");
  event.target.setAttribute("aria-invalid", "true");
}, true);

form.addEventListener("input", (event) => {
  if (event.target.matches("input, textarea, select") && event.target.checkValidity()) {
    event.target.removeAttribute("aria-invalid");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  form.classList.add("was-submitted");

  const data = new FormData(form);
  const submitButton = form.querySelector(".submit-button");
  const payload = Object.fromEntries(data.entries());

  submitButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  statusMessage.textContent = "Sending enquiry...";

  fetch(form.action, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Message could not be sent.");
      }

      statusMessage.textContent = "Thanks, your enquiry has been sent.";
      form.reset();
      form.classList.remove("was-submitted");
    })
    .catch((error) => {
      statusMessage.textContent = error.message;
    })
    .finally(() => {
      submitButton.disabled = false;
      form.removeAttribute("aria-busy");
    });
});

const restoreHashScroll = () => {
  if (window.location.hash) {
    requestAnimationFrame(() => scrollToTarget(window.location.hash, false));
  }
};

const restoreHashScrollAfterRender = () => {
  restoreHashScroll();
  window.setTimeout(restoreHashScroll, 250);
  window.setTimeout(restoreHashScroll, 900);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });
window.addEventListener("load", restoreHashScrollAfterRender, { once: true });
loadSiteData().then(restoreHashScrollAfterRender);
