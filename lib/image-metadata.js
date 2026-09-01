const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dimensionCache = new Map();
const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf
]);

const localImagePath = (src = "") => {
  const value = String(src || "").replace(/^\/+/, "");
  if (!/^assets\/images\/[a-z0-9_./-]+\.jpe?g$/i.test(value)) return "";
  const filePath = path.resolve(rootDir, value);
  const imageRoot = path.join(rootDir, "assets", "images");
  if (!filePath.startsWith(`${imageRoot}${path.sep}`)) return "";
  return filePath;
};

const jpegDimensions = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (jpegStartOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }

  return null;
};

const dimensionsForImage = (src = "") => {
  const key = String(src || "");
  if (dimensionCache.has(key)) return dimensionCache.get(key);

  const filePath = localImagePath(key);
  let dimensions = null;
  try {
    dimensions = filePath ? jpegDimensions(fs.readFileSync(filePath)) : null;
  } catch {
    dimensions = null;
  }
  dimensionCache.set(key, dimensions);
  return dimensions;
};

module.exports = {
  dimensionsForImage,
  jpegDimensions,
  localImagePath
};
