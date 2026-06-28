const Busboy = require("busboy");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { generateSitemap } = require("./seo");
const { clearRateLimit, rateLimitRequest, timingSafeStringEqual } = require("./security");
const { renderEmail, validateIssue } = require("../newsletter/lib/render-email");

const rootDir = path.resolve(__dirname, "..");
const publicDataFile = "data/site.json";
const adminDataFile = "data/admin-site.enc";
const legacyAdminDataFile = "data/admin-site.json";
const sitemapFile = "sitemap.xml";
const newsletterIssueDir = "newsletter/data/issues";
const newsletterSourceDir = "newsletter/data/sources";
const newsletterDistDir = "newsletter/dist";
const maxUploadBytes = 25 * 1024 * 1024;
const lightroomApiKey = "LightroomMobileWeb1";
const passwordHashPrefix = "scrypt";
const adminSessionMs = 8 * 60 * 60 * 1000;

const adminDataSecret = () => String(
  process.env.ADMIN_DATA_ENCRYPTION_KEY
  || process.env.ADMIN_SESSION_SECRET
  || process.env.ADMIN_PASSWORD
  || ""
).trim();

const encryptAdminData = (siteData) => {
  const secret = adminDataSecret();

  if (!secret) {
    const error = new Error("ADMIN_DATA_ENCRYPTION_KEY is not configured");
    error.statusCode = 503;
    throw error;
  }

  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secret).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(siteData), "utf8"),
    cipher.final()
  ]);

  return `${JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64")
  }, null, 2)}\n`;
};

const decryptAdminData = (content) => {
  const secret = adminDataSecret();

  if (!secret) {
    const error = new Error("ADMIN_DATA_ENCRYPTION_KEY is not configured");
    error.statusCode = 503;
    throw error;
  }

  try {
    const envelope = JSON.parse(content);

    if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
      throw new Error("Unsupported encrypted data format");
    }

    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final()
    ]).toString("utf8"));
  } catch (cause) {
    const error = new Error("Private site data could not be decrypted");
    error.statusCode = 503;
    throw error;
  }
};

const jsonResponse = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
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
  let parseError = null;
  let totalSize = 0;
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
      totalSize += chunk.length;

      if (totalSize > 100 * 1024 * 1024) {
        parseError = parseError || new Error("The combined upload is larger than 100MB");
        return;
      }

      if (!parseError) {
        chunks.push(chunk);
      }
    });

    stream.on("limit", () => {
      parseError = parseError || new Error("Image is larger than 25MB");
    });

    stream.on("end", () => {
      if (!parseError) files.push({
        field: name,
        filename: info.filename,
        mimeType: info.mimeType,
        buffer: Buffer.concat(chunks),
        size
      });
    });
  });

  busboy.on("finish", () => parseError ? reject(parseError) : resolve({ fields, files }));
  busboy.on("error", reject);
  req.pipe(busboy);
});

const adminCredentials = () => ({
  password: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || ""
});

const requireAdminConfiguration = () => {
  const credentials = adminCredentials();

  if (!credentials.password || !credentials.sessionSecret) {
    const error = new Error("ADMIN_PASSWORD is not configured");
    error.statusCode = 503;
    throw error;
  }

  return credentials;
};

const createAdminToken = () => {
  const { sessionSecret } = requireAdminConfiguration();
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + adminSessionMs,
    nonce: crypto.randomBytes(16).toString("base64url")
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

const verifyAdminToken = (token) => {
  const { sessionSecret } = requireAdminConfiguration();
  const [payload, signature] = String(token || "").split(".");

  if (!payload || !signature) return false;

  const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");

  if (!timingSafeStringEqual(signature, expected)) return false;

  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(body.expiresAt) > Date.now();
  } catch (error) {
    return false;
  }
};

const requireAdmin = (req) => {
  const authorization = String(req.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!verifyAdminToken(token)) {
    const error = new Error("Admin session is invalid or has expired");
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

const githubRefPath = (branch) => encodeURIComponent(branch).replace(/%2F/g, "/");

const writeGithubFiles = async (files, message) => {
  if (!files.length) {
    return;
  }

  const config = repoConfig();
  const baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  const ref = await githubRequest(`${baseUrl}/git/ref/heads/${githubRefPath(config.branch)}`, {
    headers: githubHeaders(config.token)
  });
  const headSha = ref.object?.sha;

  if (!headSha) {
    throw new Error("GitHub branch head could not be found");
  }

  const headCommit = await githubRequest(`${baseUrl}/git/commits/${headSha}`, {
    headers: githubHeaders(config.token)
  });

  const tree = await Promise.all(files.map(async (file) => {
    const blob = await githubRequest(`${baseUrl}/git/blobs`, {
      method: "POST",
      headers: githubHeaders(config.token),
      body: JSON.stringify({
        content: file.content.toString("base64"),
        encoding: "base64"
      })
    });

    return {
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    };
  }));

  const newTree = await githubRequest(`${baseUrl}/git/trees`, {
    method: "POST",
    headers: githubHeaders(config.token),
    body: JSON.stringify({
      base_tree: headCommit.tree?.sha,
      tree
    })
  });

  const newCommit = await githubRequest(`${baseUrl}/git/commits`, {
    method: "POST",
    headers: githubHeaders(config.token),
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [headSha],
      committer: {
        name: config.authorName,
        email: config.authorEmail
      }
    })
  });

  await githubRequest(`${baseUrl}/git/refs/heads/${githubRefPath(config.branch)}`, {
    method: "PATCH",
    headers: githubHeaders(config.token),
    body: JSON.stringify({
      sha: newCommit.sha
    })
  });
};

const isMissingFileError = (error) => error?.statusCode === 404 || error?.code === "ENOENT";

const readDataFile = async (filePath, parseJson = true) => {
  const config = repoConfig();

  if (config.token) {
    const file = await readGithubFile(filePath);
    return parseJson ? JSON.parse(file.content) : file.content;
  }

  const file = await fs.readFile(path.join(rootDir, filePath), "utf8");
  return parseJson ? JSON.parse(file) : file;
};

const writeDataFile = async (filePath, content, message) => {
  const config = repoConfig();

  if (config.token) {
    await writeGithubFile(filePath, content, message);
    return;
  }

  const fullPath = path.join(rootDir, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
};

const isNewsletterIssueId = (value) => /^\d{4}-\d{2}$/.test(String(value || ""));

const newsletterIssuePath = (issueId) => `${newsletterIssueDir}/${issueId}.json`;

const newsletterManifestPath = (issueId) => `${newsletterSourceDir}/${issueId}.manifest.json`;

const newsletterDistPath = (issueId) => `${newsletterDistDir}/${issueId}.html`;

const normaliseIssueIndexEntry = (issue) => ({
  issueId: issue.issueId,
  month: issue.month,
  year: Number(issue.year) || issue.year,
  title: issue.title
});

const readNewsletterIndex = async () => {
  try {
    const index = await readDataFile(`${newsletterIssueDir}/index.json`);
    return Array.isArray(index.issues) ? index.issues : [];
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  return [];
};

const readNewsletterManifest = async (issueId) => {
  try {
    return await readDataFile(newsletterManifestPath(issueId));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
};

const listLocalNewsletterIssues = async () => {
  const files = await fs.readdir(path.join(rootDir, newsletterIssueDir));
  return Promise.all(files
    .filter((fileName) => /^\d{4}-\d{2}\.json$/.test(fileName))
    .map(async (fileName) => {
      const issue = await readDataFile(`${newsletterIssueDir}/${fileName}`);
      return normaliseIssueIndexEntry(issue);
    }));
};

const listNewsletterIssues = async () => {
  const indexed = new Map((await readNewsletterIndex()).map((issue) => [issue.issueId, issue]));
  const config = repoConfig();

  if (!config.token) {
    for (const issue of await listLocalNewsletterIssues()) {
      indexed.set(issue.issueId, { ...indexed.get(issue.issueId), ...issue });
    }
  }

  return Array.from(indexed.values()).sort((left, right) => left.issueId.localeCompare(right.issueId));
};

const readNewsletterIssue = async (issueId) => {
  if (!isNewsletterIssueId(issueId)) {
    const error = new Error("Invalid newsletter issue ID");
    error.statusCode = 400;
    throw error;
  }

  return readDataFile(newsletterIssuePath(issueId));
};

const writeNewsletterIssue = async (issueId, issue) => {
  if (!isNewsletterIssueId(issueId)) {
    const error = new Error("Invalid newsletter issue ID");
    error.statusCode = 400;
    throw error;
  }

  if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
    const error = new Error("Newsletter issue payload must be a JSON object");
    error.statusCode = 400;
    throw error;
  }

  if (issue.issueId && issue.issueId !== issueId) {
    const error = new Error("Newsletter issue ID must match the selected issue");
    error.statusCode = 400;
    throw error;
  }

  issue.issueId = issueId;
  const issues = await listNewsletterIssues();
  const nextIssues = issues
    .filter((entry) => entry.issueId !== issueId)
    .concat(normaliseIssueIndexEntry(issue))
    .sort((left, right) => left.issueId.localeCompare(right.issueId));
  const issueContent = `${JSON.stringify(issue, null, 2)}\n`;
  const indexContent = `${JSON.stringify({ issues: nextIssues }, null, 2)}\n`;
  const config = repoConfig();

  if (config.token) {
    await writeGithubFiles([
      { path: newsletterIssuePath(issueId), content: Buffer.from(issueContent) },
      { path: `${newsletterIssueDir}/index.json`, content: Buffer.from(indexContent) }
    ], `Update newsletter issue ${issueId}`);
  } else {
    await writeDataFile(newsletterIssuePath(issueId), issueContent, `Update newsletter issue ${issueId}`);
    await writeDataFile(`${newsletterIssueDir}/index.json`, indexContent, "Update newsletter issue index");
  }

  const deployment = await triggerVercelDeploy();
  return { issue, issues: nextIssues, deployment };
};

const buildNewsletterIssue = async (issueId) => {
  const issue = await readNewsletterIssue(issueId);
  const validation = validateIssue(issue, await readNewsletterManifest(issueId));

  if (validation.errors.length) {
    const error = new Error("Newsletter issue did not pass validation");
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }

  const output = newsletterDistPath(issueId);
  await writeDataFile(output, renderEmail(issue), `Build newsletter email ${issueId}`);
  const deployment = await triggerVercelDeploy();
  return { output, validation, deployment };
};

const clonePublicAlbum = (album) => JSON.parse(JSON.stringify(album));

const reconcilePublicAlbumData = async (siteData) => {
  let publicSiteData;

  try {
    publicSiteData = await readDataFile(publicDataFile);
  } catch (error) {
    if (isMissingFileError(error)) {
      return siteData;
    }

    throw error;
  }

  const privateAlbums = Array.isArray(siteData.albums) ? siteData.albums : [];
  const publicAlbums = Array.isArray(publicSiteData.albums) ? publicSiteData.albums : [];
  const privateById = new Map(privateAlbums.map((album) => [album.id, album]));

  for (const publicAlbum of publicAlbums) {
    const privateAlbum = privateById.get(publicAlbum.id);

    if (!privateAlbum) {
      privateAlbums.push(clonePublicAlbum(publicAlbum));
      continue;
    }

    for (const field of ["section", "title", "kicker", "description"]) {
      if (!privateAlbum[field] && publicAlbum[field]) {
        privateAlbum[field] = publicAlbum[field];
      }
    }

    if ((!Array.isArray(privateAlbum.covers) || !privateAlbum.covers.length) && publicAlbum.covers?.length) {
      privateAlbum.covers = clonePublicAlbum(publicAlbum.covers);
    }

    if ((!Array.isArray(privateAlbum.images) || !privateAlbum.images.length) && publicAlbum.images?.length) {
      privateAlbum.images = clonePublicAlbum(publicAlbum.images);
    }
  }

  siteData.albums = privateAlbums;
  return siteData;
};

const readSiteData = async () => {
  try {
    const encrypted = await readDataFile(adminDataFile, false);
    return await reconcilePublicAlbumData(decryptAdminData(encrypted));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  try {
    return await reconcilePublicAlbumData(await readDataFile(legacyAdminDataFile));
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
      .filter(([key]) => !["clients", "lightroomUrl", "lightroomAssetId", "password", "passwordHash"].includes(key))
      .map(([key, child]) => [key, sanitizePublicValue(child)])
  );
};

const sanitizePublicSiteData = (siteData) => sanitizePublicValue(siteData);

const writeSiteData = async (siteData) => {
  const adminContent = encryptAdminData(siteData);
  const publicSiteData = sanitizePublicSiteData(siteData);
  const publicContent = `${JSON.stringify(publicSiteData, null, 2)}\n`;
  const sitemapContent = generateSitemap(publicSiteData);
  const config = repoConfig();

  if (config.token) {
    await writeGithubFile(adminDataFile, adminContent, "Update admin portfolio content");
    await writeGithubFile(publicDataFile, publicContent, "Update public portfolio content");
    await writeGithubFile(sitemapFile, sitemapContent, "Update SEO sitemap");
    return;
  }

  await fs.mkdir(path.dirname(path.join(rootDir, adminDataFile)), { recursive: true });
  await fs.writeFile(path.join(rootDir, adminDataFile), adminContent);
  await fs.writeFile(path.join(rootDir, publicDataFile), publicContent);
  await fs.writeFile(path.join(rootDir, sitemapFile), sitemapContent);
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60) || "image";

const cleanText = (value = "", maxLength = 500) => String(value || "").trim().slice(0, maxLength);

const cleanEmail = (value = "") => cleanText(value, 180).toLowerCase();

const cleanGalleryUrl = (value = "") => {
  const galleryUrl = cleanText(value, 2000);

  if (!galleryUrl) {
    return "";
  }

  try {
    const parsed = new URL(galleryUrl, "https://www.davidesolla.com/");

    if (parsed.protocol !== "https:" || !isAllowedAdobeHost(parsed.hostname)) {
      return "";
    }

    return galleryUrl;
  } catch (error) {
    return "";
  }
};

const isAllowedAdobeHost = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  return host === "adobe.ly" || host === "adobe.com" || host.endsWith(".adobe.com");
};

const hashClientPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `${passwordHashPrefix}:${salt}:${hash}`;
};

const compareHex = (left, right) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyClientPassword = (client, password) => {
  const storedHash = cleanText(client?.passwordHash, 240);

  if (storedHash.startsWith(`${passwordHashPrefix}:`)) {
    const [, salt, expectedHash] = storedHash.split(":");

    if (!salt || !expectedHash) {
      return false;
    }

    const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
    return compareHex(hash, expectedHash);
  }

  if (client?.password) {
    return client.password === password;
  }

  return false;
};

const normaliseClient = (client = {}, index) => {
  const typedPassword = typeof client.password === "string" ? client.password : "";

  if (typedPassword.length > 256) {
    const error = new Error("Client passwords must be 256 characters or fewer");
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = typedPassword ? hashClientPassword(typedPassword) : cleanText(client.passwordHash, 240);
  const fallbackId = client.email || client.name || `client-${index + 1}`;

  return {
    id: slugify(client.id || fallbackId),
    name: cleanText(client.name || client.email || `Client ${index + 1}`, 140),
    email: cleanEmail(client.email),
    passwordHash,
    lightroomUrl: cleanGalleryUrl(client.lightroomUrl),
    updatedAt: new Date().toISOString()
  };
};

const normaliseClients = (clients) => Array.isArray(clients)
  ? clients.map(normaliseClient).filter((client) => client.name || client.email || client.lightroomUrl)
  : [];

const publicClient = (client, gallery = {}) => ({
  name: client.name || "Client",
  email: client.email || "",
  lightroomUrl: gallery.lightroomUrl || client.lightroomUrl || "",
  galleryTitle: gallery.albumTitle || "",
  images: Array.isArray(gallery.images) ? gallery.images : [],
  embedError: gallery.error || ""
});

const detectImageType = (buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp" && /^(avif|avis)$/.test(buffer.toString("ascii", 8, 12))) {
    return { extension: ".avif", mimeType: "image/avif" };
  }
  return null;
};

const prepareUpload = (file) => {
  if (!file || !file.buffer?.length) {
    const error = new Error("No image file was uploaded");
    error.statusCode = 400;
    throw error;
  }

  const detectedType = detectImageType(file.buffer);

  if (!detectedType) {
    const error = new Error("Only image uploads are supported");
    error.statusCode = 400;
    throw error;
  }

  const safeName = `${slugify(file.filename || "image")}-${crypto.randomBytes(4).toString("hex")}${detectedType.extension}`;
  const date = new Date().toISOString().slice(0, 10);
  const uploadPath = `assets/images/uploads/${date}/${safeName}`;

  return {
    content: file.buffer,
    path: uploadPath
  };
};

const uploadImage = async (file) => {
  const upload = prepareUpload(file);
  const config = repoConfig();

  if (config.token) {
    await writeGithubFile(upload.path, upload.content, `Upload portfolio image ${path.basename(upload.path)}`);
    return upload.path;
  }

  const fullPath = path.join(rootDir, upload.path);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, upload.content);
  return upload.path;
};

const uploadImages = async (files, message = "Upload portfolio images") => {
  const uploads = files.map(prepareUpload);
  const config = repoConfig();

  if (config.token) {
    await writeGithubFiles(uploads, message);
    return uploads.map((upload) => upload.path);
  }

  await Promise.all(uploads.map(async (upload) => {
    const fullPath = path.join(rootDir, upload.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, upload.content);
  }));

  return uploads.map((upload) => upload.path);
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

  if (url.protocol !== "https:" || !isAllowedAdobeHost(url.hostname)) {
    const invalid = new Error("Enter an Adobe Lightroom shared gallery URL");
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

  const renditionUrl = new URL(rendition.href, base);
  renditionUrl.searchParams.set("api_key", lightroomApiKey);
  return renditionUrl.toString();
};

const getLightroomGalleryAssets = async (shareUrl) => {
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
  const images = [];

  for (const [index, resource] of (assetsResponse.resources || []).entries()) {
    const asset = resource.asset;

    if (!asset || asset.subtype !== "image") {
      continue;
    }

    const renditionUrl = lightroomRenditionUrl(base, asset);

    if (!renditionUrl) {
      continue;
    }

    images.push({
      src: renditionUrl,
      alt: `${albumName} ${images.length + 1}`,
      lightroomAssetId: asset.id || imageFilenameFromAsset(asset, index)
    });
  }

  if (!images.length) {
    const error = new Error("No Lightroom images were found");
    error.statusCode = 400;
    throw error;
  }

  return {
    albumTitle: albumName,
    images,
    lightroomUrl: share.shareUrl
  };
};

const mapWithConcurrency = async (items, concurrency, callback) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const importLightroomGallery = async (shareUrl) => {
  const gallery = await getLightroomGalleryAssets(shareUrl);
  const downloads = await mapWithConcurrency(gallery.images, 4, async (image, index) => {
    const renditionUrl = image.src;

    const response = await fetch(renditionUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    if (!response.ok || !mimeType.startsWith("image/") || !buffer.length) {
      return null;
    }

    return {
      alt: image.alt || `${gallery.albumTitle} ${index + 1}`,
      file: {
        filename: `${slugify(image.alt || `lightroom-${index + 1}`)}.jpg`,
        mimeType,
        buffer,
        size: buffer.length
      },
      lightroomAssetId: image.lightroomAssetId
    };
  });
  const downloadable = downloads.filter(Boolean);

  if (!downloadable.length) {
    const error = new Error("No downloadable Lightroom images were found");
    error.statusCode = 400;
    throw error;
  }

  const paths = await uploadImages(
    downloadable.map((download) => download.file),
    `Import Lightroom gallery ${gallery.albumTitle}`
  );
  const imported = paths.map((src, index) => ({
    src,
    alt: downloadable[index].alt,
    previewPosition: "50% 50%",
    lightroomAssetId: downloadable[index].lightroomAssetId
  }));

  return {
    albumTitle: gallery.albumTitle,
    imported,
    lightroomUrl: gallery.lightroomUrl
  };
};

const normaliseSiteData = (siteData) => ({
  ...siteData,
  version: siteData.version || 1,
  updatedAt: new Date().toISOString(),
  albums: Array.isArray(siteData.albums) ? siteData.albums : [],
  clients: normaliseClients(siteData.clients)
});

const handleClientRequest = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const action = requestUrl.searchParams.get("action") || "login";

    if (req.method === "POST" && action === "login") {
      const body = await readRequestJson(req);
      const email = cleanEmail(body.email);
      const password = String(body.password || "");

      if (!email || !password || password.length > 256) {
        const error = new Error("Enter your email address and password.");
        error.statusCode = 400;
        throw error;
      }

      const loginScope = `client-login:${crypto.createHash("sha256").update(email).digest("hex")}`;
      const attempt = rateLimitRequest(req, loginScope, { limit: 8, windowMs: 15 * 60 * 1000 });

      if (!attempt.allowed) {
        const error = new Error("Too many login attempts. Please try again later.");
        error.statusCode = 429;
        error.retryAfter = attempt.retryAfter;
        throw error;
      }

      const siteData = await readSiteData();
      const clients = normaliseClients(siteData.clients);
      const client = clients.find((item) => item.email === email);

      if (!client || !verifyClientPassword(client, password)) {
        const error = new Error("Email or password was not recognised.");
        error.statusCode = 401;
        throw error;
      }

      clearRateLimit(req, loginScope);

      if (!client.lightroomUrl) {
        const error = new Error("This client gallery has not been assigned yet.");
        error.statusCode = 404;
        throw error;
      }

      let gallery = {};

      try {
        gallery = await getLightroomGalleryAssets(client.lightroomUrl);
      } catch (error) {
        gallery = {
          error: "The embedded preview could not be loaded, but the Lightroom download link is available."
        };
      }

      jsonResponse(res, 200, { ok: true, client: publicClient(client, gallery) });
      return;
    }

    jsonResponse(res, 404, { error: "Unknown client action" });
  } catch (error) {
    if (error.retryAfter) res.setHeader("retry-after", String(error.retryAfter));
    jsonResponse(res, error.statusCode || 500, { error: error.message || "Client request failed" });
  }
};

const handleAdminRequest = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const action = requestUrl.searchParams.get("action") || "site";

    if (req.method === "POST" && action === "login") {
      const attempt = rateLimitRequest(req, "admin-auth", { limit: 10, windowMs: 15 * 60 * 1000 });

      if (!attempt.allowed) {
        const error = new Error("Too many login attempts. Please try again later.");
        error.statusCode = 429;
        error.retryAfter = attempt.retryAfter;
        throw error;
      }

      const body = await readRequestJson(req);
      const { password } = requireAdminConfiguration();

      if (!timingSafeStringEqual(body.password, password)) {
        const error = new Error("Invalid admin password");
        error.statusCode = 401;
        throw error;
      }

      clearRateLimit(req, "admin-auth");
      jsonResponse(res, 200, { ok: true, token: createAdminToken() });
      return;
    }

    requireAdmin(req);

    if (req.method === "GET" && action === "site") {
      jsonResponse(res, 200, { site: await readSiteData() });
      return;
    }

    if (req.method === "GET" && action === "newsletterIssues") {
      jsonResponse(res, 200, { issues: await listNewsletterIssues() });
      return;
    }

    if (req.method === "GET" && action === "newsletterIssue") {
      const issueId = requestUrl.searchParams.get("issueId") || "";
      const issue = await readNewsletterIssue(issueId);
      const validation = validateIssue(issue, await readNewsletterManifest(issueId));
      jsonResponse(res, 200, { issue, validation });
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

    if (req.method === "POST" && action === "newsletterIssue") {
      const issueId = requestUrl.searchParams.get("issueId") || "";
      const body = await readRequestJson(req);
      const result = await writeNewsletterIssue(issueId, body.issue || body);
      const validation = validateIssue(result.issue, await readNewsletterManifest(issueId));
      jsonResponse(res, 200, { ok: true, ...result, validation });
      return;
    }

    if (req.method === "POST" && action === "newsletterBuild") {
      const issueId = requestUrl.searchParams.get("issueId") || "";
      const result = await buildNewsletterIssue(issueId);
      jsonResponse(res, 200, { ok: true, ...result });
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
    if (error.retryAfter) res.setHeader("retry-after", String(error.retryAfter));
    jsonResponse(res, error.statusCode || 500, { error: error.message || "Admin request failed" });
  }
};

module.exports = {
  decryptAdminData,
  encryptAdminData,
  handleAdminRequest,
  handleClientRequest
};
