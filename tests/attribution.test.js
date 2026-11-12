const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const controller = fs.readFileSync("privacy-consent.js", "utf8");
const attributionKey = "davide-studios-enquiry-attribution-v2";
const consentKey = "davide-studios-privacy-v1";

const runPage = ({ url, referrer = "", analytics = "granted", analyticsEnabled = true, session = new Map(), local = new Map() }) => {
  if (analytics !== "unset" && !local.has(consentKey)) {
    local.set(consentKey, JSON.stringify({ analytics, version: "2026-07-18" }));
  }
  const currentUrl = new URL(url);
  const choiceButtons = ["denied", "granted"].map((privacyChoice) => ({
    dataset: { privacyChoice },
    addEventListener(_event, handler) { this.click = handler; },
    setAttribute() {}
  }));
  const element = () => ({
    dataset: {},
    hidden: false,
    setAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  });
  const requestedTags = [];
  const document = {
    referrer,
    cookie: "",
    documentElement: { dataset: { analytics: analyticsEnabled ? "enabled" : "disabled" } },
    head: { append(node) { requestedTags.push(node); } },
    body: { append() {}, classList: { add() {}, remove() {} } },
    createElement: element,
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === "[data-privacy-choice]" ? choiceButtons : []; },
    dispatchEvent() {}
  };
  const context = {
    CustomEvent: class CustomEvent {},
    Date,
    URL,
    URLSearchParams,
    document,
    localStorage: {
      getItem(key) { return local.get(key) || null; },
      setItem(key, value) { local.set(key, value); },
      removeItem(key) { local.delete(key); }
    },
    sessionStorage: {
      getItem(key) { return session.get(key) || null; },
      setItem(key, value) { session.set(key, value); },
      removeItem(key) { session.delete(key); }
    },
    location: {
      hostname: currentUrl.hostname,
      pathname: currentUrl.pathname,
      search: currentUrl.search,
      reload() {}
    },
    window: null
  };
  context.window = context;
  vm.runInNewContext(controller, context, { filename: "privacy-consent.js" });
  return { context, choiceButtons, local, requestedTags, session };
};

test("a consenting search visitor keeps the service-page landing through the contact form", () => {
  const session = new Map();
  const local = new Map();
  const service = runPage({
    url: "https://www.davidesolla.com/services/fashion-photographer-london?utm_source=google&utm_medium=organic&utm_campaign=london-fashion&gclid=private-click-id",
    referrer: "https://www.google.com/search?q=fashion+photographer+london",
    session,
    local
  });
  const first = JSON.parse(session.get(attributionKey));
  assert.equal(first.landing_path, "/services/fashion-photographer-london");
  assert.equal(first.referrer_host, "google.com");
  assert.equal(first.utm_source, "google");
  assert.equal(first.utm_medium, "organic");
  assert.equal(first.utm_campaign, "london-fashion");
  assert.equal(first.consent_state, "granted");
  assert.deepEqual(Object.keys(first), [
    "landing_path", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "consent_state"
  ]);
  assert.equal(JSON.stringify(first).includes("private-click-id"), false);
  assert.equal(service.requestedTags.length, 1);

  const home = runPage({
    url: "https://www.davidesolla.com/#contact",
    referrer: "https://www.davidesolla.com/services/fashion-photographer-london",
    session,
    local
  });
  const enquiry = JSON.parse(JSON.stringify(home.context.StudioPrivacy.getEnquiryAttribution()));
  assert.deepEqual(enquiry, first);
  assert.equal(JSON.parse(session.get(attributionKey)).landing_path, "/services/fashion-photographer-london");
  assert.match(fs.readFileSync("script.js", "utf8"), /StudioPrivacy\?\.getEnquiryAttribution\?\.\(\)/);
});

test("unconsented visits never save attribution; granting consent starts capture on the current page", () => {
  const session = new Map([["davide-studios-enquiry-attribution-v1", JSON.stringify({ utm_source: "website" })]]);
  const page = runPage({
    url: "https://www.davidesolla.com/work/cosmic?utm_source=instagram&utm_medium=organic_social",
    referrer: "https://www.instagram.com/davide.studios/",
    analytics: "unset",
    session
  });
  assert.equal(session.has(attributionKey), false);
  assert.equal(session.has("davide-studios-enquiry-attribution-v1"), false);
  assert.equal(page.requestedTags.length, 0);

  page.choiceButtons.find((button) => button.dataset.privacyChoice === "granted").click();
  const attribution = JSON.parse(session.get(attributionKey));
  assert.equal(attribution.landing_path, "/work/cosmic");
  assert.equal(attribution.referrer_host, "instagram.com");
  assert.equal(attribution.utm_source, "instagram");
  assert.equal(attribution.consent_state, "granted");
  assert.equal(page.requestedTags.length, 1);
});

test("withdrawing consent removes session attribution, including the legacy key", () => {
  const session = new Map();
  const page = runPage({ url: "https://www.davidesolla.com/", session });
  assert.equal(session.has(attributionKey), true);
  session.set("davide-studios-enquiry-attribution-v1", "legacy");

  page.choiceButtons.find((button) => button.dataset.privacyChoice === "denied").click();
  assert.equal(session.has(attributionKey), false);
  assert.equal(session.has("davide-studios-enquiry-attribution-v1"), false);
  assert.equal(page.context.StudioPrivacy.getEnquiryAttribution().consent_state, "denied");
});

test("privacy can be a first landing without loading Google, while API copies cannot store attribution", () => {
  const privacy = runPage({
    url: "https://www.davidesolla.com/privacy",
    referrer: "https://www.google.com/search?q=studio+privacy",
    analyticsEnabled: false
  });
  assert.equal(JSON.parse(privacy.session.get(attributionKey)).landing_path, "/privacy");
  assert.equal(privacy.requestedTags.length, 0);

  const api = runPage({ url: "https://www.davidesolla.com/api/project?slug=cosmic" });
  assert.equal(api.session.has(attributionKey), false);
});

test("internal enquiry links do not add campaign parameters", () => {
  for (const file of ["privacy.html", "image-licensing.html", "lib/service-pages.js", "lib/project-pages.js"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /utm_source=website/);
  }
});
