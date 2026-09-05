const { setSecurityHeaders } = require("./security");

const siteUrl = "https://www.davidesolla.com";
const siteName = "Davide Solla Studios";
const instagramUrl = "https://www.instagram.com/davide.studios/";

const rawServicePageDefinitions = [
  {
    slug: "fashion-photographer-london",
    shortName: "Fashion photography",
    title: "Fashion Photographer London | Davide Solla Studios",
    description: "Commission cinematic fashion photography in London for editorials, independent labels, designers and creative teams, shaped in studio or on location.",
    h1: "Fashion photographer London",
    kicker: "Fashion photography service",
    serviceType: "Fashion photography",
    lead: "Concept-led fashion editorials for designers, stylists, magazines and independent labels, built around a clear visual idea and shaped through cinematic light, colour and direction.",
    sectionTitle: "Fashion imagery built around the idea, audience and intended use.",
    paragraphs: [
      "Each enquiry begins with the brief: what the images need to communicate, where they will be used, and which visual references matter. From there, the conversation can cover studio or location, casting, styling direction and the scale of the production.",
      "The photographic approach balances editorial polish with atmosphere and presence. The aim is a coherent story that gives garments, people and setting a shared visual language rather than treating them as separate elements."
    ],
    details: [
      ["Focus", "Fashion editorials, campaigns and creative portfolio stories"],
      ["Location", "London studio or location"],
      ["Approach", "Concept-led direction, controlled light and cinematic colour"]
    ],
    projects: [
      { slug: "cosmic", title: "Cosmic Girl", context: "Studio fashion editorial" },
      { slug: "dark-baroque", title: "Dark Baroque", context: "Theatrical fashion story" }
    ],
    relatedServices: ["beauty-photographer-london", "model-portfolio-photographer-london"],
    ctaTitle: "Planning a fashion editorial or campaign in London?",
    ctaCopy: "Share the intended use, timing, location and visual direction. Davide will respond personally and shape the next conversation around the brief.",
    hero: {
      src: "assets/images/cosmic-02.jpg",
      alt: "Cinematic fashion portrait with blue and red studio lighting",
      width: 2048,
      height: 1445,
      projectSlug: "cosmic"
    }
  },
  {
    slug: "model-portfolio-photographer-london",
    shortName: "Model portfolios",
    title: "Model Portfolio Photographer London | Davide Solla",
    description: "Book a London model portfolio shoot focused on range, expression, posture and editorial versatility, with considered direction in studio or on location.",
    h1: "Model portfolio photographer London",
    kicker: "Model portfolio photography",
    serviceType: "Model portfolio photography",
    lead: "Portfolio tests shaped around range, expression, posture and editorial versatility, with clear photographic direction and room for the model's own presence to come through.",
    sectionTitle: "A focused portfolio session designed to show range without losing coherence.",
    paragraphs: [
      "The starting point is the work the portfolio needs to do. A new model may need a concise set that establishes presence and adaptability; an established model may need to refresh the book with a more specific editorial mood.",
      "Wardrobe, references, setting and changes of energy are planned around that goal. Direction stays attentive to posture, gesture and expression so the final sequence feels varied, intentional and recognisably yours."
    ],
    details: [
      ["Focus", "Range, expression, posture and editorial versatility"],
      ["Location", "London studio or location"],
      ["Best suited to", "New portfolio tests and considered book updates"]
    ],
    projects: [
      { slug: "julia", title: "Julia", context: "Quiet fashion portrait series" },
      { slug: "inna", title: "Inna", context: "Studio portrait study" }
    ],
    relatedServices: ["fashion-photographer-london", "beauty-photographer-london"],
    ctaTitle: "Ready to plan a model portfolio test in London?",
    ctaCopy: "Share where you are in your portfolio, the range you want to build and any agency or casting context that should guide the session.",
    hero: {
      src: "assets/images/julia-01.jpg",
      alt: "Editorial model portrait with restrained winter styling",
      width: 1536,
      height: 2048,
      projectSlug: "julia"
    }
  },
  {
    slug: "beauty-photographer-london",
    shortName: "Beauty photography",
    title: "Beauty Photographer London | Davide Solla Studios",
    description: "Commission polished beauty photography in London for editorial stories, creative profiles, press imagery and personal branding, shaped with controlled light.",
    h1: "Beauty photographer London",
    kicker: "Beauty photography service",
    serviceType: "Beauty photography",
    lead: "Close, polished beauty and portrait photography for editorial stories, creative profiles, press imagery and campaign-led personal branding, shaped with controlled studio light.",
    sectionTitle: "Beauty portraits where light, styling and expression work as one image.",
    paragraphs: [
      "The visual direction begins with the intended mood and use of the photographs. Lighting, colour, crop and background are considered together so skin, styling and expression remain precise without becoming impersonal.",
      "Sessions can move between clean portraiture and a more cinematic beauty language. Any wider creative team requirements can be discussed around the brief before the shoot is planned."
    ],
    details: [
      ["Focus", "Beauty editorials, press portraits and creative profiles"],
      ["Location", "London studio or suitable interior location"],
      ["Approach", "Controlled light, refined colour and close visual direction"]
    ],
    projects: [
      { slug: "roxana", title: "Roxana", context: "London beauty editorial" },
      { slug: "cosmic", title: "Cosmic Girl", context: "Colour-led beauty and fashion story" }
    ],
    relatedServices: ["artist-portrait-photographer-london", "fashion-photographer-london"],
    ctaTitle: "Developing a beauty story or portrait brief?",
    ctaCopy: "Send the intended use, visual references, timing and any existing creative-team details to begin a focused conversation about the shoot.",
    hero: {
      src: "assets/images/roxana-01.jpg",
      alt: "London editorial beauty portrait in warm directional light",
      width: 1920,
      height: 1280,
      projectSlug: "roxana"
    }
  },
  {
    slug: "artist-portrait-photographer-london",
    shortName: "Artist portraits",
    title: "Artist Portrait Photographer London | Davide Solla",
    description: "Book an artist portrait shoot in London for musicians, performers and creatives who need atmospheric editorial, press or profile imagery.",
    h1: "Artist portrait photographer London",
    kicker: "Portrait photography for artists",
    serviceType: "Artist portrait photography",
    lead: "Atmospheric portraits for musicians, performers and creative practitioners who need images with enough clarity for press and profiles, and enough character to feel like their work.",
    sectionTitle: "Portraits that hold both public identity and individual presence.",
    paragraphs: [
      "An artist portrait often has several jobs: introducing the person, supporting a release or profile, and carrying a recognisable visual mood across different contexts. The shoot is planned around those uses without reducing the subject to a single pose or persona.",
      "Location, wardrobe, objects and light are chosen for their connection to the artist and the brief. Direction can move from composed portraiture to quieter, more observational frames within the same visual story."
    ],
    details: [
      ["Focus", "Musician, performer and creative-practitioner portraits"],
      ["Use", "Editorial, press, profile and release imagery"],
      ["Location", "London studio or location"]
    ],
    projects: [
      { slug: "kihaya-blues", title: "Kihaya Blues", context: "Musician portrait series" },
      { slug: "harvey", title: "Harvey", context: "Low-key studio portrait study" }
    ],
    relatedServices: ["beauty-photographer-london", "fine-art-portrait-commissions"],
    ctaTitle: "Need portraits for an upcoming release, profile or creative project?",
    ctaCopy: "Share the context, where the images will appear, your timing and the visual territory you want the portraits to occupy.",
    hero: {
      src: "assets/images/harvey-01.jpg",
      alt: "Artist portrait with low-key London studio lighting",
      width: 1528,
      height: 2048,
      projectSlug: "harvey"
    }
  },
  {
    slug: "fine-art-portrait-commissions",
    shortName: "Fine-art commissions",
    title: "Fine-Art Portrait Commissions London | Davide Solla",
    description: "Enquire about selected fine-art portrait commissions in London: atmospheric, print-led studies shaped through light, symbolism and a collaborative brief.",
    h1: "Fine-art portrait commissions",
    kicker: "Selected portrait commissions",
    serviceType: "Fine-art portrait commissions",
    lead: "Selected fine-art portrait commissions shaped through controlled light, symbolic styling and a collaborative visual brief, with the finished image considered as both portrait and print.",
    sectionTitle: "A slower portrait process built around atmosphere, symbolism and form.",
    paragraphs: [
      "These commissions begin with the reason for making the portrait and the emotional or visual territory it should explore. References may come from painting, cinema, material, gesture or a personal symbol rather than from a standard portrait format.",
      "The process is selective because each study needs a clear shared intention. Scale, setting, styling direction and the possibility of a finished print are discussed as part of the brief."
    ],
    details: [
      ["Focus", "Atmospheric, symbolic and print-led portrait studies"],
      ["Location", "London studio or considered location"],
      ["Format", "Selected personal commissions and creative collaborations"]
    ],
    projects: [
      { slug: "kintsugi", title: "Kintsugi", context: "Portrait studies in repair and transformation" },
      { slug: "petals", title: "Petals", context: "Fine-art portrait in silk and rose petals" }
    ],
    relatedServices: ["artist-portrait-photographer-london", "beauty-photographer-london"],
    ctaTitle: "Have an idea for a fine-art portrait?",
    ctaCopy: "Describe the person, the reason for the portrait and the atmosphere or symbolic starting point you want to explore together.",
    hero: {
      src: "assets/images/fine-art-01.jpg",
      alt: "Fine-art portrait with sculptural styling and transformation theme",
      width: 1352,
      height: 2048,
      projectSlug: "kintsugi"
    }
  }
];

const servicePageDefinitions = Object.freeze(rawServicePageDefinitions.map((definition) => Object.freeze({
  ...definition,
  canonical: `${siteUrl}/services/${definition.slug}`,
  path: `/services/${definition.slug}`
})));

const servicePagesBySlug = new Map(servicePageDefinitions.map((definition) => [definition.slug, definition]));

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");

const servicePageSlug = (value = "") => {
  const candidate = typeof value === "object" ? value?.slug : value;
  const slug = String(candidate || "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
};

const getServicePage = (slug) => servicePagesBySlug.get(servicePageSlug(slug)) || null;

const listServicePages = () => servicePageDefinitions;

const imageBaseName = (src) => {
  const fileName = String(src).slice(String(src).lastIndexOf("/") + 1);
  return fileName.slice(0, fileName.lastIndexOf("."));
};

const responsiveImageUrl = (image, width, extension) => `/assets/images/responsive/${imageBaseName(image.src)}-${width}.${extension}`;

const absoluteUrl = (value = "") => new URL(String(value).replace(/^\/+/, ""), `${siteUrl}/`).href;

const structuredDataForService = (page) => {
  const imageUrl = absoluteUrl(page.hero.src);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: siteName,
        inLanguage: "en-GB",
        publisher: { "@id": `${siteUrl}/#organization` }
      },
      {
        "@type": "WebPage",
        "@id": `${page.canonical}#webpage`,
        url: page.canonical,
        name: page.title,
        description: page.description,
        inLanguage: "en-GB",
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: { "@id": `${page.canonical}#service` },
        breadcrumb: { "@id": `${page.canonical}#breadcrumb` },
        primaryImageOfPage: { "@id": `${page.canonical}#primary-image` },
        publisher: { "@id": `${siteUrl}/#organization` },
        creator: { "@id": `${siteUrl}/#person` }
      },
      {
        "@type": "Service",
        "@id": `${page.canonical}#service`,
        url: page.canonical,
        name: page.h1,
        serviceType: page.serviceType,
        description: page.description,
        provider: { "@id": `${siteUrl}/#organization` },
        image: { "@id": `${page.canonical}#primary-image` },
        mainEntityOfPage: { "@id": `${page.canonical}#webpage` },
        areaServed: [
          { "@type": "City", name: "London" },
          { "@type": "Country", name: "United Kingdom" }
        ]
      },
      {
        "@type": "ImageObject",
        "@id": `${page.canonical}#primary-image`,
        url: imageUrl,
        contentUrl: imageUrl,
        width: page.hero.width,
        height: page.hero.height,
        caption: page.hero.alt,
        creator: { "@id": `${siteUrl}/#person` },
        creditText: "Davide Solla",
        copyrightNotice: "© Davide Solla",
        license: `${siteUrl}/image-licensing`,
        acquireLicensePage: `${siteUrl}/#contact`
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${page.canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Photography services", item: `${siteUrl}/#services` },
          { "@type": "ListItem", position: 3, name: page.shortName, item: page.canonical }
        ]
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: siteName,
        url: `${siteUrl}/`,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/assets/images/favicon.png`,
          width: 180,
          height: 180
        },
        founder: { "@id": `${siteUrl}/#person` },
        sameAs: [instagramUrl],
        areaServed: { "@type": "City", name: "London" }
      },
      {
        "@type": "Person",
        "@id": `${siteUrl}/#person`,
        name: "Davide Solla",
        jobTitle: "Fashion and Editorial Photographer",
        description: "Naples-born, London-based photographer specialising in cinematic fashion editorials, beauty portraits, model portfolios and fine-art portrait studies.",
        url: `${siteUrl}/`,
        image: `${siteUrl}/assets/images/about-portrait.jpg`,
        sameAs: [instagramUrl],
        homeLocation: { "@type": "City", name: "London" },
        knowsAbout: [
          "fashion photography",
          "editorial photography",
          "beauty photography",
          "model portfolio photography",
          "artist portrait photography",
          "fine-art portraiture"
        ]
      }
    ]
  };
};

const renderHeroPicture = (page) => {
  const image = page.hero;
  const originalUrl = `/${image.src.replace(/^\/+/, "")}`;
  return `<a href="/work/${escapeHtml(image.projectSlug)}" aria-label="View the related ${escapeHtml(page.shortName)} project">
            <picture>
              <source type="image/avif" srcset="${responsiveImageUrl(image, 720, "avif")} 720w, ${responsiveImageUrl(image, 1200, "avif")} 1200w" sizes="(max-width: 760px) 100vw, 76vw">
              <source type="image/webp" srcset="${responsiveImageUrl(image, 720, "webp")} 720w, ${responsiveImageUrl(image, 1200, "webp")} 1200w" sizes="(max-width: 760px) 100vw, 76vw">
              <img src="${escapeHtml(originalUrl)}" srcset="${responsiveImageUrl(image, 720, "jpg")} 720w, ${responsiveImageUrl(image, 1200, "jpg")} 1200w" sizes="(max-width: 760px) 100vw, 76vw" alt="${escapeHtml(image.alt)}" width="${image.width}" height="${image.height}" loading="eager" decoding="async" fetchpriority="high">
            </picture>
          </a>`;
};

const renderDetails = (details) => details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");

const renderProjects = (projects) => projects.map((project) => `<div><dt>${escapeHtml(project.context)}</dt><dd><a class="text-link text-link-light" href="/work/${escapeHtml(project.slug)}">${escapeHtml(project.title)}</a></dd></div>`).join("");

const renderRelatedServices = (page) => page.relatedServices.map((slug) => {
  const related = getServicePage(slug);
  if (!related) return "";
  return `<a href="${escapeHtml(related.path)}"><span>Related service</span><strong>${escapeHtml(related.shortName)}</strong></a>`;
}).join("");

const renderServicePage = (requestedSlug) => {
  const page = getServicePage(requestedSlug);
  if (!page) return null;

  const imageUrl = absoluteUrl(page.hero.src);
  const preload = `<link rel="preload" as="image" href="${responsiveImageUrl(page.hero, 1200, "avif")}" imagesrcset="${responsiveImageUrl(page.hero, 720, "avif")} 720w, ${responsiveImageUrl(page.hero, 1200, "avif")} 1200w" imagesizes="(max-width: 760px) 100vw, 76vw" type="image/avif" fetchpriority="high">`;
  const structuredData = structuredDataForService(page);
  const enquiryUrl = `/?utm_source=website&amp;utm_medium=service_page&amp;utm_campaign=photography_services&amp;utm_content=${escapeHtml(page.slug)}#contact`;

  return `<!doctype html>
<html lang="en-GB" data-analytics="enabled">
  <head>
    <script src="/privacy-consent.js?v=2026-07-18" defer></script>
    <script src="/google-tag.js?v=3" defer></script>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta name="author" content="Davide Solla">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${page.canonical}">
    ${preload}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${siteName}">
    <meta property="og:url" content="${page.canonical}">
    <meta property="og:title" content="${escapeHtml(page.title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:alt" content="${escapeHtml(page.hero.alt)}">
    <meta property="og:image:width" content="${page.hero.width}">
    <meta property="og:image:height" content="${page.hero.height}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:locale" content="en_GB">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(page.title)}">
    <meta name="twitter:description" content="${escapeHtml(page.description)}">
    <meta name="twitter:image" content="${imageUrl}">
    <meta name="twitter:image:alt" content="${escapeHtml(page.hero.alt)}">
    <link rel="icon" type="image/png" href="/assets/images/favicon.png">
    <link rel="apple-touch-icon" href="/assets/images/favicon.png">
    <meta name="theme-color" content="#080807">
    <link rel="stylesheet" href="/styles.css?v=20260905-bd63024902">
    <link rel="stylesheet" href="/project-page.css?v=20260905-c4de5b0d68">
    <script type="application/ld+json">${safeJson(structuredData)}</script>
  </head>
  <body class="project-page service-page">
    <header class="project-site-header">
      <a class="project-wordmark" href="/" aria-label="Davide Solla Studios home"><strong>Davide Solla</strong><span>Studios</span></a>
      <nav aria-label="Service navigation"><a href="/#services">Services</a><a href="/#work">Selected work</a><a href="${enquiryUrl}">Enquire</a></nav>
    </header>
    <main>
      <article>
        <header class="project-intro">
          <nav class="project-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/#services">Photography services</a><span aria-hidden="true">/</span><span>${escapeHtml(page.shortName)}</span></nav>
          <p class="section-kicker">${escapeHtml(page.kicker)}</p>
          <h1>${escapeHtml(page.h1)}</h1>
          <div class="project-intro-grid">
            <p class="project-description">${escapeHtml(page.lead)}</p>
            <dl class="project-meta">${renderDetails(page.details)}</dl>
          </div>
        </header>

        <section class="project-gallery" aria-label="Example of ${escapeHtml(page.shortName.toLowerCase())}">
          <figure class="project-frame project-frame-featured">${renderHeroPicture(page)}</figure>
        </section>

        <section class="project-credits" aria-labelledby="service-approach-title">
          <div><p class="section-kicker">The approach</p><h2 id="service-approach-title">${escapeHtml(page.sectionTitle)}</h2></div>
          <div>${page.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
        </section>

        <section class="project-credits" aria-labelledby="service-work-title">
          <div><p class="section-kicker">Relevant work</p><h2 id="service-work-title">Selected stories connected to this service.</h2></div>
          <dl>${renderProjects(page.projects)}</dl>
        </section>

        <aside class="project-cta" aria-labelledby="service-cta-title">
          <p class="section-kicker">Start a conversation</p>
          <h2 id="service-cta-title">${escapeHtml(page.ctaTitle)}</h2>
          <p>${escapeHtml(page.ctaCopy)}</p>
          <a class="hero-primary" href="${enquiryUrl}">Discuss the brief</a>
        </aside>

        <nav class="project-sequence" aria-label="Related photography services">${renderRelatedServices(page)}</nav>
      </article>
    </main>
    <footer class="project-footer">
      <p>© ${new Date().getUTCFullYear()} Davide Solla Studios · London</p>
      <nav aria-label="Footer"><a href="/privacy">Privacy</a><button type="button" data-privacy-settings>Privacy settings</button><a href="${instagramUrl}" target="_blank" rel="noopener noreferrer">Instagram</a></nav>
    </footer>
  </body>
</html>`;
};

const notFoundPage = () => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Service not found | ${siteName}</title><link rel="stylesheet" href="/styles.css?v=20260905-bd63024902"><link rel="stylesheet" href="/project-page.css?v=20260905-c4de5b0d68"></head><body class="project-page project-not-found"><main><p class="section-kicker">Photography services</p><h1>That service page is not available.</h1><p>The address may be incorrect or the service may have moved.</p><a class="hero-primary" href="/#services">View photography services</a></main></body></html>`;

const endResponse = (req, res, body = "") => res.end(req.method === "HEAD" ? undefined : body);

const handleServicePageRequest = (req, res) => {
  setSecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  const requestUrl = new URL(req.url, siteUrl);

  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("allow", "GET, HEAD");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    res.statusCode = 405;
    endResponse(req, res, "Method not allowed");
    return;
  }

  const trailingMatch = requestUrl.pathname.match(/^\/services\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/);
  if (trailingMatch && getServicePage(trailingMatch[1])) {
    res.statusCode = 308;
    res.setHeader("location", `/services/${trailingMatch[1]}`);
    res.setHeader("cache-control", "no-store");
    endResponse(req, res);
    return;
  }

  const cleanRouteMatch = requestUrl.pathname.match(/^\/services\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  const routeSlug = cleanRouteMatch?.[1] || requestUrl.searchParams.get("slug") || "";
  const page = renderServicePage(routeSlug);
  const rewrittenPublicRoute = requestUrl.pathname === "/api/service"
    && requestUrl.searchParams.get("public") === "1";
  const publicRoute = Boolean(cleanRouteMatch) || rewrittenPublicRoute;

  if (!page) {
    res.statusCode = 404;
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    endResponse(req, res, notFoundPage());
    return;
  }

  res.statusCode = 200;
  if (publicRoute) {
    res.setHeader("cache-control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  } else {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex, nofollow");
  }
  endResponse(req, res, page);
};

module.exports = {
  getServicePage,
  handleServicePageRequest,
  listServicePages,
  renderServicePage,
  servicePageDefinitions,
  servicePageSlug,
  structuredDataForService
};
