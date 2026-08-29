(() => {
  "use strict";

  if (window.StudioPrivacy) return;

  const analyticsId = "G-1T625VVZL2";
  const storageKey = "davide-studios-privacy-v1";
  const noticeVersion = "2026-07-18";
  const analyticsEnabled = document.documentElement.dataset.analytics === "enabled";
  const validChoices = new Set(["granted", "denied"]);
  let analyticsStarted = false;
  let lastFocusedElement = null;

  const emptyDecision = () => ({ analytics: "unset", version: noticeVersion });

  const readDecision = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored?.version === noticeVersion && validChoices.has(stored.analytics)) {
        return stored;
      }
      if (stored) localStorage.removeItem(storageKey);
    } catch (error) {
      // Storage can be blocked. The banner remains available for this page view.
    }
    return emptyDecision();
  };

  let decision = readDecision();

  const analyticsState = () => decision.analytics;
  const hasAnalyticsConsent = () => analyticsState() === "granted";
  const disableAnalytics = () => {
    window[`ga-disable-${analyticsId}`] = true;
  };

  const clearAnalyticsCookies = () => {
    const names = document.cookie
      .split(";")
      .map((part) => part.split("=", 1)[0].trim())
      .filter((name) => name === "_ga" || name === "_gid" || name === "_gat" || name.startsWith("_ga_"));
    const hostname = window.location.hostname;
    const rootHostname = hostname.replace(/^www\./, "");
    const domains = [...new Set(["", hostname, `.${hostname}`, rootHostname, `.${rootHostname}`])];

    names.forEach((name) => {
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
      });
    });
  };

  const initialiseGoogleTag = () => {
    if (!analyticsEnabled || !hasAnalyticsConsent() || analyticsStarted) return;

    analyticsStarted = true;
    window[`ga-disable-${analyticsId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      personalization_storage: "denied",
      functionality_storage: "granted",
      security_storage: "granted"
    });
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
      personalization_storage: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", analyticsId, {
      allow_ad_personalization_signals: false,
      allow_google_signals: false
    });

    const tag = document.createElement("script");
    tag.async = true;
    tag.dataset.googleAnalytics = analyticsId;
    tag.referrerPolicy = "strict-origin-when-cross-origin";
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analyticsId)}`;
    document.head.append(tag);
  };

  const persistDecision = (analytics) => {
    const next = {
      analytics,
      version: noticeVersion,
      decidedAt: new Date().toISOString()
    };
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (error) {}
    decision = next;
  };

  const stateLabel = () => ({
    granted: "Analytics allowed",
    denied: "Essential storage only",
    unset: "No choice saved"
  }[analyticsState()]);

  const updateVisibleState = () => {
    document.querySelectorAll("[data-privacy-current]").forEach((element) => {
      element.textContent = `Current choice: ${stateLabel()}.`;
    });
    document.querySelectorAll("[data-privacy-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.privacyChoice === analyticsState()));
    });
  };

  const applyDecision = (analytics) => {
    if (!validChoices.has(analytics)) return;
    const previous = analyticsState();
    persistDecision(analytics);

    if (analytics === "granted") {
      initialiseGoogleTag();
    } else {
      disableAnalytics();
      clearAnalyticsCookies();
    }

    updateVisibleState();
    document.dispatchEvent(new CustomEvent("studio:privacy-change", {
      detail: { analytics }
    }));

    if (previous === "granted" && analytics === "denied" && analyticsStarted && analyticsEnabled) {
      window.location.reload();
    }
  };

  const closeSettings = () => {
    const modal = document.querySelector("[data-privacy-modal]");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("privacy-panel-open");
    lastFocusedElement?.focus?.();
  };

  const openSettings = (trigger) => {
    const modal = document.querySelector("[data-privacy-modal]");
    if (!modal) return;
    lastFocusedElement = trigger || document.activeElement;
    modal.hidden = false;
    document.body.classList.add("privacy-panel-open");
    updateVisibleState();
    modal.querySelector("[data-privacy-close]")?.focus();
  };

  const renderControls = () => {
    const banner = document.createElement("aside");
    banner.className = "privacy-banner";
    banner.dataset.privacyBanner = "";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "false");
    banner.setAttribute("aria-labelledby", "privacy-banner-title");
    banner.hidden = analyticsState() !== "unset";
    banner.innerHTML = `
      <div class="privacy-banner-copy">
        <p class="section-kicker">Your privacy</p>
        <h2 id="privacy-banner-title">Optional analytics, your choice.</h2>
        <p>Essential storage keeps forms and private access working. With your permission, limited Google Analytics helps the studio understand which work leads to useful visits and enquiries. No advertising or remarketing.</p>
        <a class="privacy-detail-link" href="/privacy">Read the privacy notice</a>
      </div>
      <div class="privacy-actions" aria-label="Analytics choice">
        <button class="privacy-choice-button" type="button" data-privacy-choice="denied">Use essential only</button>
        <button class="privacy-choice-button" type="button" data-privacy-choice="granted">Allow analytics</button>
      </div>`;

    const modal = document.createElement("div");
    modal.className = "privacy-modal";
    modal.dataset.privacyModal = "";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="privacy-panel" role="dialog" aria-modal="true" aria-labelledby="privacy-settings-title">
        <button class="privacy-close" type="button" aria-label="Close privacy settings" data-privacy-close></button>
        <p class="section-kicker">Privacy settings</p>
        <h2 id="privacy-settings-title">Choose how this site measures visits.</h2>
        <p>Essential storage supports security, form retries, consent memory and private client access. It cannot be switched off here.</p>
        <div class="privacy-setting-row">
          <div>
            <strong>Website analytics</strong>
            <p>Allows GA4 page views and the studio's enquiry, contact-intent and Instagram-click events. Advertising storage, signals and personalisation remain disabled.</p>
          </div>
          <p class="privacy-current" data-privacy-current></p>
        </div>
        <div class="privacy-actions" aria-label="Save analytics choice">
          <button class="privacy-choice-button" type="button" data-privacy-choice="denied">Use essential only</button>
          <button class="privacy-choice-button" type="button" data-privacy-choice="granted">Allow analytics</button>
        </div>
        <a class="privacy-detail-link" href="/privacy">Read the full privacy notice</a>
      </section>`;

    document.body.append(banner, modal);

    document.querySelectorAll("[data-privacy-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const settingsWereOpen = !modal.hidden;
        applyDecision(button.dataset.privacyChoice);
        banner.hidden = true;
        if (settingsWereOpen) {
          closeSettings();
        } else {
          document.querySelector("[data-privacy-settings]")?.focus();
        }
      });
    });
    document.querySelectorAll("[data-privacy-settings]").forEach((button) => {
      button.addEventListener("click", () => openSettings(button));
    });
    modal.querySelector("[data-privacy-close]")?.addEventListener("click", closeSettings);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeSettings();
    });
    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSettings();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...modal.querySelectorAll("a[href], button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    updateVisibleState();
  };

  window.StudioPrivacy = Object.freeze({
    getAnalyticsState: analyticsState,
    hasAnalyticsConsent,
    openSettings: () => openSettings(document.activeElement)
  });

  if (hasAnalyticsConsent()) {
    initialiseGoogleTag();
  } else {
    disableAnalytics();
    clearAnalyticsCookies();
  }
  renderControls();
})();
