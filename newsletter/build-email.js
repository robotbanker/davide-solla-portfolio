const fs = require("fs");
const path = require("path");
const { loadIssue, loadManifest, renderEmail, validateIssue } = require("./lib/render-email");

const issueId = process.argv[2] || "2026-07";
const strict = process.argv.includes("--strict");
const outputDir = path.join(__dirname, "dist");
const outputPath = path.join(outputDir, `${issueId}.html`);

const issue = loadIssue(issueId);
const manifest = loadManifest(issueId);
const result = validateIssue(issue, manifest, { strict });

result.warnings.forEach((warning) => {
  console.warn(`Newsletter warning: ${warning}`);
});

if (result.errors.length) {
  result.errors.forEach((error) => {
    console.error(`Newsletter error: ${error}`);
  });
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, renderEmail(issue), "utf8");

console.log(`Built newsletter email: ${path.relative(process.cwd(), outputPath)}`);
if (issue.status !== "research-approved") {
  console.log(`Draft status: ${issue.status}. Do not send until source manifest is research-approved.`);
}
