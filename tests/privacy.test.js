const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const analyticsId = "G-1T625VVZL2";
const consentSource = fs.readFileSync("privacy-consent.js", "utf8");

const element = (tagName) => ({
  tagName: tagName.toUpperCase(),
  dataset: {},
  hidden: false,
  innerHTML: "",
  className: "",
  setAttribute() {},
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  focus() {},
  remove() {}
});

const runConsent = ({ analytics = "unset", analyticsEnabled = true, cookie = "" } = {}) => {
  const appendedToHead = [];
  const stored = analytics === "unset"
    ? null
    : JSON.stringify({ analytics, version: "2026-07-14", decidedAt: "2026-07-14T00:00:00.000Z" });
  const storage = new Map(stored ? [["davide-studios-privacy-v1", stored]] : []);
  const document = {
    activeElement: null,
    cookie,
    documentElement: { dataset: { analytics: analyticsEnabled ? "enabled" : "disabled" } },
    head: { append(node) { appendedToHead.push(node); } },
    body: {
      append() {},
      classList: { add() {}, remove() {} }
    },
    createElement: element,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    dispatchEvent() {}
  };
  const context = {
    console,
    CustomEvent: class CustomEvent {},
    document,
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    location: { hostname: "www.davidesolla.com", reload() {} },
    window: null
  };
  context.window = context;
  vm.runInNewContext(consentSource, context, { filename: "privacy-consent.js" });
  return { context, appendedToHead, storage };
};

test("the Google tag is not requested before an affirmative analytics choice", () => {
  for (const analytics of ["unset", "denied"]) {
    const { context, appendedToHead } = runConsent({ analytics });
    assert.equal(appendedToHead.length, 0);
    assert.equal(context.gtag, undefined);
    assert.equal(context[`ga-disable-${analyticsId}`], true);
  }
});

test("a stored grant loads one tag with analytics-only consent", () => {
  const { context, appendedToHead } = runConsent({ analytics: "granted" });
  assert.equal(appendedToHead.length, 1);
  assert.equal(appendedToHead[0].src, `https://www.googletagmanager.com/gtag/js?id=${analyticsId}`);
  assert.equal(context[`ga-disable-${analyticsId}`], false);
  const commands = context.dataLayer.map((args) => [...args]);
  const defaults = commands.find(([command, mode]) => command === "consent" && mode === "default")[2];
  const update = commands.find(([command, mode]) => command === "consent" && mode === "update")[2];
  const config = commands.find(([command]) => command === "config")[2];
  assert.equal(defaults.analytics_storage, "denied");
  assert.equal(defaults.ad_storage, "denied");
  assert.equal(update.analytics_storage, "granted");
  assert.equal(update.ad_storage, "denied");
  assert.equal(update.ad_user_data, "denied");
  assert.equal(update.ad_personalization, "denied");
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
});

test("privacy and private pages never load analytics even with a stored grant", () => {
  const { context, appendedToHead } = runConsent({ analytics: "granted", analyticsEnabled: false });
  assert.equal(appendedToHead.length, 0);
  assert.equal(context.gtag, undefined);

  for (const file of ["client-area.html", "preferences.html", "privacy.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(html, /googletagmanager|google-tag\.js/);
  }
});

test("public analytics pages use the consent controller and contain no eager Google loader", () => {
  for (const file of ["index.html", "field-notes.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /data-analytics="enabled"/);
    assert.match(html, /privacy-consent\.js\?v=1/);
    assert.match(html, /google-tag\.js\?v=3/);
    assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www\.googletagmanager\.com/);
    assert.doesNotMatch(html, /gtag\('config'/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /data-privacy-settings/);
  }
});

test("tracking helpers fail closed without granted consent", () => {
  const source = fs.readFileSync("google-tag.js", "utf8");
  assert.match(source, /hasAnalyticsConsent/);
  assert.match(source, /!studioAnalyticsAllowed\(\)/);
});

test("the privacy route and notice version are wired through the local server", () => {
  const server = fs.readFileSync("server.js", "utf8");
  const contact = fs.readFileSync("lib/contact.js", "utf8");
  assert.match(server, /"privacy-consent\.js", "privacy\.html"/);
  assert.match(server, /requestUrl\.pathname === "\/privacy"/);
  assert.match(contact, /privacyNoticeVersion = "2026-07-14"/);
});

test("the production privacy rewrite keeps the standard security headers", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const privacyRoute = config.routes.find((route) => route.src === "/privacy");
  const catchAll = config.routes.find((route) => route.src === "/(.*)");
  assert.equal(privacyRoute.dest, "/privacy.html");
  for (const name of [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Content-Security-Policy"
  ]) {
    assert.equal(privacyRoute.headers[name], catchAll.headers[name]);
  }
});
