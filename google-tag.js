window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

gtag("js", new Date());
gtag("config", "G-1T625VVZL2");

window.trackStudioEvent = (eventName, params = {}) => {
  if (typeof gtag !== "function" || !eventName) return;
  gtag("event", eventName, params);
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
