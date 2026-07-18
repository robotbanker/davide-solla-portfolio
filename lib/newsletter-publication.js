const { validateIssue } = require("../newsletter/lib/render-email");

const approvedStatus = "research-approved";

const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

const validateNewsletterPublication = (issue, manifest) => {
  if (!isObject(issue)) {
    return {
      errors: ["A public Field Notes issue must be a JSON object."],
      warnings: [],
      images: null
    };
  }

  let validation;
  try {
    validation = validateIssue(issue, isObject(manifest) ? manifest : null, { mode: "live-send" });
  } catch {
    validation = {
      errors: ["The issue structure could not be validated for public Field Notes."],
      warnings: [],
      images: null
    };
  }

  const errors = [...validation.errors];
  if (issue.status !== approvedStatus) {
    errors.push(`Public Field Notes requires issue.status to be ${approvedStatus}.`);
  }
  if (issue.research?.validationStatus !== approvedStatus) {
    errors.push(`Public Field Notes requires issue.research.validationStatus to be ${approvedStatus}.`);
  }
  if (!isObject(manifest) || manifest.status !== approvedStatus) {
    errors.push(`Public Field Notes requires the source manifest status to be ${approvedStatus}.`);
  }

  return { ...validation, errors };
};

const isNewsletterPublicationReady = (issue, manifest) => (
  validateNewsletterPublication(issue, manifest).errors.length === 0
);

module.exports = {
  isNewsletterPublicationReady,
  validateNewsletterPublication
};
