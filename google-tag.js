const studioAnalyticsAllowed = () => window.StudioPrivacy?.hasAnalyticsConsent?.() === true;

window.trackStudioEvent = (eventName, params = {}) => {
  if (!studioAnalyticsAllowed() || typeof window.gtag !== "function" || !eventName) return;
  window.gtag("event", eventName, params);
};

document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href]");

  if (!link) return;

  const href = link.getAttribute("href") || "";

  if (href.includes("instagram.com/davide.studios")) {
    window.trackStudioEvent("instagram_click", {
      link_url: link.href,
      link_text: link.textContent.trim() || link.getAttribute("aria-label") || "Instagram"
    });
  }

  if (href === "#contact" || href.endsWith("#contact")) {
    window.trackStudioEvent("enquiry_intent", {
      link_text: link.textContent.trim() || "Contact"
    });
  }
}, { passive: true });
