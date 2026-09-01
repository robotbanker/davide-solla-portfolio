const fs = require("fs");
const path = require("path");
const { renderHomepage } = require("../lib/homepage");

const rootDir = path.resolve(__dirname, "..");
const homepagePath = path.join(rootDir, "index.html");
fs.writeFileSync(homepagePath, renderHomepage(), "utf8");
console.log("Built index.html from the public portfolio data.");
