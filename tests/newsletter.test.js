const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const {
  createConfirmationToken,
  createPreferencesToken,
  handleNewsletterRequest
} = require("../lib/newsletter");
const {
  ensureNewsletterSenderConfigured,
  handleAdminRequest,
  newsletterBroadcastPayload,
  newsletterRevision,
  sendNewsletterBroadcastOnce,
  sendNewsletterIssue,
  writeGithubFiles,
  writeSiteData
} = require("../lib/admin-store");
const {
  loadIssue,
  loadManifest,
  validateIssue
} = require("../newsletter/lib/render-email");
const {
  imageSource,
  renderedImageSlots
} = require("../newsletter-rights");

const response = () => {
  const headers = {};
  return {
    statusCode: 0,
    body: "",
    headers,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    end(value) { this.body = String(value || ""); }
  };
};

const request = ({ method = "POST", url = "/api/newsletter", body, contentType = "application/json", address, authorization } = {}) => {
  const payload = contentType.includes("x-www-form-urlencoded")
    ? new URLSearchParams(body || {}).toString()
    : JSON.stringify(body || {});
  const req = Readable.from(method === "GET" ? [] : [payload]);
  req.method = method;
  req.url = url;
  const clientAddress = address || `newsletter-test-${Math.random()}`;
  req.headers = {
    host: "www.davidesolla.com",
    "x-forwarded-proto": "https",
    "x-real-ip": clientAddress,
    "x-forwarded-for": clientAddress,
    "content-type": contentType
  };
  if (authorization) req.headers.authorization = authorization;
  return req;
};

const json = (res) => JSON.parse(res.body);

const baseEnv = {
  RESEND_API_KEY: "re_test_newsletter",
  NEWSLETTER_TOKEN_SECRET: "newsletter-test-secret-that-is-long-enough",
  NEWSLETTER_FROM_EMAIL: "Davide Studios <field-notes@example.test>",
  NEWSLETTER_RESEND_SEGMENT_ID: "segment_test",
  NEWSLETTER_RESEND_TOPIC_ID: "topic_field_notes",
  PUBLIC_SITE_URL: "https://www.davidesolla.com"
};

const metricsEnv = {
  RADAR_NEWSLETTER_METRICS_ENDPOINT: "https://radar.example.test/api/integrations/newsletter/events",
  NEWSLETTER_METRICS_WEBHOOK_SECRET: "newsletter-metrics-integration-secret-32-bytes"
};

const withNewsletterEnv = async (operation) => {
  const previous = Object.fromEntries(Object.keys(baseEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, baseEnv);
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withNewsletterMetricsEnv = async (operation, overrides = {}) => {
  const values = { ...metricsEnv, ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await operation();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withLocalSendState = async (operation) => {
  const relativeDir = `tests/.newsletter-send-state-${process.pid}-${crypto.randomUUID()}`;
  const fullDir = path.join(__dirname, "..", relativeDir);
  const previousDir = process.env.NEWSLETTER_SEND_STATE_DIR;
  const previousGithubToken = process.env.GITHUB_TOKEN;
  process.env.NEWSLETTER_SEND_STATE_DIR = relativeDir;
  delete process.env.GITHUB_TOKEN;

  try {
    return await operation({ relativeDir, fullDir });
  } finally {
    await fs.rm(fullDir, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.NEWSLETTER_SEND_STATE_DIR;
    else process.env.NEWSLETTER_SEND_STATE_DIR = previousDir;
    if (previousGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousGithubToken;
  }
};

const providerResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body)
});

const withAdminNewsletterFiles = async (operation) => {
  const root = path.resolve(__dirname, "..");
  const issue = structuredClone(loadIssue("2026-07"));
  const manifest = structuredClone(loadManifest("2026-07"));
  const files = new Map([
    ["newsletter/data/issues/2026-07.json", `${JSON.stringify(issue, null, 2)}\n`],
    ["newsletter/data/issues/index.json", `${JSON.stringify({ issues: [{
      issueId: issue.issueId,
      month: issue.month,
      year: issue.year,
      title: issue.title,
      status: "research-approved",
      publicationStatus: "published",
      publishedAt: "2026-06-28T10:40:35.000Z",
      updatedAt: "2026-07-01T12:00:00.000Z"
    }] }, null, 2)}\n`],
    ["newsletter/data/sources/2026-07.manifest.json", `${JSON.stringify(manifest, null, 2)}\n`]
  ]);
  const keyFor = (filePath) => path.relative(root, String(filePath)).split(path.sep).join("/");
  const originals = {
    readFile: fs.readFile,
    readdir: fs.readdir,
    mkdir: fs.mkdir,
    writeFile: fs.writeFile
  };
  const envKeys = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "GITHUB_TOKEN", "VERCEL_DEPLOY_HOOK_URL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let writes = 0;

  process.env.ADMIN_PASSWORD = "admin-revision-test-password";
  process.env.ADMIN_SESSION_SECRET = "admin-revision-test-session-secret";
  delete process.env.GITHUB_TOKEN;
  delete process.env.VERCEL_DEPLOY_HOOK_URL;

  fs.readFile = async (filePath, ...args) => {
    const key = keyFor(filePath);
    if (files.has(key)) return files.get(key);
    return originals.readFile(filePath, ...args);
  };
  fs.readdir = async (directory, ...args) => {
    if (keyFor(directory) === "newsletter/data/issues") {
      return Array.from(files.keys())
        .filter((key) => /^newsletter\/data\/issues\/\d{4}-\d{2}\.json$/.test(key))
        .map((key) => path.basename(key));
    }
    return originals.readdir(directory, ...args);
  };
  fs.mkdir = async (directory, ...args) => {
    if (keyFor(directory).startsWith("newsletter/data/")) return undefined;
    return originals.mkdir(directory, ...args);
  };
  fs.writeFile = async (filePath, content, ...args) => {
    const key = keyFor(filePath);
    if (key.startsWith("newsletter/data/") || key === "sitemap.xml") {
      writes += 1;
      files.set(key, String(content));
      return undefined;
    }
    return originals.writeFile(filePath, content, ...args);
  };

  try {
    return await operation({ files, writeCount: () => writes });
  } finally {
    Object.assign(fs, originals);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("newsletter revisions are deterministic across object key order", () => {
  const left = newsletterRevision({ issueId: "2026-07", nested: { b: 2, a: 1 } }, { z: true, a: false });
  const right = newsletterRevision({ nested: { a: 1, b: 2 }, issueId: "2026-07" }, { a: false, z: true });
  assert.equal(left, right);
  assert.match(left, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(left, newsletterRevision({ issueId: "2026-07", nested: { a: 1, b: 3 } }, { a: false, z: true }));
});

test("newsletter admin revisions reject stale saves before another write", async () => {
  await withAdminNewsletterFiles(async ({ files, writeCount }) => {
    const address = `admin-revision-${crypto.randomUUID()}`;
    const loginResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=login",
      body: { password: process.env.ADMIN_PASSWORD },
      address
    }), loginResponse);
    assert.equal(loginResponse.statusCode, 200);
    const authorization = `Bearer ${json(loginResponse).token}`;

    const getResponse = response();
    await handleAdminRequest(request({
      method: "GET",
      url: "/api/admin?action=newsletterIssue&issueId=2026-07",
      authorization,
      address
    }), getResponse);
    assert.equal(getResponse.statusCode, 200);
    const loaded = json(getResponse);
    assert.equal(loaded.revision, newsletterRevision(loaded.issue, loaded.manifest));

    const editedIssue = structuredClone(loaded.issue);
    editedIssue.openingNote = `${editedIssue.openingNote} Revision guard test.`;
    const saveResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=newsletterIssue&issueId=2026-07",
      authorization,
      address,
      body: {
        issue: editedIssue,
        manifest: loaded.manifest,
        revision: loaded.revision
      }
    }), saveResponse);
    assert.equal(saveResponse.statusCode, 200);
    const saved = json(saveResponse);
    assert.notEqual(saved.revision, loaded.revision);
    assert.equal(saved.revision, newsletterRevision(saved.issue, saved.manifest));
    assert.equal(writeCount(), 4);
    const savedIndex = JSON.parse(files.get("newsletter/data/issues/index.json"));
    assert.equal(savedIndex.issues[0].status, "research-approved");
    assert.equal(savedIndex.issues[0].publicationStatus, "published");
    assert.equal(savedIndex.issues[0].publishedAt, "2026-06-28T10:40:35.000Z");
    assert.match(savedIndex.issues[0].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.notEqual(savedIndex.issues[0].updatedAt, "2026-07-01T12:00:00.000Z");
    assert.match(files.get("sitemap.xml"), /\/field-notes\/2026-07<\/loc>/);

    const staleResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=newsletterIssue&issueId=2026-07",
      authorization,
      address,
      body: {
        issue: loaded.issue,
        manifest: loaded.manifest,
        revision: loaded.revision
      }
    }), staleResponse);
    assert.equal(staleResponse.statusCode, 409);
    assert.equal(json(staleResponse).code, "NEWSLETTER_REVISION_CONFLICT");
    assert.equal(json(staleResponse).currentRevision, saved.revision);
    assert.equal(writeCount(), 4);
  });
});

test("a public Field Notes save is rejected before writes when publication invariants fail", async () => {
  await withAdminNewsletterFiles(async ({ writeCount }) => {
    const address = `admin-publication-${crypto.randomUUID()}`;
    const loginResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=login",
      body: { password: process.env.ADMIN_PASSWORD },
      address
    }), loginResponse);
    assert.equal(loginResponse.statusCode, 200);
    const authorization = `Bearer ${json(loginResponse).token}`;

    const getResponse = response();
    await handleAdminRequest(request({
      method: "GET",
      url: "/api/admin?action=newsletterIssue&issueId=2026-07",
      authorization,
      address
    }), getResponse);
    assert.equal(getResponse.statusCode, 200);
    const loaded = json(getResponse);
    const invalidIssue = structuredClone(loaded.issue);
    invalidIssue.publication = { status: "published" };
    invalidIssue.sections.fashion.stories = [];

    const saveResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=newsletterIssue&issueId=2026-07",
      authorization,
      address,
      body: {
        issue: invalidIssue,
        manifest: loaded.manifest,
        revision: loaded.revision
      }
    }), saveResponse);

    assert.equal(saveResponse.statusCode, 422);
    assert.match(json(saveResponse).error, /public publication validation/i);
    assert.ok(json(saveResponse).validation.errors.some((error) => /fashion\.stories/.test(error)));
    assert.equal(writeCount(), 0);
  });
});

test("concurrent GitHub newsletter commits pinned to one head cannot overwrite the shared index", async () => {
  const envKeys = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  let headSha = "head_initial";
  let sequence = 0;
  let patchCalls = 0;
  const commitParents = new Map();
  const refWaiters = [];

  Object.assign(process.env, {
    GITHUB_TOKEN: "github_revision_test_token",
    GITHUB_OWNER: "example",
    GITHUB_REPO: "newsletter-test",
    GITHUB_BRANCH: "main"
  });

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";

    if (method === "GET" && target.endsWith("/git/ref/heads/main")) {
      const observedHead = headSha;
      return new Promise((resolve) => {
        refWaiters.push(() => resolve(providerResponse(200, { object: { sha: observedHead } })));
        if (refWaiters.length === 2) {
          refWaiters.splice(0).forEach((release) => release());
        }
      });
    }

    if (method === "GET" && target.includes("/git/commits/")) {
      return providerResponse(200, { tree: { sha: "tree_initial" } });
    }

    if (method === "POST" && target.endsWith("/git/blobs")) {
      sequence += 1;
      return providerResponse(201, { sha: `blob_${sequence}` });
    }

    if (method === "POST" && target.endsWith("/git/trees")) {
      sequence += 1;
      return providerResponse(201, { sha: `tree_${sequence}` });
    }

    if (method === "POST" && target.endsWith("/git/commits")) {
      const body = JSON.parse(options.body);
      sequence += 1;
      const sha = `commit_${sequence}`;
      commitParents.set(sha, body.parents[0]);
      return providerResponse(201, { sha });
    }

    if (method === "PATCH" && target.endsWith("/git/refs/heads/main")) {
      patchCalls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.force, false);
      if (commitParents.get(body.sha) !== headSha) {
        return providerResponse(422, { message: "Update is not a fast forward" });
      }
      headSha = body.sha;
      return providerResponse(200, { object: { sha: headSha } });
    }

    throw new Error(`Unexpected GitHub request: ${method} ${target}`);
  };

  const sharedIndexPath = "newsletter/data/issues/index.json";
  const firstFiles = [
    { path: "newsletter/data/issues/2026-07.json", content: Buffer.from("first issue") },
    { path: sharedIndexPath, content: Buffer.from("first index") }
  ];
  const secondFiles = [
    { path: "newsletter/data/issues/2026-08.json", content: Buffer.from("second issue") },
    { path: sharedIndexPath, content: Buffer.from("second index") }
  ];

  try {
    const results = await Promise.allSettled([
      writeGithubFiles(firstFiles, "first concurrent save", { expectedHeadSha: "head_initial" }),
      writeGithubFiles(secondFiles, "second concurrent save", { expectedHeadSha: "head_initial" })
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.statusCode, 409);
    assert.equal(rejected[0].reason.code, "NEWSLETTER_REPOSITORY_CONFLICT");
    assert.equal(patchCalls, 2);
    assert.notEqual(headSha, "head_initial");
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("portfolio content and the current Field Notes sitemap share one revision-pinned GitHub commit", async () => {
  const envKeys = [
    "ADMIN_DATA_ENCRYPTION_KEY",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH"
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const newsletterIndex = await fs.readFile(path.join(__dirname, "..", "newsletter/data/issues/index.json"), "utf8");
  const siteData = JSON.parse(await fs.readFile(path.join(__dirname, "..", "data/site.json"), "utf8"));
  let blobCount = 0;
  let commitCount = 0;
  let patchCount = 0;
  let treePaths = [];

  Object.assign(process.env, {
    ADMIN_DATA_ENCRYPTION_KEY: "site-write-test-encryption-key",
    GITHUB_TOKEN: "github_site_write_test_token",
    GITHUB_OWNER: "example",
    GITHUB_REPO: "site-write-test",
    GITHUB_BRANCH: "main"
  });

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";

    if (method === "GET" && target.endsWith("/git/ref/heads/main")) {
      return providerResponse(200, { object: { sha: "head_site" } });
    }
    if (method === "GET" && target.includes("/contents/newsletter/data/issues/index.json")) {
      assert.match(target, /ref=head_site/);
      return providerResponse(200, {
        content: Buffer.from(newsletterIndex).toString("base64"),
        sha: "index_blob"
      });
    }
    if (method === "GET" && target.endsWith("/git/commits/head_site")) {
      return providerResponse(200, { tree: { sha: "tree_site" } });
    }
    if (method === "POST" && target.endsWith("/git/blobs")) {
      blobCount += 1;
      return providerResponse(201, { sha: `site_blob_${blobCount}` });
    }
    if (method === "POST" && target.endsWith("/git/trees")) {
      treePaths = JSON.parse(options.body).tree.map((entry) => entry.path).sort();
      return providerResponse(201, { sha: "tree_site_next" });
    }
    if (method === "POST" && target.endsWith("/git/commits")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.parents, ["head_site"]);
      commitCount += 1;
      return providerResponse(201, { sha: "commit_site" });
    }
    if (method === "PATCH" && target.endsWith("/git/refs/heads/main")) {
      assert.equal(JSON.parse(options.body).sha, "commit_site");
      patchCount += 1;
      return providerResponse(200, { object: { sha: "commit_site" } });
    }

    throw new Error(`Unexpected GitHub request: ${method} ${target}`);
  };

  try {
    await writeSiteData(siteData);
    assert.equal(blobCount, 3);
    assert.equal(commitCount, 1);
    assert.equal(patchCount, 1);
    assert.deepEqual(treePaths, ["data/admin-site.enc", "data/site.json", "sitemap.xml"]);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("confirmation GET renders an explicit action without mutating the subscriber", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      return providerResponse(500, { message: "must not be called" });
    };
    const token = createConfirmationToken({
      email: "reader@example.test",
      firstName: "Reader",
      source: "test",
      consentAt: new Date().toISOString()
    }, { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const tokenParts = token.split(".");
    assert.equal(tokenParts.length, 4);
    assert.equal(tokenParts[0], "v1");
    const visibleTokenBytes = tokenParts.slice(1)
      .map((part) => Buffer.from(part, "base64url").toString("utf8"))
      .join("");
    assert.equal(visibleTokenBytes.includes("reader@example.test"), false);
    assert.equal(visibleTokenBytes.includes('"email"'), false);
    const res = response();
    try {
      await handleNewsletterRequest(request({
        method: "GET",
        url: `/api/newsletter?action=confirm&token=${encodeURIComponent(token)}`
      }), res);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(providerCalls, 0);
    assert.match(res.body, /Confirm subscription/);
    assert.match(res.body, /Opening this page alone does not subscribe you/);
    assert.equal(res.headers["referrer-policy"], "no-referrer");
  });
});

test("tampering with an encrypted confirmation token fails before provider access", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      return providerResponse(500, { message: "must not be called" });
    };
    const token = createConfirmationToken({
      email: "reader@example.test",
      consentAt: new Date().toISOString()
    }, { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    const res = response();

    try {
      await handleNewsletterRequest(request({
        method: "GET",
        url: `/api/newsletter?action=confirm&token=${encodeURIComponent(parts.join("."))}`
      }), res);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(res.statusCode, 400);
    assert.equal(providerCalls, 0);
  });
});

test("double-opt-in email carries only the supported Resend message-type tag", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    let confirmationEmail;
    global.fetch = async (url, options = {}) => {
      assert.equal(String(url), "https://api.resend.com/emails");
      confirmationEmail = JSON.parse(options.body);
      return providerResponse(200, { id: "confirmation_email" });
    };
    const res = response();

    try {
      await handleNewsletterRequest(request({
        body: {
          email: "reader@example.test",
          firstName: "Reader",
          consent: true,
          source: "test",
          website: ""
        }
      }), res);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(json(res).requiresConfirmation, true);
    assert.deepEqual(confirmationEmail.tags, [
      { name: "message_type", value: "field_notes_confirmation" }
    ]);
  });
});

test("confirmation POST creates a Resend contact using the raw REST field names", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return providerResponse(200, { id: "contact_confirmed" });
    };
    const token = createConfirmationToken({
      email: "reader@example.test",
      firstName: "Reader",
      source: "test",
      consentAt: new Date().toISOString()
    }, { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const res = response();
    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=confirm",
        body: { token },
        contentType: "application/x-www-form-urlencoded"
      }), res);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/contacts");
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.first_name, "Reader");
    assert.equal(Object.hasOwn(payload, "firstName"), false);
    assert.deepEqual(payload.topics, [{ id: "topic_field_notes", subscription: "opt_in" }]);
  });
});

test("a rejected Radar fact cannot undo a confirmed double opt-in", async () => {
  await withNewsletterEnv(() => withNewsletterMetricsEnv(async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logs = [];
    let metricsRequest;
    console.error = (...args) => logs.push(args);
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target === "https://api.resend.com/contacts") {
        return providerResponse(200, { id: "contact_provider_private" });
      }
      if (target === metricsEnv.RADAR_NEWSLETTER_METRICS_ENDPOINT) {
        metricsRequest = { headers: options.headers, body: options.body };
        return providerResponse(503, { error: "private Radar failure detail" });
      }
      throw new Error(`Unexpected request: ${target}`);
    };
    const token = createConfirmationToken({
      email: "confirmed-reader@example.test",
      firstName: "Reader",
      source: "test",
      consentAt: "2026-07-15T08:00:00.000Z"
    }, { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const res = response();

    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=confirm",
        body: { token },
        contentType: "application/x-www-form-urlencoded"
      }), res);
    } finally {
      global.fetch = originalFetch;
      console.error = originalConsoleError;
    }

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /You're subscribed/);
    const fact = JSON.parse(metricsRequest.body);
    assert.equal(fact.type, "subscription.confirmed");
    assert.equal(metricsRequest.headers["idempotency-key"], fact.event_id);
    assert.deepEqual(Object.keys(fact), [
      "schema_version",
      "event_type",
      "event_id",
      "type",
      "occurred_at"
    ]);
    assert.equal(metricsRequest.body.includes("confirmed-reader@example.test"), false);
    assert.equal(metricsRequest.body.includes("contact_provider_private"), false);
    assert.equal(metricsRequest.body.includes(token), false);
    assert.deepEqual(logs, [[
      "Newsletter lifecycle metric failed",
      { type: "subscription.confirmed", code: "request_rejected" }
    ]]);
  }));
});

test("single opt-in emits the same anonymous confirmation boundary when explicitly enabled", async () => {
  await withNewsletterEnv(() => withNewsletterMetricsEnv(async () => {
    const previousDoubleOptIn = process.env.NEWSLETTER_DOUBLE_OPT_IN;
    const originalFetch = global.fetch;
    const requests = [];
    process.env.NEWSLETTER_DOUBLE_OPT_IN = "false";
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      requests.push({ target, options });
      if (target === "https://api.resend.com/contacts") {
        return providerResponse(200, { id: "single_opt_in_provider_id" });
      }
      if (target === metricsEnv.RADAR_NEWSLETTER_METRICS_ENDPOINT) {
        return providerResponse(201, { ok: true });
      }
      throw new Error(`Unexpected request: ${target}`);
    };
    const res = response();

    try {
      await handleNewsletterRequest(request({
        body: {
          email: "single-opt-in@example.test",
          firstName: "Reader",
          consent: true,
          source: "test",
          website: ""
        }
      }), res);
    } finally {
      global.fetch = originalFetch;
      if (previousDoubleOptIn === undefined) delete process.env.NEWSLETTER_DOUBLE_OPT_IN;
      else process.env.NEWSLETTER_DOUBLE_OPT_IN = previousDoubleOptIn;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(json(res).requiresConfirmation, false);
    const contactPayload = JSON.parse(requests.find((item) => item.target.endsWith("/contacts")).options.body);
    assert.deepEqual(contactPayload.topics, [{ id: "topic_field_notes", subscription: "opt_in" }]);
    const metricsBody = requests.find((item) => item.target === metricsEnv.RADAR_NEWSLETTER_METRICS_ENDPOINT).options.body;
    assert.equal(JSON.parse(metricsBody).type, "subscription.confirmed");
    assert.equal(metricsBody.includes("single-opt-in@example.test"), false);
    assert.equal(metricsBody.includes("single_opt_in_provider_id"), false);
  }));
});

test("newsletter tokens require a dedicated secret and cannot authenticate as admin sessions", async () => {
  await withNewsletterEnv(async () => {
    const previousAdminPassword = process.env.ADMIN_PASSWORD;
    const previousAdminSecret = process.env.ADMIN_SESSION_SECRET;
    const sharedSecret = "synthetic-shared-secret-that-is-long-enough";
    process.env.ADMIN_PASSWORD = "synthetic-admin-password";
    process.env.ADMIN_SESSION_SECRET = sharedSecret;
    delete process.env.NEWSLETTER_TOKEN_SECRET;

    try {
      const signupResponse = response();
      await handleNewsletterRequest(request({
        body: {
          email: "attacker@example.test",
          consent: true,
          website: ""
        }
      }), signupResponse);
      assert.equal(signupResponse.statusCode, 503);
      assert.match(json(signupResponse).error, /confirmation is not configured/i);

      const newsletterToken = createConfirmationToken({
        email: "attacker@example.test",
        consentAt: new Date().toISOString()
      }, { tokenSecret: sharedSecret });
      const adminRequest = Readable.from([]);
      adminRequest.method = "GET";
      adminRequest.url = "/api/admin?action=newsletterIssues";
      adminRequest.headers = {
        authorization: `Bearer ${newsletterToken}`,
        host: "www.davidesolla.com"
      };
      const adminResponse = response();
      await handleAdminRequest(adminRequest, adminResponse);
      assert.equal(adminResponse.statusCode, 401);
    } finally {
      if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previousAdminPassword;
      if (previousAdminSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
      else process.env.ADMIN_SESSION_SECRET = previousAdminSecret;
    }
  });
});

test("newsletter enrollment fails closed without its Segment and public Topic", async () => {
  await withNewsletterEnv(async () => {
    const previousTopic = process.env.NEWSLETTER_RESEND_TOPIC_ID;
    const originalFetch = global.fetch;
    let providerCalls = 0;
    delete process.env.NEWSLETTER_RESEND_TOPIC_ID;
    global.fetch = async () => {
      providerCalls += 1;
      return providerResponse(500, {});
    };
    const res = response();

    try {
      await handleNewsletterRequest(request({
        body: {
          email: "reader@example.test",
          firstName: "Reader",
          consent: true,
          source: "test",
          website: ""
        }
      }), res);
    } finally {
      global.fetch = originalFetch;
      process.env.NEWSLETTER_RESEND_TOPIC_ID = previousTopic;
    }

    assert.equal(res.statusCode, 503);
    assert.match(json(res).error, /audience configuration is not ready/i);
    assert.equal(providerCalls, 0);
  });
});

test("replaying a confirmation cannot resubscribe a globally unsubscribed contact", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    const consentAt = "2026-07-14T08:00:00.000Z";
    let mutationCalls = 0;
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.endsWith("/contacts") && options.method === "POST") {
        return providerResponse(409, { message: "contact already exists" });
      }
      if (target.endsWith("/contacts/reader%40example.test") && options.method === "GET") {
        return providerResponse(200, {
          id: "contact_reader",
          email: "reader@example.test",
          unsubscribed: true,
          properties: { consent_at: consentAt }
        });
      }
      mutationCalls += 1;
      return providerResponse(200, { id: "unexpected-mutation" });
    };
    const token = createConfirmationToken({
      email: "reader@example.test",
      source: "test",
      consentAt
    }, { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const res = response();

    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=confirm",
        body: { token },
        contentType: "application/x-www-form-urlencoded"
      }), res);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(res.statusCode, 409);
    assert.match(res.body, /already been used/i);
    assert.equal(mutationCalls, 0);
  });
});

test("replaying a confirmation cannot restore a Topic after a Topic-only opt-out", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    const consentAt = "2026-07-14T08:00:00.000Z";
    let mutationCalls = 0;
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.endsWith("/contacts") && options.method === "POST") {
        return providerResponse(409, { message: "contact already exists" });
      }
      if (target.endsWith("/contacts/reader%40example.test") && options.method === "GET") {
        return providerResponse(200, {
          id: "contact_reader",
          email: "reader@example.test",
          unsubscribed: false,
          properties: { consent_at: consentAt }
        });
      }
      mutationCalls += 1;
      return providerResponse(200, { id: "unexpected-mutation" });
    };
    const token = createConfirmationToken({
      email: "reader@example.test",
      source: "test",
      consentAt
    }, { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const res = response();

    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=confirm",
        body: { token },
        contentType: "application/x-www-form-urlencoded"
      }), res);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(res.statusCode, 409);
    assert.equal(mutationCalls, 0);
  });
});

test("known and unknown preference-link requests have indistinguishable public responses", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    let sentEmail;
    global.fetch = async (url, options) => {
      const target = String(url);
      if (target.endsWith("/contacts/known%40example.test")) {
        return providerResponse(200, { id: "contact_known", email: "known@example.test", unsubscribed: false });
      }
      if (target.endsWith("/contacts/unknown%40example.test")) {
        return providerResponse(404, { message: "not found" });
      }
      if (target.endsWith("/emails")) {
        sentEmail = { options, payload: JSON.parse(options.body) };
        return providerResponse(200, { id: "email_preferences" });
      }
      throw new Error(`Unexpected provider call: ${target}`);
    };

    const knownResponse = response();
    const unknownResponse = response();
    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=request_preferences",
        body: { email: "known@example.test", website: "" }
      }), knownResponse);
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=request_preferences",
        body: { email: "unknown@example.test", website: "" }
      }), unknownResponse);
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(knownResponse.statusCode, 200);
    assert.equal(unknownResponse.statusCode, 200);
    assert.deepEqual(json(knownResponse), json(unknownResponse));
    assert.equal(sentEmail.payload.to[0], "known@example.test");
    assert.deepEqual(sentEmail.payload.tags, [
      { name: "message_type", value: "field_notes_preferences" }
    ]);
    assert.match(sentEmail.options.headers["idempotency-key"], /^newsletter-preferences\/[a-f0-9]{64}$/);
    const match = sentEmail.payload.text.match(/#token=([^\s]+)/);
    assert.ok(match);
    const token = decodeURIComponent(match[1]);
    const claims = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    assert.equal(claims.contactId, "contact_known");
    assert.equal(JSON.stringify(claims).includes("known@example.test"), false);
    assert.equal(claims.purpose, "manage-preferences");
  });
});

test("preference delivery failures and missing contacts keep the same public response without PII logs", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);
    global.fetch = async (url) => {
      const target = String(url);
      if (target.endsWith("/contacts/known%40example.test")) {
        return providerResponse(200, { id: "contact_known", email: "known@example.test", unsubscribed: false });
      }
      if (target.endsWith("/contacts/unknown%40example.test")) {
        return providerResponse(404, { message: "not found" });
      }
      if (target.endsWith("/emails")) {
        return providerResponse(422, { message: "Delivery failed for known@example.test" });
      }
      throw new Error(`Unexpected provider call: ${target}`);
    };

    const knownResponse = response();
    const unknownResponse = response();
    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=request_preferences",
        body: { email: "known@example.test", website: "" },
        address: "preferences-delivery-failure"
      }), knownResponse);
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=request_preferences",
        body: { email: "unknown@example.test", website: "" },
        address: "preferences-missing-contact"
      }), unknownResponse);
    } finally {
      global.fetch = originalFetch;
      console.error = originalConsoleError;
    }

    assert.equal(knownResponse.statusCode, 200);
    assert.equal(unknownResponse.statusCode, 200);
    assert.deepEqual(json(knownResponse), json(unknownResponse));
    assert.equal(JSON.stringify(logs).includes("known@example.test"), false);
  });
});

test("repeated preference requests reuse an identical token body and idempotency key within a bucket", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    const originalNow = Date.now;
    const emailCalls = [];
    Date.now = () => 1_752_480_123_456;
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.endsWith("/contacts/known%40example.test")) {
        return providerResponse(200, {
          id: "contact_known",
          email: "known@example.test",
          unsubscribed: false
        });
      }
      if (target.endsWith("/emails")) {
        emailCalls.push({
          key: options.headers["idempotency-key"],
          body: options.body
        });
        if (emailCalls.length > 1
          && (emailCalls[0].key !== emailCalls[1].key || emailCalls[0].body !== emailCalls[1].body)) {
          return providerResponse(409, { message: "invalid_idempotent_request" });
        }
        return providerResponse(200, { id: "email_preferences" });
      }
      throw new Error(`Unexpected provider call: ${target}`);
    };

    const firstResponse = response();
    const secondResponse = response();
    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=request_preferences",
        body: { email: "known@example.test", website: "" },
        address: "preferences-repeat-1"
      }), firstResponse);
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=request_preferences",
        body: { email: "known@example.test", website: "" },
        address: "preferences-repeat-2"
      }), secondResponse);
    } finally {
      Date.now = originalNow;
      global.fetch = originalFetch;
    }

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(emailCalls.length, 2);
    assert.equal(emailCalls[0].key, emailCalls[1].key);
    assert.equal(emailCalls[0].body, emailCalls[1].body);
  });
});

test("secure preferences can read, opt out of Field Notes, and globally unsubscribe without resubscribing", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      calls.push({ target, options });
      if (options.method === "GET" && target.endsWith("/contacts/contact_secure")) {
        return providerResponse(200, { id: "contact_secure", email: "secure@example.test", unsubscribed: false });
      }
      if (options.method === "GET" && target.endsWith("/contacts/contact_secure/topics")) {
        return providerResponse(200, { data: [{ id: "topic_field_notes", subscription: "opt_in" }] });
      }
      if (options.method === "PATCH") return providerResponse(200, { id: "updated" });
      throw new Error(`Unexpected provider call: ${target}`);
    };
    const token = createPreferencesToken("contact_secure", { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });

    try {
      const readResponse = response();
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=read_preferences",
        body: { token }
      }), readResponse);
      assert.deepEqual(json(readResponse).preferences, {
        globallySubscribed: true,
        fieldNotes: true,
        topicConfigured: true
      });

      const topicResponse = response();
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=update_preferences",
        body: { token, fieldNotes: false }
      }), topicResponse);
      const topicPatch = calls.find((call) => call.options.method === "PATCH" && call.target.endsWith("/topics"));
      assert.deepEqual(JSON.parse(topicPatch.options.body), {
        topics: [{ id: "topic_field_notes", subscription: "opt_out" }]
      });

      const globalResponse = response();
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=update_preferences",
        body: { token, unsubscribeAll: true }
      }), globalResponse);
      const contactPatch = calls.find((call) => call.options.method === "PATCH" && call.target.endsWith("/contacts/contact_secure"));
      assert.deepEqual(JSON.parse(contactPatch.options.body), { unsubscribed: true });
      assert.equal(json(globalResponse).preferences.globallySubscribed, false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("preference lifecycle facts cover only real opt-out transitions", async () => {
  await withNewsletterEnv(() => withNewsletterMetricsEnv(async () => {
    const originalFetch = global.fetch;
    let globallyUnsubscribed = false;
    let topicSubscription = "opt_in";
    let mutationCalls = 0;
    const facts = [];
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target === metricsEnv.RADAR_NEWSLETTER_METRICS_ENDPOINT) {
        facts.push(JSON.parse(options.body));
        return providerResponse(201, { ok: true });
      }
      if (options.method === "GET" && target.endsWith("/contacts/contact_transition")) {
        return providerResponse(200, {
          id: "contact_transition",
          email: "transition@example.test",
          unsubscribed: globallyUnsubscribed
        });
      }
      if (options.method === "GET" && target.endsWith("/contacts/contact_transition/topics")) {
        return providerResponse(200, {
          data: [{ id: "topic_field_notes", subscription: topicSubscription }]
        });
      }
      if (options.method === "PATCH" && target.endsWith("/contacts/contact_transition/topics")) {
        mutationCalls += 1;
        topicSubscription = JSON.parse(options.body).topics[0].subscription;
        return providerResponse(200, { id: "updated_topic" });
      }
      if (options.method === "PATCH" && target.endsWith("/contacts/contact_transition")) {
        mutationCalls += 1;
        globallyUnsubscribed = JSON.parse(options.body).unsubscribed === true;
        return providerResponse(200, { id: "updated_contact" });
      }
      throw new Error(`Unexpected provider call: ${options.method} ${target}`);
    };
    const token = createPreferencesToken("contact_transition", {
      tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET
    });

    const invoke = async (actionBody, action = "update_preferences") => {
      const res = response();
      await handleNewsletterRequest(request({
        url: `/api/newsletter?action=${action}`,
        body: { token, ...actionBody }
      }), res);
      assert.equal(res.statusCode, 200);
      return res;
    };

    try {
      await invoke({}, "read_preferences");
      await invoke({ fieldNotes: true });
      await invoke({ fieldNotes: false });
      await invoke({ fieldNotes: false });
      await invoke({ fieldNotes: true });
      await invoke({ unsubscribeAll: true });
      await invoke({ unsubscribeAll: true });
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(mutationCalls, 3);
    assert.deepEqual(facts.map((fact) => fact.type), [
      "subscription.topic_opted_out",
      "subscription.global_unsubscribed"
    ]);
    for (const fact of facts) {
      const body = JSON.stringify(fact);
      assert.deepEqual(Object.keys(fact), [
        "schema_version",
        "event_type",
        "event_id",
        "type",
        "occurred_at"
      ]);
      assert.equal(body.includes("contact_transition"), false);
      assert.equal(body.includes("transition@example.test"), false);
      assert.equal(body.includes(token), false);
    }
  }));
});

test("a missing configured Topic is unavailable and can never be inferred as opted in", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    let mutationCalls = 0;
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (options.method === "GET" && target.endsWith("/contacts/contact_without_topic")) {
        return providerResponse(200, {
          id: "contact_without_topic",
          email: "reader@example.test",
          unsubscribed: false
        });
      }
      if (options.method === "GET" && target.endsWith("/contacts/contact_without_topic/topics")) {
        return providerResponse(200, { data: [] });
      }
      mutationCalls += 1;
      return providerResponse(200, { id: "unexpected-mutation" });
    };
    const token = createPreferencesToken("contact_without_topic", {
      tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET
    });

    try {
      const readResponse = response();
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=read_preferences",
        body: { token }
      }), readResponse);
      assert.deepEqual(json(readResponse).preferences, {
        globallySubscribed: true,
        fieldNotes: null,
        topicConfigured: false
      });

      const updateResponse = response();
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=update_preferences",
        body: { token, fieldNotes: true }
      }), updateResponse);
      assert.equal(updateResponse.statusCode, 409);
      assert.equal(mutationCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("tampered preference tokens fail before any provider request", async () => {
  await withNewsletterEnv(async () => {
    const originalFetch = global.fetch;
    let called = false;
    global.fetch = async () => { called = true; return providerResponse(500, {}); };
    const token = createPreferencesToken("contact_secure", { tokenSecret: baseEnv.NEWSLETTER_TOKEN_SECRET });
    const res = response();
    try {
      await handleNewsletterRequest(request({
        url: "/api/newsletter?action=read_preferences",
        body: { token: `${token}tampered` }
      }), res);
    } finally {
      global.fetch = originalFetch;
    }
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });
});

test("current issues pass live validation without an image-rights gate", () => {
  for (const issueId of ["2026-06", "2026-07"]) {
    const issue = loadIssue(issueId);
    const manifest = loadManifest(issueId);
    assert.equal(validateIssue(issue, manifest, { mode: "preview" }).errors.length, 0);
    assert.equal(validateIssue(issue, manifest, { mode: "dry-run" }).errors.length, 0);
    assert.deepEqual(validateIssue(issue, manifest, { mode: "live-send" }).errors, []);
  }
});

test("every configured image resolves with its source credit", () => {
  const issue = loadIssue("2026-07");
  const slots = renderedImageSlots(issue);
  assert.equal(slots.length, 5);
  for (const slot of slots) {
    const source = imageSource(slot);
    assert.match(source.assetUrl, /^https?:\/\//);
    assert.ok(source.credit);
    assert.match(source.sourceUrl, /^https?:\/\//);
  }
});

test("legacy image-rights records do not affect newsletter validation", () => {
  const issue = loadIssue("2026-07");
  const manifest = structuredClone(loadManifest("2026-07"));
  manifest.schemaVersion = 99;
  manifest.imageRights = [{ decision: "rejected", expiresOn: "2020-01-01" }];
  assert.deepEqual(validateIssue(issue, manifest, { mode: "preview" }).errors, []);
  assert.deepEqual(validateIssue(issue, manifest, { mode: "dry-run" }).errors, []);
  assert.deepEqual(validateIssue(issue, manifest, { mode: "live-send" }).errors, []);
});

test("live-send keeps research, canonical URL, source-manifest, and content validation", () => {
  const issue = loadIssue("2026-07");
  const manifest = loadManifest("2026-07");

  const draftIssue = structuredClone(issue);
  draftIssue.status = "draft";
  draftIssue.research.validationStatus = "draft";
  assert.match(
    validateIssue(draftIssue, manifest, { mode: "live-send" }).errors.join("\n"),
    /issue status must be research-approved/
  );
  assert.match(
    validateIssue(draftIssue, manifest, { mode: "live-send" }).errors.join("\n"),
    /research\.validationStatus must be research-approved/
  );

  const redirectedIssue = structuredClone(issue);
  redirectedIssue.site.baseUrl = "https://attacker.example";
  assert.match(
    validateIssue(redirectedIssue, manifest, { mode: "live-send" }).errors.join("\n"),
    /site\.baseUrl must be https:\/\/www\.davidesolla\.com/
  );

  const draftManifest = structuredClone(manifest);
  draftManifest.status = "draft";
  assert.match(
    validateIssue(issue, draftManifest, { mode: "live-send" }).errors.join("\n"),
    /source manifest status must be research-approved/
  );

  const missingTitle = structuredClone(issue);
  missingTitle.title = "";
  assert.match(
    validateIssue(missingTitle, manifest, { mode: "live-send" }).errors.join("\n"),
    /title is required/
  );
});

test("unknown newsletter validation modes fail closed", () => {
  assert.throws(
    () => validateIssue(loadIssue("2026-07"), loadManifest("2026-07"), { mode: "live-sned" }),
    /Unsupported newsletter validation mode/
  );
});

test("live-send rejects a revision changed after review before provider delivery", async () => {
  await withAdminNewsletterFiles(async ({ files }) => {
    const reviewedIssue = loadIssue("2026-07");
    const reviewedManifest = loadManifest("2026-07");
    const reviewedRevision = newsletterRevision(reviewedIssue, reviewedManifest);
    const changedIssue = structuredClone(reviewedIssue);
    changedIssue.openingNote = `${changedIssue.openingNote} Changed after review.`;
    files.set("newsletter/data/issues/2026-07.json", `${JSON.stringify(changedIssue, null, 2)}\n`);

    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      return providerResponse(200, { id: "must_not_send" });
    };

    try {
      await assert.rejects(
        sendNewsletterIssue("2026-07", "2026-07", reviewedRevision),
        (error) => error.statusCode === 409
          && error.code === "NEWSLETTER_REVISION_CONFLICT"
          && error.currentRevision === newsletterRevision(changedIssue, reviewedManifest)
      );
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(providerCalls, 0);
  });
});

test("live audience delivery requires Resend Segment and Topic configuration", () => {
  assert.equal(ensureNewsletterSenderConfigured({
    fromEmail: "Field Notes <field-notes@example.test>",
    apiKey: "re_test",
    segmentId: "segment_test",
    topicId: "topic_test"
  }), "resend");

  assert.throws(() => ensureNewsletterSenderConfigured({
    fromEmail: "Field Notes <field-notes@example.test>",
    smtpUser: "smtp@example.test",
    smtpPass: "password",
    smtpRecipients: ["reader@example.test"]
  }), /SMTP is limited to dry runs/);
});

test("broadcast payload is Topic-scoped and keeps Resend's recipient-specific preference URL", () => {
  const issue = loadIssue("2026-07");
  const payload = newsletterBroadcastPayload(issue, {
    segmentId: "segment_test",
    topicId: "topic_field_notes",
    fromEmail: "Field Notes <field-notes@example.test>",
    replyToEmail: "studio@example.test"
  });
  assert.equal(payload.segment_id, "segment_test");
  assert.equal(payload.topic_id, "topic_field_notes");
  assert.equal(payload.reply_to, "studio@example.test");
  assert.equal(payload.send, true);
  assert.match(payload.html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
  assert.equal(payload.html.includes("https://www.davidesolla.com/preferences"), false);
});

test("live broadcast delivery is durably send-once", async () => {
  await withLocalSendState(async ({ fullDir }) => {
    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = async () => {
      providerCalls += 1;
      return providerResponse(200, { id: "broadcast_once" });
    };
    const payload = {
      segment_id: "segment_test",
      topic_id: "topic_field_notes",
      from: "Field Notes <field-notes@example.test>",
      subject: "Send once",
      html: "<p>Send once</p>",
      send: true
    };

    try {
      assert.deepEqual(
        await sendNewsletterBroadcastOnce("2099-01", payload, { apiKey: "re_test" }),
        { id: "broadcast_once" }
      );
      await assert.rejects(
        sendNewsletterBroadcastOnce("2099-01", payload, { apiKey: "re_test" }),
        (error) => error.statusCode === 409 && /already has a sent live-send attempt/.test(error.message)
      );
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(providerCalls, 1);
    const state = JSON.parse(await fs.readFile(path.join(fullDir, "2099-01.json"), "utf8"));
    assert.equal(state.status, "sent");
    assert.equal(state.delivery.broadcastId, "broadcast_once");
    assert.match(state.contentHash, /^[a-f0-9]{64}$/);
  });
});

test("a Radar timeout cannot turn an accepted broadcast into a retry risk", async () => {
  await withLocalSendState(async ({ fullDir }) => {
    await withNewsletterMetricsEnv(async () => {
      const originalFetch = global.fetch;
      const originalConsoleError = console.error;
      const logs = [];
      let providerCalls = 0;
      let metricsBody = "";
      console.error = (...args) => logs.push(args);
      global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target === "https://api.resend.com/broadcasts") {
          providerCalls += 1;
          return providerResponse(200, { id: "broadcast_provider_private_timeout" });
        }
        if (target === metricsEnv.RADAR_NEWSLETTER_METRICS_ENDPOINT) {
          metricsBody = options.body;
          return new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              const error = new Error("private timeout detail");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
        throw new Error(`Unexpected request: ${target}`);
      };
      const payload = {
        segment_id: "segment_test",
        topic_id: "topic_field_notes",
        from: "Field Notes <field-notes@example.test>",
        subject: "Accepted with metrics timeout",
        html: "<p>Accepted</p>",
        send: true
      };

      try {
        assert.deepEqual(
          await sendNewsletterBroadcastOnce("2099-03", payload, { apiKey: "re_test" }),
          { id: "broadcast_provider_private_timeout" }
        );
        await assert.rejects(
          sendNewsletterBroadcastOnce("2099-03", payload, { apiKey: "re_test" }),
          (error) => error.statusCode === 409 && /already has a sent live-send attempt/.test(error.message)
        );
      } finally {
        global.fetch = originalFetch;
        console.error = originalConsoleError;
      }

      assert.equal(providerCalls, 1);
      const state = JSON.parse(await fs.readFile(path.join(fullDir, "2099-03.json"), "utf8"));
      assert.equal(state.status, "sent");
      assert.equal(state.delivery.broadcastId, "broadcast_provider_private_timeout");
      const fact = JSON.parse(metricsBody);
      assert.equal(fact.type, "broadcast.accepted");
      assert.equal(fact.issue_id, "2099-03");
      assert.match(fact.campaign_key, /^nlc_[a-f0-9]{64}$/);
      assert.equal(metricsBody.includes("broadcast_provider_private_timeout"), false);
      assert.equal(metricsBody.includes("field-notes@example.test"), false);
      assert.deepEqual(logs, [[
        "Newsletter lifecycle metric failed",
        { type: "broadcast.accepted", code: "request_timeout" }
      ]]);
    }, { RADAR_NEWSLETTER_METRICS_TIMEOUT_MS: "1000" });
  });
});

test("concurrent and ambiguous live-send attempts remain locked before another provider call", async () => {
  await withLocalSendState(async ({ fullDir }) => {
    const originalFetch = global.fetch;
    let providerCalls = 0;
    let releaseProvider;
    let providerStarted;
    const started = new Promise((resolve) => { providerStarted = resolve; });
    const released = new Promise((resolve) => { releaseProvider = resolve; });
    global.fetch = async () => {
      providerCalls += 1;
      providerStarted();
      await released;
      throw new Error("connection closed after request upload");
    };
    const payload = {
      segment_id: "segment_test",
      topic_id: "topic_field_notes",
      from: "Field Notes <field-notes@example.test>",
      subject: "Ambiguous send",
      html: "<p>Ambiguous send</p>",
      send: true
    };

    try {
      const firstAttempt = sendNewsletterBroadcastOnce("2099-02", payload, { apiKey: "re_test" });
      await started;
      await assert.rejects(
        sendNewsletterBroadcastOnce("2099-02", payload, { apiKey: "re_test" }),
        (error) => error.statusCode === 409 && /already has a sending live-send attempt/.test(error.message)
      );
      releaseProvider();
      await assert.rejects(
        firstAttempt,
        (error) => error.statusCode === 503 && /outcome is uncertain/.test(error.message)
      );
      await assert.rejects(
        sendNewsletterBroadcastOnce("2099-02", payload, { apiKey: "re_test" }),
        (error) => error.statusCode === 409 && /already has a ambiguous live-send attempt/.test(error.message)
      );
    } finally {
      releaseProvider();
      global.fetch = originalFetch;
    }

    assert.equal(providerCalls, 1);
    const state = JSON.parse(await fs.readFile(path.join(fullDir, "2099-02.json"), "utf8"));
    assert.equal(state.status, "ambiguous");
    assert.equal(state.failure.providerStatusCode, null);
  });
});
