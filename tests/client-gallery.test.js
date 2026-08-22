const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const {
  decryptAdminData,
  encryptAdminData,
  handleAdminRequest,
  handleClientRequest
} = require("../lib/admin-store");

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

const request = ({ method = "POST", url, body, authorization, address } = {}) => {
  const payload = JSON.stringify(body || {});
  const req = Readable.from(method === "GET" ? [] : [payload]);
  req.method = method;
  req.url = url;
  req.headers = {
    host: "www.davidesolla.com",
    "x-forwarded-proto": "https",
    "x-real-ip": address || `client-gallery-test-${crypto.randomUUID()}`,
    "content-type": "application/json"
  };
  if (authorization) req.headers.authorization = authorization;
  return req;
};

const json = (res) => JSON.parse(res.body);

const adobeResponse = (status, body, url = "") => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  text: async () => typeof body === "string" ? body : JSON.stringify(body)
});

const withClientGalleryBackend = async (operation) => {
  const root = path.resolve(__dirname, "..");
  const keyFor = (filePath) => path.relative(root, String(filePath)).split(path.sep).join("/");
  const originals = {
    readFile: fs.readFile,
    mkdir: fs.mkdir,
    writeFile: fs.writeFile,
    fetch: global.fetch
  };
  const envKeys = [
    "ADMIN_PASSWORD",
    "ADMIN_SESSION_SECRET",
    "ADMIN_DATA_ENCRYPTION_KEY",
    "GITHUB_TOKEN",
    "VERCEL_DEPLOY_HOOK_URL"
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  Object.assign(process.env, {
    ADMIN_PASSWORD: "client-gallery-admin-password",
    ADMIN_SESSION_SECRET: "client-gallery-session-secret",
    ADMIN_DATA_ENCRYPTION_KEY: "client-gallery-encryption-secret"
  });
  delete process.env.GITHUB_TOKEN;
  delete process.env.VERCEL_DEPLOY_HOOK_URL;

  const privateSite = {
    version: 1,
    sections: {},
    albums: [],
    clients: [{
      id: "client-one",
      name: "Client One",
      email: "client@example.test",
      password: "gallery-password",
      lightroomUrl: "https://lightroom.adobe.com/shares/abcdef123456"
    }]
  };
  const files = new Map([
    ["data/admin-site.enc", encryptAdminData(privateSite)],
    ["data/site.json", `${JSON.stringify({ version: 1, sections: {}, albums: [] }, null, 2)}\n`],
    ["newsletter/data/issues/index.json", `${JSON.stringify({ issues: [] }, null, 2)}\n`]
  ]);

  fs.readFile = async (filePath) => {
    const key = keyFor(filePath);
    if (files.has(key)) return files.get(key);
    const error = new Error(`ENOENT: ${key}`);
    error.code = "ENOENT";
    throw error;
  };
  fs.mkdir = async () => undefined;
  fs.writeFile = async (filePath, content) => {
    files.set(keyFor(filePath), String(content));
  };

  global.fetch = async (input) => {
    const target = String(input);

    if (target === "https://lightroom.adobe.com/shares/abcdef123456") {
      return adobeResponse(200, "<html></html>", target);
    }

    if (target.includes("/resources?api_key=LightroomMobileWeb1")) {
      return adobeResponse(200, {
        resources: [{
          type: "album",
          id: "album-one",
          payload: { name: "Client One gallery" }
        }]
      });
    }

    if (target.includes("/albums/album-one/assets?")) {
      return adobeResponse(200, {
        base: "https://photos.adobe.io/v2/spaces/abcdef123456/",
        resources: [{
          asset: {
            id: "asset-one",
            subtype: "image",
            links: {
              "/rels/rendition_type/2048": { href: "renditions/asset-one.jpg" }
            }
          }
        }, {
          asset: {
            id: "asset-two",
            subtype: "image",
            links: {
              "/rels/rendition_type/2048": { href: "renditions/asset-two.jpg" }
            }
          }
        }]
      });
    }

    throw new Error(`Unexpected fetch in client gallery test: ${target}`);
  };

  try {
    return await operation({ files });
  } finally {
    fs.readFile = originals.readFile;
    fs.mkdir = originals.mkdir;
    fs.writeFile = originals.writeFile;
    global.fetch = originals.fetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const clientLogin = async (
  password = "gallery-password",
  address = `client-login-${crypto.randomUUID()}`
) => {
  const res = response();
  await handleClientRequest(request({
    url: "/api/client?action=login",
    address,
    body: {
      email: "client@example.test",
      password
    }
  }), res);
  return res;
};

const adminLogin = async () => {
  const res = response();
  await handleAdminRequest(request({
    url: "/api/admin?action=login",
    body: { password: process.env.ADMIN_PASSWORD }
  }), res);
  assert.equal(res.statusCode, 200);
  return json(res).token;
};

test("client feedback is authenticated, image-scoped, encrypted, and visible only in private admin data", async () => {
  await withClientGalleryBackend(async ({ files }) => {
    const initialPublicSite = files.get("data/site.json");
    const configuredAdminPassword = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    const loginResponse = await clientLogin();
    process.env.ADMIN_PASSWORD = configuredAdminPassword;
    assert.equal(loginResponse.statusCode, 200);
    const login = json(loginResponse);

    assert.match(login.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const tokenBody = JSON.parse(Buffer.from(login.token.split(".")[0], "base64url").toString("utf8"));
    assert.equal(tokenBody.purpose, "client-gallery-session");
    assert.equal(tokenBody.clientId, "client-one");
    assert.ok(tokenBody.expiresAt - Date.now() > 7.9 * 60 * 60 * 1000);
    assert.ok(tokenBody.expiresAt - Date.now() <= 8 * 60 * 60 * 1000);
    assert.equal(login.client.downloadEnabled, false);
    assert.equal(login.client.lightroomUrl, "");
    assert.equal(login.client.images.length, 2);
    assert.equal(login.client.images[0].lightroomAssetId, "asset-one");
    assert.deepEqual(login.client.feedback, []);

    const sessionResponse = response();
    await handleClientRequest(request({
      method: "GET",
      url: "/api/client?action=session",
      authorization: `Bearer ${login.token}`
    }), sessionResponse);
    assert.equal(sessionResponse.statusCode, 200);
    assert.equal(json(sessionResponse).client.downloadEnabled, false);
    assert.equal(json(sessionResponse).client.images.length, 2);
    assert.deepEqual(json(sessionResponse).client.feedback, []);

    const unauthenticated = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      body: { lightroomAssetId: "asset-one", rating: 5, comment: "Favourite" }
    }), unauthenticated);
    assert.equal(unauthenticated.statusCode, 401);

    const invalidRating = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${login.token}`,
      body: { lightroomAssetId: "asset-one", rating: 4.5, comment: "Almost" }
    }), invalidRating);
    assert.equal(invalidRating.statusCode, 400);

    const longComment = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${login.token}`,
      body: { lightroomAssetId: "asset-one", rating: 4, comment: "x".repeat(1501) }
    }), longComment);
    assert.equal(longComment.statusCode, 400);

    const missingImage = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${login.token}`,
      body: { lightroomAssetId: "asset-missing", rating: 5, comment: "Not in gallery" }
    }), missingImage);
    assert.equal(missingImage.statusCode, 404);
    assert.equal(files.has("data/client-feedback.enc"), false);

    const savedResponse = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${login.token}`,
      body: {
        lightroomAssetId: "asset-one",
        rating: 5,
        comment: "Use this one <script>alert(1)</script>"
      }
    }), savedResponse);
    assert.equal(savedResponse.statusCode, 200);
    const saved = json(savedResponse);
    assert.equal(saved.deleted, false);
    assert.equal(saved.feedback.lightroomAssetId, "asset-one");
    assert.equal(saved.feedback.rating, 5);
    assert.match(saved.feedback.imageSrc, /renditions\/asset-one\.jpg/);

    const encryptedFeedback = files.get("data/client-feedback.enc");
    assert.ok(encryptedFeedback);
    assert.doesNotMatch(encryptedFeedback, /Use this one|client-one|asset-one/);
    const feedbackData = decryptAdminData(encryptedFeedback);
    assert.equal(feedbackData.records.length, 1);
    assert.equal(feedbackData.records[0].clientId, "client-one");
    assert.equal(feedbackData.records[0].lightroomAssetId, "asset-one");
    assert.equal(files.get("data/site.json"), initialPublicSite);

    const refreshedSessionResponse = response();
    await handleClientRequest(request({
      method: "GET",
      url: "/api/client?action=session",
      authorization: `Bearer ${login.token}`
    }), refreshedSessionResponse);
    assert.equal(refreshedSessionResponse.statusCode, 200);
    assert.equal(json(refreshedSessionResponse).client.feedback.length, 1);
    assert.equal(json(refreshedSessionResponse).client.feedback[0].rating, 5);

    const secondLoginResponse = await clientLogin();
    const secondLogin = json(secondLoginResponse);
    assert.equal(secondLogin.client.feedback.length, 1);
    assert.equal(secondLogin.client.feedback[0].comment, "Use this one <script>alert(1)</script>");

    const adminToken = await adminLogin();
    const adminSiteResponse = response();
    await handleAdminRequest(request({
      method: "GET",
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`
    }), adminSiteResponse);
    assert.equal(adminSiteResponse.statusCode, 200);
    const adminSite = json(adminSiteResponse).site;
    assert.equal(adminSite.clients[0].feedback.length, 1);
    assert.equal(adminSite.clients[0].feedback[0].rating, 5);

    const feedbackBeforeAdminSave = files.get("data/client-feedback.enc");
    adminSite.clients[0].feedback = [];
    const adminSaveResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`,
      body: { site: adminSite }
    }), adminSaveResponse);
    assert.equal(adminSaveResponse.statusCode, 200);
    assert.equal(files.get("data/client-feedback.enc"), feedbackBeforeAdminSave);
    assert.equal(json(adminSaveResponse).site.clients[0].feedback.length, 1);
    const publicAfterAdminSave = JSON.parse(files.get("data/site.json"));
    assert.equal(publicAfterAdminSave.clients, undefined);
    assert.equal(publicAfterAdminSave.feedback, undefined);

    const migratedLoginResponse = await clientLogin();
    assert.equal(migratedLoginResponse.statusCode, 200);
    const migratedLogin = json(migratedLoginResponse);
    assert.equal(migratedLogin.client.feedback.length, 1);

    const commentOnlyResponse = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${migratedLogin.token}`,
      body: { lightroomAssetId: "asset-one", rating: 0, comment: "Comment only" }
    }), commentOnlyResponse);
    assert.equal(commentOnlyResponse.statusCode, 200);
    assert.equal(json(commentOnlyResponse).feedback.rating, 0);
    const commentOnlyData = decryptAdminData(files.get("data/client-feedback.enc"));
    assert.equal(commentOnlyData.records.length, 1);
    assert.equal(commentOnlyData.records[0].comment, "Comment only");

    const deleteResponse = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${migratedLogin.token}`,
      body: { lightroomAssetId: "asset-one", rating: 0, comment: "" }
    }), deleteResponse);
    assert.equal(deleteResponse.statusCode, 200);
    assert.equal(json(deleteResponse).deleted, true);
    assert.equal(json(deleteResponse).feedback, null);
    assert.deepEqual(decryptAdminData(files.get("data/client-feedback.enc")).records, []);

    const enableSiteResponse = response();
    const siteToEnable = json(adminSaveResponse).site;
    siteToEnable.clients[0].downloadEnabled = true;
    await handleAdminRequest(request({
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`,
      body: { site: siteToEnable }
    }), enableSiteResponse);
    assert.equal(enableSiteResponse.statusCode, 200);

    const staleAfterEnable = response();
    await handleClientRequest(request({
      method: "GET",
      url: "/api/client?action=session",
      authorization: `Bearer ${migratedLogin.token}`
    }), staleAfterEnable);
    assert.equal(staleAfterEnable.statusCode, 401);

    const staleFeedbackAfterEnable = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${migratedLogin.token}`,
      body: { lightroomAssetId: "asset-one", rating: 3, comment: "Stale session" }
    }), staleFeedbackAfterEnable);
    assert.equal(staleFeedbackAfterEnable.statusCode, 401);

    const enabledLoginResponse = await clientLogin();
    assert.equal(enabledLoginResponse.statusCode, 200);
    const enabledLogin = json(enabledLoginResponse);
    assert.equal(enabledLogin.client.downloadEnabled, true);
    assert.equal(enabledLogin.client.lightroomUrl, "https://lightroom.adobe.com/shares/abcdef123456");

    const disableSiteResponse = response();
    const siteToDisable = json(enableSiteResponse).site;
    siteToDisable.clients[0].downloadEnabled = false;
    await handleAdminRequest(request({
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`,
      body: { site: siteToDisable }
    }), disableSiteResponse);
    assert.equal(disableSiteResponse.statusCode, 200);

    const staleAfterDisable = response();
    await handleClientRequest(request({
      method: "GET",
      url: "/api/client?action=session",
      authorization: `Bearer ${enabledLogin.token}`
    }), staleAfterDisable);
    assert.equal(staleAfterDisable.statusCode, 401);

    const disabledLoginResponse = await clientLogin();
    assert.equal(disabledLoginResponse.statusCode, 200);
    const disabledLogin = json(disabledLoginResponse);
    assert.equal(disabledLogin.client.downloadEnabled, false);
    assert.equal(disabledLogin.client.lightroomUrl, "");

    const passwordSiteResponse = response();
    const siteWithNewPassword = json(disableSiteResponse).site;
    siteWithNewPassword.clients[0].password = "rotated-gallery-password";
    await handleAdminRequest(request({
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`,
      body: { site: siteWithNewPassword }
    }), passwordSiteResponse);
    assert.equal(passwordSiteResponse.statusCode, 200);

    const staleAfterPasswordChange = response();
    await handleClientRequest(request({
      method: "GET",
      url: "/api/client?action=session",
      authorization: `Bearer ${disabledLogin.token}`
    }), staleAfterPasswordChange);
    assert.equal(staleAfterPasswordChange.statusCode, 401);

    const oldPasswordLogin = await clientLogin();
    assert.equal(oldPasswordLogin.statusCode, 401);
    const rotatedLoginResponse = await clientLogin("rotated-gallery-password");
    assert.equal(rotatedLoginResponse.statusCode, 200);
    const rotatedLogin = json(rotatedLoginResponse);

    const feedbackBeforeClientDeletion = response();
    await handleClientRequest(request({
      url: "/api/client?action=feedback",
      authorization: `Bearer ${rotatedLogin.token}`,
      body: { lightroomAssetId: "asset-two", rating: 4, comment: "Alternative choice" }
    }), feedbackBeforeClientDeletion);
    assert.equal(feedbackBeforeClientDeletion.statusCode, 200);
    assert.equal(decryptAdminData(files.get("data/client-feedback.enc")).records.length, 1);

    const deleteClientResponse = response();
    const siteWithoutClient = json(passwordSiteResponse).site;
    siteWithoutClient.clients = [];
    await handleAdminRequest(request({
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`,
      body: { site: siteWithoutClient }
    }), deleteClientResponse);
    assert.equal(deleteClientResponse.statusCode, 200);
    assert.deepEqual(json(deleteClientResponse).site.clients, []);
    assert.deepEqual(decryptAdminData(files.get("data/client-feedback.enc")).records, []);
  });
});

test("an admin save does not create an empty feedback file when there is nothing to prune", async () => {
  await withClientGalleryBackend(async ({ files }) => {
    const adminToken = await adminLogin();
    const getResponse = response();
    await handleAdminRequest(request({
      method: "GET",
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`
    }), getResponse);
    assert.equal(getResponse.statusCode, 200);
    assert.equal(files.has("data/client-feedback.enc"), false);

    const saveResponse = response();
    await handleAdminRequest(request({
      url: "/api/admin?action=site",
      authorization: `Bearer ${adminToken}`,
      body: { site: json(getResponse).site }
    }), saveResponse);
    assert.equal(saveResponse.statusCode, 200);
    assert.equal(files.has("data/client-feedback.enc"), false);
  });
});
