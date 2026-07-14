const body = document.body;
const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const galleryModal = document.querySelector("[data-gallery-modal]");
const galleryTitle = document.querySelector("[data-gallery-title]");
const galleryKicker = document.querySelector("[data-gallery-kicker]");
const galleryMeta = document.querySelector("[data-gallery-meta]");
const galleryDescription = document.querySelector("[data-gallery-description]");
const galleryProjectPageLink = document.querySelector("[data-gallery-project-page]");
const galleryStrip = document.querySelector("[data-gallery-strip]");
const galleryCloseButtons = document.querySelectorAll("[data-gallery-close]");
const galleryPrevProjectButton = document.querySelector("[data-gallery-prev-project]");
const galleryNextProjectButton = document.querySelector("[data-gallery-next-project]");
const imageLightbox = document.querySelector("[data-image-lightbox]");
const imageLightboxImage = document.querySelector("[data-image-lightbox-image]");
const imageLightboxCaption = document.querySelector("[data-image-lightbox-caption]");
const imageLightboxClose = document.querySelector("[data-image-lightbox-close]");
const imageLightboxPrevButton = document.querySelector("[data-image-lightbox-prev]");
const imageLightboxNextButton = document.querySelector("[data-image-lightbox-next]");
const editorialGrid = document.querySelector("[data-editorial-grid]");
const fineGrid = document.querySelector("[data-fine-grid]");
const servicesList = document.querySelector("[data-services-list]");
const printShopGrid = document.querySelector("[data-print-shop-grid]");
const printShopSection = printShopGrid?.closest(".print-shop");
const printShopStatus = document.querySelector("[data-print-shop-status]");
const printOrderModal = document.querySelector("[data-print-order-modal]");
const printOrderForm = document.querySelector("[data-print-order-form]");
const printOrderClose = document.querySelector("[data-print-order-close]");
const printOrderImage = document.querySelector("[data-print-order-image]");
const printOrderSeries = document.querySelector("[data-print-order-series]");
const printOrderTitle = document.querySelector("[data-print-order-title]");
const printOrderPrice = document.querySelector("[data-print-order-price]");
const printOrderOption = document.querySelector("[data-print-order-option]");
const printOrderProductId = document.querySelector("[data-print-order-product-id]");
const printOrderDelivery = document.querySelector("[data-print-order-delivery]");
const printOrderStatus = document.querySelector("[data-print-order-status]");
const form = document.querySelector(".inquiry-form");
const statusMessage = document.querySelector("[data-form-status]");
const sectionNavLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const protectedImageSelector = "img, picture, source";

let galleries = {};
let galleryOrder = [];
let activeGallery = null;
let activeGalleryIndex = -1;
let galleryScrollFrame = null;
let galleryTouchStartX = 0;
let galleryTouchStartY = 0;
let lightboxTouchStartX = 0;
let lightboxTouchStartY = 0;
let lastGalleryTrigger = null;
let lastLightboxTrigger = null;
let printProducts = [];
let activePrintOrderProduct = null;
let activePrintOrderDraft = null;
let activeDeliveryOption = null;
let lastPrintOrderTrigger = null;
let editorialLayoutFrame = null;
const enquiryAttributionStorageKey = "davide-studios-enquiry-attribution-v1";
const pendingEnquiryStorageKey = "davide-studios-pending-enquiry-v1";

const boundedAttributionValue = (value, maxLength) => String(value || "").trim().slice(0, maxLength);
const analyticsConsentState = () => {
  const state = window.StudioPrivacy?.getAnalyticsState?.();
  return ["granted", "denied"].includes(state) ? state : "unset";
};

const captureEnquiryAttribution = () => {
  const consentState = analyticsConsentState();
  try {
    const stored = JSON.parse(sessionStorage.getItem(enquiryAttributionStorageKey) || "null");
    if (stored && typeof stored === "object" && consentState === "granted") {
      return { ...stored, consent_state: consentState };
    }
  } catch (error) {
    // Session storage is optional; attribution can still be captured for this page view.
  }

  const params = new URLSearchParams(window.location.search);
  let referrerHost = "";
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.hostname !== window.location.hostname) {
      referrerHost = referrer.hostname.toLowerCase().replace(/^www\./, "");
    }
  } catch (error) {
    referrerHost = "";
  }
  const attribution = {
    landing_path: boundedAttributionValue(window.location.pathname || "/", 240),
    referrer_host: boundedAttributionValue(referrerHost, 253),
    utm_source: boundedAttributionValue(params.get("utm_source"), 120),
    utm_medium: boundedAttributionValue(params.get("utm_medium"), 120),
    utm_campaign: boundedAttributionValue(params.get("utm_campaign"), 160),
    utm_content: boundedAttributionValue(params.get("utm_content"), 160),
    utm_term: boundedAttributionValue(params.get("utm_term"), 160),
    consent_state: consentState
  };
  try {
    if (consentState === "granted") {
      sessionStorage.setItem(enquiryAttributionStorageKey, JSON.stringify(attribution));
    } else {
      sessionStorage.removeItem(enquiryAttributionStorageKey);
    }
  } catch (error) {}
  return attribution;
};

const newEnquiryId = () => {
  if (window.crypto?.randomUUID) return `enq_${window.crypto.randomUUID().replaceAll("-", "")}`;
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `enq_${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
};

const pendingEnquiry = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(pendingEnquiryStorageKey) || "null");
    if (stored?.enquiry_id && stored?.submitted_at) return stored;
  } catch (error) {}
  const value = { enquiry_id: newEnquiryId(), submitted_at: new Date().toISOString() };
  try { sessionStorage.setItem(pendingEnquiryStorageKey, JSON.stringify(value)); } catch (error) {}
  return value;
};

const defaultSiteData = {
  sections: {
    work: {
      kicker: "Selected editorials",
      heading: "London fashion editorials, beauty stories, and cinematic portrait work."
    },
    fineArt: {
      kicker: "Fine art",
      heading: "Fine-art portrait studies in beauty, fracture, and transformation.",
      intro: "Selected works are available as large-format, gallery-quality prints for private collectors, interiors, and curated spaces."
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

const categoryByGallery = {
  roxana: "Beauty",
  cosmic: "Fashion",
  julia: "Portrait",
  sophie: "Fashion",
  harvey: "Portrait",
  studio: "Model portfolio",
  "dark-baroque": "Fashion",
  kintsugi: "Fine Art",
  petals: "Fine Art"
};

const locationByGallery = {
  roxana: "London",
  cosmic: "London studio",
  julia: "London",
  sophie: "Soho, London",
  harvey: "London studio",
  studio: "London studio",
  "dark-baroque": "London",
  kintsugi: "London",
  petals: "London"
};

const imageDimensions = {
  "assets/images/about-portrait.jpg": [1920, 1193],
  "assets/images/cosmic-01.jpg": [1365, 2048],
  "assets/images/cosmic-02.jpg": [2048, 1445],
  "assets/images/cosmic-03.jpg": [1365, 2048],
  "assets/images/cosmic-04.jpg": [1365, 2048],
  "assets/images/cosmic-05.jpg": [1365, 2048],
  "assets/images/cosmic-06.jpg": [1365, 2048],
  "assets/images/cosmic-07.jpg": [1365, 2048],
  "assets/images/dark-baroque-01.jpg": [2048, 1365],
  "assets/images/dark-baroque-02.jpg": [2048, 1365],
  "assets/images/dark-baroque-03.jpg": [1365, 2048],
  "assets/images/dark-baroque-04.jpg": [2048, 1365],
  "assets/images/dark-baroque-05.jpg": [2048, 1365],
  "assets/images/dark-baroque-06.jpg": [1365, 2048],
  "assets/images/fine-art-01.jpg": [1352, 2048],
  "assets/images/fine-art-02.jpg": [1366, 2048],
  "assets/images/harvey-01.jpg": [1528, 2048],
  "assets/images/harvey-02.jpg": [1328, 2048],
  "assets/images/harvey-03.jpg": [1920, 1300],
  "assets/images/hero-cosmic-girl.jpg": [1733, 1355],
  "assets/images/julia-01.jpg": [1536, 2048],
  "assets/images/julia-02.jpg": [2048, 1365],
  "assets/images/julia-03.jpg": [2048, 1351],
  "assets/images/julia-04.jpg": [1373, 2048],
  "assets/images/julia-05.jpg": [2048, 1341],
  "assets/images/kintsugi-01.jpg": [1365, 2048],
  "assets/images/kintsugi-02.jpg": [1365, 2048],
  "assets/images/kintsugi-03.jpg": [1365, 2048],
  "assets/images/kintsugi-04.jpg": [1352, 2048],
  "assets/images/petals-02.jpg": [2048, 1365],
  "assets/images/petals-03.jpg": [1365, 2048],
  "assets/images/roxana-01.jpg": [1920, 1280],
  "assets/images/roxana-02.jpg": [1920, 1103],
  "assets/images/roxana-03.jpg": [1920, 1440],
  "assets/images/roxana-04.jpg": [2048, 1536],
  "assets/images/sophie-01.jpg": [2048, 1482],
  "assets/images/sophie-02.jpg": [2048, 1365],
  "assets/images/sophie-03.jpg": [2048, 1365],
  "assets/images/sophie-04.jpg": [2048, 1365],
  "assets/images/sophie-06.jpg": [2048, 1365],
  "assets/images/sophie-07.jpg": [2048, 1365],
  "assets/images/sophie-08.jpg": [2048, 1365],
  "assets/images/sophie-09.jpg": [2048, 1365],
  "assets/images/sophie-11.jpg": [2048, 1365],
  "assets/images/studio-01.jpg": [1241, 2048],
  "assets/images/studio-02.jpg": [1754, 2048],
  "assets/images/studio-03.jpg": [1920, 1280],
  "assets/images/studio-04.jpg": [1783, 2048],
  "assets/images/studio-05.jpg": [2048, 1365]
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
  image.draggable = false;
  image.src = src;

  const dimensions = imageDimensions[src];

  if (dimensions) {
    image.width = dimensions[0];
    image.height = dimensions[1];
  }

  if (canUseResponsiveDerivative(src)) {
    image.srcset = `${responsiveDerivative(src, 720)} 720w, ${responsiveDerivative(src, 1200)} 1200w`;
    image.sizes = sizes;
  } else {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
  }
};

const isProtectedImageTarget = (target) => Boolean(target.closest(protectedImageSelector));

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
  const isFeature = /\b(tile-large|tile-wide|tile-tall|fine-tall|fine-portrait|fine-wide)\b/.test(item.className || "");

  if (baseClass === "work-tile") {
    return isFeature
      ? "(max-width: 720px) 100vw, (max-width: 980px) 100vw, 50vw"
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

  const headerOffset = header
    ? (window.matchMedia("(max-width: 720px)").matches ? 66 : 68)
    : 92;
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

const editorialFallbackRatio = (tile) => {
  if (tile.classList.contains("tile-wide")) {
    return 1.45;
  }

  if (tile.classList.contains("tile-large")) {
    return 0.72;
  }

  return 0.74;
};

const editorialTileHeight = (tile, imageRatio) => {
  const width = tile.getBoundingClientRect().width;
  const ratio = Number.isFinite(imageRatio) && imageRatio > 0
    ? imageRatio
    : editorialFallbackRatio(tile);

  if (!width) {
    return { height: width || 320, letterboxed: false };
  }

  const desiredHeight = width / ratio;
  const minHeight = width * 0.55;
  const maxHeight = width * 1.65;
  const height = Math.min(Math.max(desiredHeight, minHeight), maxHeight);

  return {
    height,
    letterboxed: Math.abs(height - desiredHeight) > 8
  };
};

const layoutEditorialGrid = () => {
  editorialLayoutFrame = null;

  if (!editorialGrid) {
    return;
  }

  const tiles = [...editorialGrid.querySelectorAll(".work-tile")];

  if (window.matchMedia("(max-width: 720px)").matches) {
    tiles.forEach((tile) => {
      tile.style.removeProperty("--tile-rows");
      tile.classList.remove("is-letterboxed");
    });
    return;
  }

  const styles = window.getComputedStyle(editorialGrid);
  const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
  const rowGap = Number.parseFloat(styles.rowGap) || 0;

  tiles.forEach((tile) => {
    const image = tile.querySelector("img");
    const ratio = image?.naturalWidth && image?.naturalHeight
      ? image.naturalWidth / image.naturalHeight
      : 0;
    const { height, letterboxed } = editorialTileHeight(tile, ratio);
    const rowSpan = Math.max(8, Math.round((height + rowGap) / (rowHeight + rowGap)));

    tile.style.setProperty("--tile-rows", String(rowSpan));
    tile.classList.toggle("is-letterboxed", letterboxed);
  });
};

const queueEditorialLayout = () => {
  if (!editorialLayoutFrame) {
    editorialLayoutFrame = requestAnimationFrame(layoutEditorialGrid);
  }
};

const createImageButton = (item, baseClass) => {
  const button = document.createElement(item.projectSlug ? "a" : "button");
  button.className = [baseClass, item.className].filter(Boolean).join(" ");
  if (item.projectSlug) {
    button.href = `/work/${encodeURIComponent(item.projectSlug)}`;
  } else {
    button.type = "button";
  }
  button.dataset.gallery = item.galleryId;
  button.setAttribute("aria-label", `Open ${item.title} story`);

  const image = document.createElement("img");
  image.alt = item.alt || item.title;
  image.decoding = "async";
  image.loading = item.loading || "lazy";

  if (item.previewPosition) {
    image.style.objectPosition = item.previewPosition;
  }

  if (baseClass === "work-tile") {
    image.addEventListener("load", queueEditorialLayout, { once: true });
  }

  button.append(createResponsivePicture(image, item.src, getCoverSizes(item, baseClass)));

  if (item.label) {
    const caption = document.createElement("span");
    caption.className = "tile-caption";

    const category = document.createElement("span");
    category.className = "tile-category";
    category.textContent = item.category || item.kicker || "Portfolio";

    const title = document.createElement("span");
    title.className = "tile-title";
    title.textContent = item.label;

    const action = document.createElement("span");
    action.className = "tile-action";
    action.textContent = "View story";

    caption.append(category, title, action);
    button.append(caption);
  }

  return button;
};

const formatPrintMoney = (amount, currencyCode = "GBP") => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode || "GBP",
      maximumFractionDigits: numericAmount % 1 === 0 ? 0 : 2
    }).format(numericAmount);
  } catch (error) {
    return `${currencyCode || "GBP"} ${numericAmount.toFixed(numericAmount % 1 === 0 ? 0 : 2)}`;
  }
};

const printOptionLabel = (option) => {
  const details = [
    option.size,
    option.frame
  ].filter(Boolean).join(" / ");
  const price = formatPrintMoney(option.price, option.currencyCode || "GBP");

  return [details || "Print option", price].filter(Boolean).join(" - ");
};

const createPrintProductCard = (product) => {
  const article = document.createElement("article");
  article.className = "print-card";

  const figure = document.createElement("figure");
  figure.className = "print-card-image";

  const image = document.createElement("img");
  image.alt = product.alt || product.title;
  image.decoding = "async";
  image.loading = "lazy";

  if (product.image) {
    figure.append(createResponsivePicture(image, product.image, "(max-width: 720px) 100vw, (max-width: 980px) 50vw, 25vw"));
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "print-card-placeholder";
    placeholder.textContent = product.series || "Creativehub print";
    figure.append(placeholder);
  }

  const content = document.createElement("div");
  content.className = "print-card-content";

  const series = document.createElement("p");
  series.className = "print-card-series";
  series.textContent = product.series || "Fine art print";

  const title = document.createElement("h3");
  title.textContent = product.title;

  const description = document.createElement("p");
  description.className = "print-card-description";
  description.textContent = product.description || "";

  const specs = document.createElement("dl");
  specs.className = "print-card-specs";

  [
    ["Paper", product.paper],
    ["Edition", product.edition],
    ["Sizes", Array.isArray(product.sizes) ? product.sizes.join(" / ") : product.sizes],
    ["Fulfilment", product.fulfillment]
  ].forEach(([term, value]) => {
    if (!value) {
      return;
    }

    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    specs.append(dt, dd);
  });

  const purchase = document.createElement("div");
  purchase.className = "print-card-purchase";

  const price = document.createElement("p");
  price.className = "print-card-price";
  price.textContent = product.fromPrice || "Price on request";

  const button = document.createElement("button");
  button.className = "shop-buy-button";
  button.type = "button";
  button.dataset.printOrder = product.id;
  button.disabled = !Array.isArray(product.printOptions) || !product.printOptions.length;
  button.textContent = "Order print";
  button.setAttribute("aria-label", `Order print: ${product.title}`);
  purchase.append(price, button);

  content.append(series, title, description, specs, purchase);
  article.append(figure, content);

  return article;
};

const resetPrintOrderFeedback = () => {
  activePrintOrderDraft = null;
  activeDeliveryOption = null;

  if (printOrderStatus) {
    printOrderStatus.textContent = "";
  }

  if (printOrderDelivery) {
    printOrderDelivery.hidden = true;
    printOrderDelivery.innerHTML = "";
  }

  const submitButton = printOrderForm?.querySelector(".print-order-submit");

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Continue to delivery";
  }
};

const closePrintOrder = () => {
  if (!printOrderModal) {
    return;
  }

  const trigger = lastPrintOrderTrigger;
  printOrderModal.classList.remove("is-open");
  printOrderModal.setAttribute("aria-hidden", "true");
  body.classList.remove("print-order-open");
  activePrintOrderProduct = null;
  printOrderForm?.reset();
  resetPrintOrderFeedback();

  if (trigger) {
    trigger.focus({ preventScroll: true });
  }

  lastPrintOrderTrigger = null;
};

const populatePrintOrderOptions = (product) => {
  if (!printOrderOption) {
    return;
  }

  printOrderOption.innerHTML = "";
  (product.printOptions || []).forEach((option) => {
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = printOptionLabel(option);
    printOrderOption.append(item);
  });
};

const openPrintOrder = (product, trigger) => {
  if (!printOrderModal || !printOrderForm || !product) {
    return;
  }

  activePrintOrderProduct = product;
  lastPrintOrderTrigger = trigger;
  printOrderForm.reset();
  resetPrintOrderFeedback();
  populatePrintOrderOptions(product);

  if (printOrderProductId) {
    printOrderProductId.value = product.creativehubProductId || "";
  }

  if (printOrderSeries) {
    printOrderSeries.textContent = product.series || "Print shop";
  }

  if (printOrderTitle) {
    printOrderTitle.textContent = product.title;
  }

  if (printOrderPrice) {
    printOrderPrice.textContent = product.fromPrice || "Price on request";
  }

  if (printOrderImage) {
    printOrderImage.innerHTML = "";

    if (product.image) {
      const image = document.createElement("img");
      image.alt = product.alt || product.title;
      image.decoding = "async";
      image.loading = "eager";
      printOrderImage.append(createResponsivePicture(image, product.image, "(max-width: 720px) 100vw, 38vw"));
    }
  }

  printOrderModal.classList.add("is-open");
  printOrderModal.setAttribute("aria-hidden", "false");
  body.classList.add("print-order-open");
  requestAnimationFrame(() => printOrderOption?.focus({ preventScroll: true }));
};

const renderPrintOrderDelivery = (result) => {
  if (!printOrderDelivery) {
    return;
  }

  activePrintOrderDraft = result;
  activeDeliveryOption = null;
  printOrderDelivery.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "print-order-costs";

  const subtotal = document.createElement("p");
  subtotal.textContent = `Print subtotal ${result.retailSubtotalLabel || ""}`.trim();
  summary.append(subtotal);

  const options = Array.isArray(result.deliveryOptions) ? result.deliveryOptions : [];

  if (options.length) {
    const list = document.createElement("fieldset");
    list.className = "print-order-delivery-options";
    const legend = document.createElement("legend");
    legend.textContent = "Delivery options";
    list.append(legend);

    options.forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "print-order-delivery-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "deliveryOptionId";
      input.value = String(option.id);
      input.required = true;
      input.dataset.deliveryIndex = String(index);

      const text = document.createElement("span");
      const method = [option.method, option.deliveryTime].filter(Boolean).join(" / ");
      text.textContent = `${method || "Delivery"} ${option.priceLabel || ""}`.trim();

      input.addEventListener("change", () => {
        activeDeliveryOption = option;
        const total = Number((Number(result.retailSubtotal || 0) + Number(option.price || 0)).toFixed(2));

        if (printOrderStatus) {
          printOrderStatus.textContent = `Delivery selected. Order total: ${formatPrintMoney(total, result.option?.currencyCode || "GBP")}.`;
        }

        const submitButton = printOrderForm?.querySelector(".print-order-submit");

        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Continue to payment";
        }
      });

      label.append(input, text);
      list.append(label);
    });

    summary.append(list);
  }

  const note = document.createElement("p");
  note.className = "print-order-note";
  note.textContent = "Choose a delivery option to continue.";
  summary.append(note);
  printOrderDelivery.append(summary);
  printOrderDelivery.hidden = false;

  const submitButton = printOrderForm?.querySelector(".print-order-submit");

  if (submitButton) {
    submitButton.disabled = options.length > 0;
    submitButton.textContent = options.length ? "Choose delivery option" : "Continue";
  }
};

const submitPrintOrder = async () => {
  if (!printOrderForm || !activePrintOrderProduct) {
    return;
  }

  if (activePrintOrderDraft) {
    if (!activeDeliveryOption) {
      if (printOrderStatus) {
        printOrderStatus.textContent = "Choose a delivery option before continuing.";
      }

      return;
    }

    const submitButton = printOrderForm.querySelector(".print-order-submit");
    submitButton.disabled = true;
    printOrderForm.setAttribute("aria-busy", "true");

    if (printOrderStatus) {
      printOrderStatus.textContent = "Opening secure payment checkout...";
    }

    try {
      const response = await fetch("/api/prints", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "createPayment",
          orderToken: activePrintOrderDraft.orderToken,
          deliveryOptionId: activeDeliveryOption.id
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.redirectUrl) {
        throw new Error(result.error || "Payment checkout is not available yet.");
      }

      window.location.href = result.redirectUrl;
    } catch (error) {
      if (printOrderStatus) {
        printOrderStatus.textContent = error.message;
      }

      submitButton.disabled = false;
      printOrderForm.removeAttribute("aria-busy");
    }

    return;
  }

  if (!printOrderForm.reportValidity()) {
    return;
  }

  const submitButton = printOrderForm.querySelector(".print-order-submit");
  const data = Object.fromEntries(new FormData(printOrderForm).entries());
  const payload = {
    action: "createOrder",
    productId: Number(data.productId || activePrintOrderProduct.creativehubProductId),
    printOptionId: Number(data.printOptionId),
    quantity: Number(data.quantity || 1),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    shippingAddress: {
      firstName: data.firstName,
      lastName: data.lastName,
      line1: data.line1,
      line2: data.line2,
      town: data.town,
      county: data.county,
      postCode: data.postCode,
      phone: data.phone
    }
  };

  submitButton.disabled = true;
  printOrderForm.setAttribute("aria-busy", "true");
  resetPrintOrderFeedback();

  if (printOrderStatus) {
    printOrderStatus.textContent = "Checking Creativehub delivery...";
  }

  try {
    const response = await fetch("/api/prints", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Creativehub could not create the print order right now.");
    }

    renderPrintOrderDelivery(result);

    if (printOrderStatus) {
      printOrderStatus.textContent = Array.isArray(result.deliveryOptions) && result.deliveryOptions.length
        ? "Choose a delivery option to continue."
        : "Creativehub order details are ready.";
    }
  } catch (error) {
    if (printOrderStatus) {
      printOrderStatus.textContent = error.message;
    }
  } finally {
    submitButton.disabled = Boolean(activePrintOrderDraft && !activeDeliveryOption);
    printOrderForm.removeAttribute("aria-busy");
  }
};

const scopedCoverClass = (baseClass, className = "") => {
  const allowedPattern = baseClass === "work-tile"
    ? /\b(tile-large|tile-wide|tile-tall)\b/g
    : /\b(fine-tall|fine-wide|fine-portrait)\b/g;

  return [...String(className).matchAll(allowedPattern)]
    .map((match) => match[1])
    .join(" ");
};

const publicProjectSlug = (album = {}) => {
  if (album.projectPage?.published === false) return "";
  const slug = String(album.projectPage?.slug || album.id || "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
};

const normaliseCover = (album, cover, baseClass = "work-tile") => ({
  galleryId: album.id,
  projectSlug: publicProjectSlug(album),
  title: album.title,
  label: cover.label || album.title,
  src: cover.src,
  alt: cover.alt || album.title,
  kicker: album.kicker,
  category: album.category || categoryByGallery[album.id] || album.kicker,
  className: baseClass === "work-tile"
    ? scopedCoverClass(baseClass, cover.workClassName || cover.className)
    : scopedCoverClass(baseClass, cover.fineClassName || cover.className),
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

  galleryOrder = [...data.albums]
    .filter((album) => album.section === "editorials" || album.section === "fine-art")
    .map((album) => album.id);

  if (editorialGrid) {
    editorialGrid.innerHTML = "";
    [...data.albums]
      .filter((album) => album.section === "editorials")
      .flatMap((album) => (album.covers || []).slice(0, 1).map((cover) => normaliseCover(album, cover, "work-tile")))
      .forEach((cover) => editorialGrid.append(createImageButton(cover, "work-tile")));
    queueEditorialLayout();
  }

  if (fineGrid) {
    fineGrid.innerHTML = "";
    data.albums
      .filter((album) => album.section === "fine-art")
      .flatMap((album) => (album.covers || []).map((cover) => normaliseCover(album, cover, "fine-image")))
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

const renderPrintShop = (printData) => {
  if (!printShopGrid) {
    return;
  }

  const data = printData && Array.isArray(printData.prints)
    ? printData
    : { prints: [], settings: { leadTime: "Creativehub products could not be loaded right now." } };
  printProducts = data.prints.filter((product) => product && product.id && product.title);
  printShopGrid.classList.toggle("is-single", printProducts.length === 1);
  printShopGrid.innerHTML = "";

  if (printProducts.length) {
    printProducts.forEach((product) => {
      printShopGrid.append(createPrintProductCard(product));
    });
  } else {
    const empty = document.createElement("p");
    empty.className = "print-shop-empty";
    empty.textContent = data.configured === false
      ? "Creativehub API connection pending."
      : data.error || "No Creativehub print products are currently listed.";
    printShopGrid.append(empty);
  }

  if (printShopStatus) {
    printShopStatus.textContent = data.error || data.settings?.leadTime || "";
  }
};

const loadPrintShopData = async () => {
  if (!printShopGrid || printShopSection?.hidden) {
    return;
  }

  try {
    const response = await fetch(`/api/prints?v=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Creativehub products could not be loaded right now.");
    }

    renderPrintShop(data);
  } catch (error) {
    renderPrintShop({
      error: error.message,
      prints: []
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

const setActiveNavLink = (hash) => {
  sectionNavLinks.forEach((link) => {
    if (link.hash === hash) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

const initActiveNav = () => {
  if (!sectionNavLinks.length || !("IntersectionObserver" in window)) {
    return;
  }

  const observedSections = sectionNavLinks
    .map((link) => document.querySelector(link.hash))
    .filter(Boolean);

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible?.target?.id) {
      setActiveNavLink(`#${visible.target.id}`);
    }
  }, {
    rootMargin: "-38% 0px -54% 0px",
    threshold: [0, 0.18, 0.4]
  });

  observedSections.forEach((section) => observer.observe(section));
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

const renderGalleryMeta = (gallery) => {
  if (!galleryMeta) {
    return;
  }

  galleryMeta.innerHTML = "";

  [
    ["Category", gallery.category || categoryByGallery[gallery.id] || gallery.kicker],
    ["Location", gallery.location || locationByGallery[gallery.id]],
    ["Year", gallery.year],
    ["Credits", gallery.credits]
  ].forEach(([term, value]) => {
    if (!value) {
      return;
    }

    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    galleryMeta.append(dt, dd);
  });
};

const updateProjectNavigation = () => {
  const currentIndex = galleryOrder.indexOf(activeGallery?.id);
  const hasMultipleProjects = galleryOrder.length > 1 && currentIndex >= 0;

  [galleryPrevProjectButton, galleryNextProjectButton].forEach((button) => {
    if (button) {
      button.disabled = !hasMultipleProjects;
    }
  });
};

const stepProject = (direction) => {
  if (!activeGallery || galleryOrder.length < 2) {
    return;
  }

  const currentIndex = galleryOrder.indexOf(activeGallery.id);

  if (currentIndex === -1) {
    return;
  }

  const nextIndex = (currentIndex + direction + galleryOrder.length) % galleryOrder.length;
  openGallery(galleryOrder[nextIndex]);
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
  if (galleryProjectPageLink) {
    const slug = publicProjectSlug(gallery);
    galleryProjectPageLink.hidden = !slug;
    if (slug) {
      galleryProjectPageLink.href = `/work/${encodeURIComponent(slug)}`;
      galleryProjectPageLink.setAttribute("aria-label", `Open the shareable ${gallery.title} project page`);
    }
  }
  renderGalleryMeta(gallery);
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
  updateProjectNavigation();
  window.trackStudioEvent?.("portfolio_story_open", {
    project_id: gallery.id,
    project_title: gallery.title,
    project_category: gallery.category || categoryByGallery[gallery.id] || gallery.kicker
  });
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
      setActiveNavLink(link.hash);
      history.pushState(null, "", link.hash);
    }

    return;
  }

  if (link) {
    closeMenu();
  }
});

document.addEventListener("click", (event) => {
  if (!event.defaultPrevented) {
    const anchor = event.target.closest('a[href^="#"]');

    if (anchor && anchor.hash) {
      event.preventDefault();
      closeMenu();

      if (scrollToTarget(anchor.hash)) {
        setActiveNavLink(anchor.hash);
        history.pushState(null, "", anchor.hash);
      }

      return;
    }
  }

  const item = event.target.closest("[data-gallery]");

  if (item) {
    if (item.matches("a[href]")
      && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) {
      return;
    }
    event.preventDefault();
    lastGalleryTrigger = item;
    openGallery(item.dataset.gallery);
  }

  const printButton = event.target.closest("[data-print-order]");

  if (printButton) {
    const product = printProducts.find((item) => item.id === printButton.dataset.printOrder);
    openPrintOrder(product, printButton);
  }
});

document.addEventListener("contextmenu", (event) => {
  if (isProtectedImageTarget(event.target)) {
    event.preventDefault();
  }
});

document.addEventListener("dragstart", (event) => {
  if (isProtectedImageTarget(event.target)) {
    event.preventDefault();
  }
});

galleryCloseButtons.forEach((button) => {
  button.addEventListener("click", closeGallery);
});

galleryPrevProjectButton?.addEventListener("click", () => stepProject(-1));
galleryNextProjectButton?.addEventListener("click", () => stepProject(1));

printOrderClose?.addEventListener("click", closePrintOrder);

printOrderModal?.addEventListener("click", (event) => {
  if (event.target === printOrderModal) {
    closePrintOrder();
  }
});

printOrderForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrintOrder();
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
    if (printOrderModal?.classList.contains("is-open")) {
      closePrintOrder();
      return;
    }

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
  try { sessionStorage.removeItem(pendingEnquiryStorageKey); } catch (error) {}
  if (event.target.matches("input, textarea, select") && event.target.checkValidity()) {
    event.target.removeAttribute("aria-invalid");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  form.classList.add("was-submitted");

  const data = new FormData(form);
  const submitButton = form.querySelector(".submit-button");
  const submission = pendingEnquiry();
  const payload = {
    ...Object.fromEntries(data.entries()),
    ...submission,
    attribution: captureEnquiryAttribution()
  };

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
      if (result.enquiry_id) {
        window.trackStudioEvent?.("generate_lead", {
          form_name: "commission_enquiry",
          project_type: data.get("project") || ""
        });
      }
      try { sessionStorage.removeItem(pendingEnquiryStorageKey); } catch (error) {}
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
initActiveNav();
window.addEventListener("scroll", setHeaderState, { passive: true });
window.addEventListener("resize", queueEditorialLayout, { passive: true });
window.addEventListener("load", restoreHashScrollAfterRender, { once: true });
loadSiteData().then(restoreHashScrollAfterRender);
loadPrintShopData().then(restoreHashScrollAfterRender);
