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
const editorialGrid = document.querySelector("[data-editorial-grid]");
const fineGrid = document.querySelector("[data-fine-grid]");
const servicesList = document.querySelector("[data-services-list]");
const form = document.querySelector(".inquiry-form");
const statusMessage = document.querySelector("[data-form-status]");

let galleries = {};

const defaultSiteData = {
  sections: {
    work: {
      kicker: "Selected editorials",
      heading: "Portraits, beauty stories, and cinematic fashion work."
    },
    fineArt: {
      kicker: "Fine art",
      heading: "Self-produced studies in beauty, fracture, and transformation.",
      intro: "Available as large-format, gallery-quality prints for private collectors, interiors, and curated spaces."
    },
    services: [
      "Fashion editorials",
      "Beauty portraits",
      "Model portfolios",
      "Personal campaigns"
    ]
  },
  albums: [
    {
      id: "roxana",
      section: "editorials",
      title: "Roxana",
      kicker: "Editorial story",
      description: "A polished beauty-led story shaped with soft glamour, reflective colour, and poised studio direction.",
      covers: [{ src: "assets/images/roxana-01.jpg", alt: "Editorial fashion portrait in warm directional light", className: "tile-large" }],
      images: [
        { src: "assets/images/roxana-01.jpg", alt: "Roxana editorial portrait in warm directional light" },
        { src: "assets/images/roxana-02.jpg", alt: "Roxana fashion portrait with refined styling" },
        { src: "assets/images/roxana-03.jpg", alt: "Roxana beauty portrait with cinematic colour" },
        { src: "assets/images/roxana-04.jpg", alt: "Roxana editorial portrait with sculptural styling" }
      ]
    },
    {
      id: "cosmic",
      section: "editorials",
      title: "Cosmic Girl",
      kicker: "Fashion editorial",
      description: "Blue-red studio light, metallic texture, and a futuristic beauty mood built around gaze and gesture.",
      covers: [{ src: "assets/images/cosmic-01.jpg", alt: "Portrait with saturated blue fashion lighting", className: "" }],
      images: [
        { src: "assets/images/cosmic-01.jpg", alt: "Cosmic Girl full-length fashion portrait", previewPosition: "50% 18%" },
        { src: "assets/images/cosmic-02.jpg", alt: "Cosmic Girl cinematic close portrait" },
        { src: "assets/images/cosmic-03.jpg", alt: "Cosmic Girl blue-lit editorial pose" },
        { src: "assets/images/cosmic-04.jpg", alt: "Cosmic Girl beauty detail" },
        { src: "assets/images/cosmic-05.jpg", alt: "Cosmic Girl atmospheric portrait" },
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
      covers: [{ src: "assets/images/julia-01.jpg", alt: "Studio portrait with refined styling", className: "" }],
      images: [
        { src: "assets/images/julia-01.jpg", alt: "Julia studio portrait with elegant styling" },
        { src: "assets/images/julia-02.jpg", alt: "Julia editorial portrait" },
        { src: "assets/images/julia-03.jpg", alt: "Julia fashion portrait study" }
      ]
    },
    {
      id: "sophie",
      section: "editorials",
      title: "Sophie",
      kicker: "Night editorial",
      description: "A nocturnal Soho sequence with cinematic street light, motion, and after-dark fashion energy.",
      covers: [{ src: "assets/images/soho-01.jpg", alt: "Nocturnal editorial portrait in Soho", className: "tile-wide" }],
      images: [
        { src: "assets/images/soho-01.jpg", alt: "Sophie nocturnal portrait in Soho" },
        { src: "assets/images/soho-02.jpg", alt: "Sophie editorial street portrait" },
        { src: "assets/images/soho-03.jpg", alt: "Sophie cinematic night portrait" }
      ]
    },
    {
      id: "harvey",
      section: "editorials",
      title: "Harvey",
      kicker: "Menswear portrait",
      description: "A masculine portrait study with low-key light, sculptural shadow, and an intimate studio mood.",
      covers: [{ src: "assets/images/harvey-01.jpg", alt: "Male fashion portrait with moody studio light", className: "" }],
      images: [
        { src: "assets/images/harvey-01.jpg", alt: "Harvey male fashion portrait" },
        { src: "assets/images/harvey-02.jpg", alt: "Harvey studio portrait" },
        { src: "assets/images/harvey-03.jpg", alt: "Harvey menswear portrait study" }
      ]
    },
    {
      id: "studio",
      section: "editorials",
      title: "Studio",
      kicker: "Studio fashion",
      description: "Controlled studio portraits built around posture, styling, and a clean high-fashion atmosphere.",
      covers: [{ src: "assets/images/studio-02.jpg", alt: "Fashion portrait from a studio session", className: "" }],
      images: [
        { src: "assets/images/studio-01.jpg", alt: "Studio fashion portrait" },
        { src: "assets/images/studio-02.jpg", alt: "Studio editorial portrait" },
        { src: "assets/images/studio-03.jpg", alt: "Studio beauty portrait" },
        { src: "assets/images/studio-04.jpg", alt: "Studio fashion study" }
      ]
    },
    {
      id: "kintsugi",
      section: "fine-art",
      title: "Kintsugi",
      kicker: "Fine art collection",
      description: "Self-produced fine-art studies in beauty, fracture, repair, and transformation.",
      covers: [
        { src: "assets/images/fine-art-01.jpg", alt: "Fine art portrait with sculptural styling", className: "fine-tall" },
        { src: "assets/images/kintsugi-01.jpg", alt: "Fine art portrait study with delicate texture", className: "" },
        { src: "assets/images/kintsugi-02.jpg", alt: "Fine art portrait study with contemplative pose", className: "" }
      ],
      images: [
        { src: "assets/images/fine-art-01.jpg", alt: "Kintsugi fine art portrait" },
        { src: "assets/images/kintsugi-01.jpg", alt: "Kintsugi fine art study one" },
        { src: "assets/images/kintsugi-02.jpg", alt: "Kintsugi fine art study two" },
        { src: "assets/images/kintsugi-03.jpg", alt: "Kintsugi fine art study three" },
        { src: "assets/images/kintsugi-04.jpg", alt: "Kintsugi fine art study four" }
      ]
    },
    {
      id: "petals",
      section: "fine-art",
      title: "Petals",
      kicker: "Fine art portrait",
      description: "A standalone fine-art portrait built around softness, body, silk, and scattered rose petals.",
      covers: [{ src: "assets/images/fine-art-02.jpg", alt: "Fine art portrait with rose petals on white silk", className: "fine-portrait" }],
      images: [{ src: "assets/images/fine-art-02.jpg", alt: "Fine art portrait with rose petals on white silk" }]
    }
  ]
};

const scrollToTarget = (hash, smooth = true) => {
  if (!hash || hash === "#") {
    return false;
  }

  const target = document.querySelector(hash);

  if (!target) {
    return false;
  }

  const top = target.getBoundingClientRect().top + window.pageYOffset - 92;
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
  image.src = item.src;
  image.alt = item.alt || item.title;
  image.loading = item.loading || "lazy";

  if (item.previewPosition) {
    image.style.objectPosition = item.previewPosition;
  }

  button.append(image);

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
  label: album.section === "editorials" ? album.title : "",
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

const openGallery = (galleryId) => {
  const gallery = galleries[galleryId];

  if (!gallery) {
    return;
  }

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
    frame.setAttribute("aria-label", `Open ${item.alt || gallery.title}`);
    frame.addEventListener("click", () => openImageLightbox(item.src, item.alt || gallery.title));

    const image = document.createElement("img");
    image.src = item.src;
    image.alt = item.alt || gallery.title;
    image.loading = "eager";

    if (item.previewPosition) {
      image.style.objectPosition = item.previewPosition;
    }

    frame.append(image);
    galleryStrip.append(frame);
  });

  galleryModal.classList.add("is-open");
  galleryModal.setAttribute("aria-hidden", "false");
  body.classList.add("gallery-open");
  galleryModal.scrollTo(0, 0);
};

const openImageLightbox = (src, alt) => {
  imageLightboxImage.src = src;
  imageLightboxImage.alt = alt;
  imageLightboxCaption.textContent = alt;
  imageLightbox.classList.add("is-open");
  imageLightbox.setAttribute("aria-hidden", "false");
  body.classList.add("image-open");
};

const closeImageLightbox = () => {
  imageLightbox.classList.remove("is-open");
  imageLightbox.setAttribute("aria-hidden", "true");
  body.classList.remove("image-open");
  imageLightboxImage.src = "";
  imageLightboxImage.alt = "";
  imageLightboxCaption.textContent = "";
};

const closeGallery = () => {
  closeImageLightbox();
  galleryModal.classList.remove("is-open");
  galleryModal.setAttribute("aria-hidden", "true");
  body.classList.remove("gallery-open");
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

imageLightboxClose.addEventListener("click", closeImageLightbox);

imageLightbox.addEventListener("click", (event) => {
  if (event.target === imageLightbox) {
    closeImageLightbox();
  }
});

document.addEventListener("keydown", (event) => {
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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const contactEmail = form.dataset.contactEmail;
  const subject = `Photography enquiry from ${data.get("name")}`;
  const bodyLines = [
    `Name: ${data.get("name")}`,
    `Email: ${data.get("email")}`,
    `Project type: ${data.get("project")}`,
    "",
    data.get("message")
  ];
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

  window.location.href = mailto;
  statusMessage.textContent = `Email draft opened for ${contactEmail}.`;
  form.reset();
});

setHeaderState();
loadSiteData();
window.addEventListener("scroll", setHeaderState, { passive: true });

const restoreHashScroll = () => {
  requestAnimationFrame(() => scrollToTarget(window.location.hash, false));
};

if (document.readyState === "complete") {
  restoreHashScroll();
} else {
  window.addEventListener("load", restoreHashScroll);
}
