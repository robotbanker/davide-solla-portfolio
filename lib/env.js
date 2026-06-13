const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const parseEnvLine = (line) => {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex < 1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
};

const loadLocalEnv = () => {
  [".env.local", ".env"].forEach((fileName) => {
    const filePath = path.join(rootDir, fileName);

    if (!fs.existsSync(filePath)) {
      return;
    }

    fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
      const entry = parseEnvLine(line);

      if (entry && process.env[entry.key] === undefined) {
        process.env[entry.key] = entry.value;
      }
    });
  });
};

module.exports = {
  loadLocalEnv
};
