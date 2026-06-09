const Busboy = require("busboy");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const publicDataFile = "data/site.json";
const adminDataFile = "data/admin-site.json";
const maxUploadBytes = 25 * 1024 * 1024;
const lightroomApiKey = "LightroomMobileWeb1";

const jsonResponse = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const readRequestJson = (req) => new Promise((resolve, reject) => {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;

    if (body.length > 2 * 1024 * 1024) {
      reject(new Error("Request body is too large"));
      req.destroy();
    }
  });

  req.on("end", () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch (error) {
      reject(new Error("Invalid JSON body"));
    }
  });

  req.on("error", reject);
});

const parseMultipart = (req) => new Promise((resolve, reject) => {
  const fields = {};
  const files = [];
  const busboy = Busboy({
    headers: req.headers,
    limits: {
      fileSize: maxUploadBytes,
      files: 30
    }
  });

  busboy.on("field", (name, value) => {
    fields[name] = value;
  });

  busboy.on("file", (name, stream, info) => {
    const chunks = [];
    let size = 0;

    stream.on("data", (chunk) => {
      size += chunk.length;
      chunks.push(chunk);
    });

    stream.on("limit", () => {
      reject(new Error("Image is larger than 25MB"));
    });

    stream.on("end", () => {
      files.push({
        field: name,
        filename: info.filename,
        mimeType: info.mimeType,
        buffer: Buffer.concat(chunks),
        size
      });
    });
  });

  busboy.on("finish", () => resolve({ fields, files }));
  busboy.on("error", reject);
  req.pipe(busboy);
});

const isLocalRuntime = () => process.env.VERCEL !== "1";

const requireAdmin = (req) => {
  const configuredPassword = process.env.ADMIN_PASSWORD || (isLocalRuntime() ? "admin" : "");

  if (!configuredPassword) {
    const error = new Error("ADMIN_PASSWORD is not configured");
    error.statusCode = 503;
    throw error;
  }

  if (req.headers["x-admin-password"] !== configuredPassword) {
    const error = new Error("Invalid admin password");
    error.statusCode = 401;
    throw error;
  }
};

const repoConfig = () => ({
  owner: process.env.GITHUB_OWNER || "robotbanker",
  repo: process.env.GITHUB_REPO || "davide-solla-portfolio",
  branch: process.env.GITHUB_BRANCH || "main",
  token: process.env.GITHUB_TOKEN || "",
  authorName: process.env.GITHUB_AUTHOR_NAME || "Davide Solla Admin",
  authorEmail: process.env.GITHUB_AUTHOR_EMAIL || "admin@davidesolla.com"
});

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  "x-github-api-version": "2022-11-28"
});

const githubRequest = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(body.message || "GitHub request failed");
    error.statusCode = response.status;
    throw error;
  }

  return body;
};

const deployHookConfig = () => ({
  url: process.env.VERCEL_DEPLOY_HOOK_URL || "",
  timeoutMs: Number(process.env.VERCEL_DEPLOY_HOOK_TIMEOUT_MS || 10000)
});

const parseJsonSafely = (text) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {};
  }
};

const triggerVercelDeploy = async () => {
  const { url, timeoutMs } = deployHookConfig();

  if (!url) {
    return { configured: false, triggered: false };
  }

  try {
    new URL(url);
  } catch (error) {
    return {
      configured: true,
      triggered: false,
      error: "VERCEL_DEPLOY_HOOK_URL is not a valid URL"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });
    const text = await response.text();
    const body = parseJsonSafely(text);

    if (!response.ok) {
      return {
        configured: true,
        triggered: false,
        statusCode: response.status,
        error: body.message || text || "Vercel deploy hook failed"
      };
    }

    return {
      configured: true,
      triggered: true,
      jobId: body.job?.id || ""
    };
  } catch (error) {
    return {
      configured: true,
      triggered: false,
      error: error.name === "AbortError" ? "Vercel deploy hook timed out" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
};

const readGithubFile = async (filePath) => {
  const config = repoConfig();
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(config.branch)}`;
  const body = await githubRequest(url, {
    headers: githubHeaders(config.token)
  });

  return {
    content: Buffer.from(body.content || "", "base64").toString("utf8"),
    sha: body.sha
  };
};

const writeGithubFile = async (filePath, content, message) => {
  const config = repoConfig();
  let sha = "";

  try {
    const currentFile = await readGithubFile(filePath);
    sha = currentFile.sha;
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
  const body = {
    message,
    branch: config.branch,
    content: Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content).toString("base64"),
    committer: {
      name: config.authorName,
      email: config.authorEmail
    }
  };

  if (sha) {
    body.sha = sha;
  }

  await githubRequest(url, {
    method: "PUT",
    headers: githubHeaders(config.token),
    body: JSON.stringify(body)
  });
};

const isMissingFileError = (error) => error?.statusCode === 404 || error?.code === "ENOENT";

const readDataFile = async (filePath) => {
  const config = repoConfig();

  if (config.token) {
    const file = await readGithubFile(filePath);
    return JSON.parse(file.content);
  }

  const file = await fs.readFile(path.join(rootDir, filePath), "utf8");
  return JSON.parse(file);
};

const readSiteData = async () => {
  try {
    return await readDataFile(adminDataFile);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  return readDataFile(publicDataFile);
};

const sanitizePublicValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizePublicValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["lightroomUrl", "lightroomAssetId"].includes(key))
      .map(([key, child]) => [key, sanitizePublicValue(child)])
  );
};

const sanitizePublicSiteData = (siteData) => sanitizePublicValue(siteData);

const writeSiteData = async (siteData) => {
  const adminContent = `${JSON.stringify(siteData, null, 2)}\n`;
  const publicContent = `${JSON.stringify(sanitizePublicSiteData(siteData), null, 2)}\n`;
  const config = repoConfig();

  if (config.token) {
    await writeGithubFile(adminDataFile, adminContent, "Update admin portfolio content");
    await writeGithubFile(publicDataFile, publicContent, "Update public portfolio content");
    return;
  }

  await fs.mkdir(path.dirname(path.join(rootDir, adminDataFile)), { recursive: true });
  await fs.writeFile(path.join(rootDir, adminDataFile), adminContent);
  await fs.writeFile(path.join(rootDir, publicDataFile), publicContent);
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60) || "image";

const uploadImage = async (file) => {
  if (!file || !file.buffer?.length) {
    const error = new Error("No image file was uploaded");
    error.statusCode = 400;
    throw error;
  }

  if (!file.mimeType?.startsWith("image/")) {
    const error = new Error("Only image uploads are supported");
    error.statusCode = 400;
    throw error;
  }

  const extension = path.extname(file.filename || "").toLowerCase() || ".jpg";
  const safeName = `${slugify(file.filename || "image")}-${crypto.randomBytes(4).toString("hex")}${extension}`;
  const date = new Date().toISOString().slice(0, 10);
  const uploadPath = `assets/images/uploads/${date}/${safeName}`;
  const config = repoConfig();

  if (config.token) {
    await writeGithubFile(uploadPath, file.buffer, `Upload portfolio image ${safeName}`);
    return uploadPath;
  }

  const fullPath = path.join(rootDir, uploadPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file.buffer);
  return uploadPath;
};

const parseAdobeJson = (text) => JSON.parse(text.replace(/^while \(1\) \{\}\s*/, ""));

const fetchAdobeJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`Lightroom request failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return parseAdobeJson(text);
};

const resolveLightroomShare = async (shareUrl) => {
  let url;

  try {
    url = new URL(shareUrl);
  } catch (error) {
    const invalid = new Error("Enter a valid Lightroom shared gallery URL");
    invalid.statusCode = 400;
    throw invalid;
  }

  const response = await fetch(url, {
    headers: {
      accept: "text/html"
    },
    redirect: "follow"
  });
  const html = await response.text();

  if (!response.ok) {
    const error = new Error(`Lightroom gallery could not be opened (${response.status})`);
    error.statusCode = response.status;
    throw error;
  }

  const finalUrl = response.url || shareUrl;
  const shareMatch = finalUrl.match(/\/shares\/([a-f0-9]+)/i)
    || html.match(/https:\/\/lightroom\.adobe\.com\/shares\/([a-f0-9]+)/i);

  if (!shareMatch) {
    const error = new Error("Could not find a Lightroom share id in that link");
    error.statusCode = 400;
    throw error;
  }

  return {
    html,
    shareUrl: finalUrl,
    spaceId: shareMatch[1]
  };
};

const imageFilenameFromAsset = (asset, index) => {
  const sourceName = asset?.payload?.importSource?.fileName || asset?.payload?.xmp?.title || `lightroom-${index + 1}`;
  return `${slugify(sourceName)}.jpg`;
};

const lightroomRenditionUrl = (base, asset) => {
  const links = asset.links || {};
  const rendition = links["/rels/rendition_type/2048"]
    || links["/rels/rendition_type/1280"]
    || links["/rels/rendition_type/640"]
    || links["/rels/rendition_type/thumbnail2x"];

  if (!rendition?.href) {
    return "";
  }

  return `${base}${rendition.href}?api_key=${lightroomApiKey}`;
};

const importLightroomGallery = async (shareUrl) => {
  const share = await resolveLightroomShare(shareUrl);
  const resourcesUrl = `https://photos.adobe.io/v2/spaces/${share.spaceId}/resources?api_key=${lightroomApiKey}`;
  const resources = await fetchAdobeJson(resourcesUrl);
  const album = resources.resources?.find((item) => item.type === "album");

  if (!album) {
    const error = new Error("No Lightroom album was found in that shared gallery");
    error.statusCode = 400;
    throw error;
  }

  const albumId = album.id;
  const albumName = album.payload?.name || "Lightroom gallery";
  const assetsUrl = `https://photos.adobe.io/v2/spaces/${share.spaceId}/albums/${albumId}/assets?embed=asset&subtype=image%3Bvideo&api_key=${lightroomApiKey}`;
  const assetsResponse = await fetchAdobeJson(assetsUrl);
  const base = assetsResponse.base || `https://photos.adobe.io/v2/spaces/${share.spaceId}/`;
  const imported = [];

  for (const [index, resource] of (assetsResponse.resources || []).entries()) {
    const asset = resource.asset;

    if (!asset || asset.subtype !== "image") {
      continue;
    }

    const renditionUrl = lightroomRenditionUrl(base, asset);

    if (!renditionUrl) {
      continue;
    }

    const response = await fetch(renditionUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    if (!response.ok || !mimeType.startsWith("image/") || !buffer.length) {
      continue;
    }

    const src = await uploadImage({
      filename: imageFilenameFromAsset(asset, index),
      mimeType,
      buffer,
      size: buffer.length
    });

    imported.push({
      src,
      alt: `${albumName} ${imported.length + 1}`,
      previewPosition: "50% 50%",
      lightroomAssetId: asset.id
    });
  }

  if (!imported.length) {
    const error = new Error("No downloadable Lightroom images were found");
    error.statusCode = 400;
    throw error;
  }

  return {
    albumTitle: albumName,
    imported,
    lightroomUrl: share.shareUrl
  };
};

const normaliseSiteData = (siteData) => ({
  ...siteData,
  version: siteData.version || 1,
  updatedAt: new Date().toISOString(),
  albums: Array.isArray(siteData.albums) ? siteData.albums : []
});

const handleAdminRequest = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    requireAdmin(req);

    const requestUrl = new URL(req.url, "http://localhost");
    const action = requestUrl.searchParams.get("action") || "site";

    if (req.method === "GET" && action === "site") {
      jsonResponse(res, 200, { site: await readSiteData() });
      return;
    }

    if (req.method === "POST" && action === "site") {
      const body = await readRequestJson(req);
      const site = normaliseSiteData(body.site || body);
      await writeSiteData(site);
      const deployment = await triggerVercelDeploy();
      jsonResponse(res, 200, { ok: true, site, deployment });
      return;
    }

    if (req.method === "POST" && action === "upload") {
      const parsed = await parseMultipart(req);
      const files = [];

      for (const file of parsed.files) {
        files.push({ src: await uploadImage(file) });
      }

      jsonResponse(res, 200, { ok: true, src: files[0]?.src || "", files });
      return;
    }

    if (req.method === "POST" && action === "lightroom") {
      const body = await readRequestJson(req);
      const imported = await importLightroomGallery(body.url || body.lightroomUrl || "");
      jsonResponse(res, 200, { ok: true, ...imported });
      return;
    }

    jsonResponse(res, 404, { error: "Unknown admin action" });
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, { error: error.message || "Admin request failed" });
  }
};

module.exports = {
  handleAdminRequest
};
