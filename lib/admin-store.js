const Busboy = require("busboy");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dataFile = "data/site.json";
const maxUploadBytes = 25 * 1024 * 1024;

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

const readSiteData = async () => {
  const config = repoConfig();

  if (config.token) {
    const file = await readGithubFile(dataFile);
    return JSON.parse(file.content);
  }

  const file = await fs.readFile(path.join(rootDir, dataFile), "utf8");
  return JSON.parse(file);
};

const writeSiteData = async (siteData) => {
  const content = `${JSON.stringify(siteData, null, 2)}\n`;
  const config = repoConfig();

  if (config.token) {
    await writeGithubFile(dataFile, content, "Update portfolio content from admin");
    return;
  }

  await fs.mkdir(path.dirname(path.join(rootDir, dataFile)), { recursive: true });
  await fs.writeFile(path.join(rootDir, dataFile), content);
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
      jsonResponse(res, 200, { ok: true, site });
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

    jsonResponse(res, 404, { error: "Unknown admin action" });
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, { error: error.message || "Admin request failed" });
  }
};

module.exports = {
  handleAdminRequest
};
