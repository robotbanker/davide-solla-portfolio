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
const form = document.querySelector(".inquiry-form");
const statusMessage = document.querySelector("[data-form-status]");

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

const galleries = {
  roxana: {
    title: "Roxana",
    kicker: "Editorial story",
    description: "A polished beauty-led story shaped with soft glamour, reflective colour, and poised studio direction.",
    images: [
      ["assets/images/roxana-01.jpg", "Roxana editorial portrait in warm directional light"],
      ["assets/images/roxana-02.jpg", "Roxana fashion portrait with refined styling"],
      ["assets/images/roxana-03.jpg", "Roxana beauty portrait with cinematic colour"]
    ]
  },
  cosmic: {
    title: "Cosmic Girl",
    kicker: "Fashion editorial",
    description: "Blue-red studio light, metallic texture, and a futuristic beauty mood built around gaze and gesture.",
    images: [
      ["assets/images/cosmic-01.jpg", "Cosmic Girl full-length fashion portrait"],
      ["assets/images/cosmic-02.jpg", "Cosmic Girl cinematic close portrait"],
      ["assets/images/cosmic-03.jpg", "Cosmic Girl blue-lit editorial pose"],
      ["assets/images/cosmic-04.jpg", "Cosmic Girl beauty detail"],
      ["assets/images/cosmic-05.jpg", "Cosmic Girl atmospheric portrait"]
    ]
  },
  julia: {
    title: "Julia",
    kicker: "Portrait story",
    description: "A quiet fashion portrait series with winter styling, direct expression, and a restrained editorial palette.",
    images: [
      ["assets/images/julia-01.jpg", "Julia studio portrait with elegant styling"],
      ["assets/images/julia-02.jpg", "Julia editorial portrait"],
      ["assets/images/julia-03.jpg", "Julia fashion portrait study"]
    ]
  },
  sophie: {
    title: "Sophie",
    kicker: "Night editorial",
    description: "A nocturnal Soho sequence with cinematic street light, motion, and after-dark fashion energy.",
    images: [
      ["assets/images/soho-01.jpg", "Sophie nocturnal portrait in Soho"],
      ["assets/images/soho-02.jpg", "Sophie editorial street portrait"],
      ["assets/images/soho-03.jpg", "Sophie cinematic night portrait"]
    ]
  },
  harvey: {
    title: "Harvey",
    kicker: "Menswear portrait",
    description: "A masculine portrait study with low-key light, sculptural shadow, and an intimate studio mood.",
    images: [
      ["assets/images/harvey-01.jpg", "Harvey male fashion portrait"],
      ["assets/images/harvey-02.jpg", "Harvey studio portrait"],
      ["assets/images/harvey-03.jpg", "Harvey menswear portrait study"]
    ]
  },
  studio: {
    title: "Studio",
    kicker: "Studio fashion",
    description: "Controlled studio portraits built around posture, styling, and a clean high-fashion atmosphere.",
    images: [
      ["assets/images/studio-01.jpg", "Studio fashion portrait"],
      ["assets/images/studio-02.jpg", "Studio editorial portrait"],
      ["assets/images/studio-03.jpg", "Studio beauty portrait"],
      ["assets/images/studio-04.jpg", "Studio fashion study"]
    ]
  },
  kintsugi: {
    title: "Kintsugi",
    kicker: "Fine art collection",
    description: "Self-produced fine-art studies in beauty, fracture, repair, and transformation.",
    images: [
      ["assets/images/fine-art-01.jpg", "Kintsugi fine art portrait"],
      ["assets/images/kintsugi-01.jpg", "Kintsugi fine art study one"],
      ["assets/images/kintsugi-02.jpg", "Kintsugi fine art study two"],
      ["assets/images/kintsugi-03.jpg", "Kintsugi fine art study three"],
      ["assets/images/kintsugi-04.jpg", "Kintsugi fine art study four"]
    ]
  },
  petals: {
    title: "Petals",
    kicker: "Fine art portrait",
    description: "A standalone fine-art portrait built around softness, body, silk, and scattered rose petals.",
    images: [
      ["assets/images/fine-art-02.jpg", "Fine art portrait with rose petals on white silk"]
    ]
  }
};

const imageDimensions = {
  "assets/images/roxana-01.jpg": [1920, 1280],
  "assets/images/roxana-02.jpg": [1920, 1103],
  "assets/images/roxana-03.jpg": [1920, 1440],
  "assets/images/cosmic-01.jpg": [1365, 2048],
  "assets/images/cosmic-02.jpg": [1920, 1355],
  "assets/images/cosmic-03.jpg": [1365, 2048],
  "assets/images/cosmic-04.jpg": [1365, 2048],
  "assets/images/cosmic-05.jpg": [1365, 2048],
  "assets/images/julia-01.jpg": [1536, 2048],
  "assets/images/julia-02.jpg": [1920, 1280],
  "assets/images/julia-03.jpg": [1920, 1267],
  "assets/images/soho-01.jpg": [1920, 1280],
  "assets/images/soho-02.jpg": [1920, 1389],
  "assets/images/soho-03.jpg": [1920, 1280],
  "assets/images/harvey-01.jpg": [1528, 2048],
  "assets/images/harvey-02.jpg": [1328, 2048],
  "assets/images/harvey-03.jpg": [1920, 1300],
  "assets/images/studio-01.jpg": [1241, 2048],
  "assets/images/studio-02.jpg": [1754, 2048],
  "assets/images/studio-03.jpg": [1920, 1280],
  "assets/images/studio-04.jpg": [1783, 2048],
  "assets/images/fine-art-01.jpg": [1352, 2048],
  "assets/images/kintsugi-01.jpg": [1365, 2048],
  "assets/images/kintsugi-02.jpg": [1365, 2048],
  "assets/images/kintsugi-03.jpg": [1365, 2048],
  "assets/images/kintsugi-04.jpg": [1352, 2048],
  "assets/images/fine-art-02.jpg": [1366, 2048]
};

const getGalleryFrameClass = (src) => {
  const dimensions = imageDimensions[src];

  if (!dimensions) {
    return "gallery-frame gallery-frame-portrait";
  }

  const [width, height] = dimensions;
  const ratio = width / height;

  if (ratio > 1.18) {
    return "gallery-frame gallery-frame-landscape";
  }

  if (ratio > 0.88) {
    return "gallery-frame gallery-frame-square";
  }

  return "gallery-frame gallery-frame-portrait";
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

  gallery.images.forEach(([src, alt], index) => {
    const frame = document.createElement("button");
    frame.className = getGalleryFrameClass(src);
    frame.type = "button";
    frame.setAttribute("aria-label", `Open ${alt}`);
    frame.addEventListener("click", () => openImageLightbox(src, alt));

    const dimensions = imageDimensions[src];

    if (dimensions) {
      frame.style.aspectRatio = `${dimensions[0]} / ${dimensions[1]}`;
    }

    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.loading = "eager";

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

document.querySelectorAll("[data-gallery]").forEach((item) => {
  item.addEventListener("click", () => openGallery(item.dataset.gallery));
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
window.addEventListener("scroll", setHeaderState, { passive: true });

const restoreHashScroll = () => {
  requestAnimationFrame(() => scrollToTarget(window.location.hash, false));
};

if (document.readyState === "complete") {
  restoreHashScroll();
} else {
  window.addEventListener("load", restoreHashScroll);
}
