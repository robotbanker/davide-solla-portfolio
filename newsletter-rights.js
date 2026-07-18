(function exposeNewsletterRights(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.NewsletterRights = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const canonicalSiteBaseUrl = "https://www.davidesolla.com";
  const allowedBases = new Set(["studio-owned", "written-permission", "licensed", "public-domain"]);
  const allowedClearance = new Set(["confirmed", "not-required"]);

  const stripTrailingSlash = (value = "") => String(value).replace(/\/+$/, "");

  const absoluteAssetUrl = (src) => {
    try {
      const url = new URL(String(src || ""), `${canonicalSiteBaseUrl}/`);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };

  const isUsableUrl = (value) => {
    try {
      return ["http:", "https:"].includes(new URL(String(value || "")).protocol);
    } catch {
      return false;
    }
  };

  const isOpaqueEvidenceRef = (value) => {
    const reference = String(value || "").trim();
    return reference.length >= 3
      && reference.length <= 180
      && !/^https?:\/\//i.test(reference)
      && !/\s/.test(reference);
  };

  const rotatingImageForIssue = (issue, field) => {
    if (field?.image?.src) return field.image;
    const pool = field?.imageRotation?.pool || [];
    if (!pool.length) return field?.image;

    const year = Number(String(issue.issueId || "").match(/(\d{4})-\d{2}/)?.[1] || issue.year || 0);
    const month = Number(String(issue.issueId || "").match(/\d{4}-(\d{2})/)?.[1] || 1);
    return pool[Math.abs((year * 12) + month - 1) % pool.length];
  };

  const renderedImageSlots = (issue) => {
    const feature = issue.sections?.art?.featured;
    const stories = issue.sections?.fashion?.stories || [];
    const field = issue.sections?.onTheField;
    const slots = [];

    if (feature) {
      slots.push({
        slot: "art.featured",
        image: feature.image,
        officialSourceUrl: feature.sourceUrl,
        credit: feature.image?.credit || feature.image?.label || feature.image?.recommendedSize || ""
      });
    }

    stories.forEach((story, index) => {
      slots.push({
        slot: `fashion.stories.${index}`,
        image: story.image,
        officialSourceUrl: story.sourceUrl,
        credit: story.imageCredit || ""
      });
    });

    if (field) {
      const image = rotatingImageForIssue(issue, field);
      slots.push({
        slot: "onTheField",
        image,
        officialSourceUrl: field.cta?.url || issue.site?.websiteUrl,
        credit: image?.credit || image?.label || image?.recommendedSize || ""
      });
    }

    return slots;
  };

  const imageApproval = (issue, manifest, slotDefinition, requiredScopes = ["public-web"]) => {
    const fail = (reason) => ({ approved: false, reason });
    const { slot, image, officialSourceUrl, credit } = slotDefinition || {};

    if (stripTrailingSlash(issue?.site?.baseUrl) !== canonicalSiteBaseUrl) return fail("non-canonical site URL");
    if (issue?.status !== "research-approved" || issue?.research?.validationStatus !== "research-approved") {
      return fail("research is not approved");
    }
    if (Number(manifest?.schemaVersion) !== 2 || manifest?.status !== "research-approved") {
      return fail("rights manifest is not approved");
    }
    if (String(manifest?.issueId || "") !== String(issue?.issueId || "")) return fail("manifest issue mismatch");

    const assetId = String(image?.assetId || "").trim();
    const sourceId = String(image?.sourceId || "").trim();
    const assetUrl = absoluteAssetUrl(image?.src);
    if (!assetId || !sourceId || !assetUrl) return fail("incomplete image identity");

    const matches = (manifest.imageRights || []).filter((record) => record?.assetId === assetId);
    if (matches.length !== 1) return fail("rights record is missing or duplicated");
    const record = matches[0];

    if (record.slot !== slot || record.sourceId !== sourceId) return fail("rights record does not match the slot");
    if (absoluteAssetUrl(record.assetUrl) !== assetUrl) return fail("rights record does not match the asset");
    if (record.decision !== "approved" || !allowedBases.has(record.basis)) return fail("publication rights are pending");
    if (!requiredScopes.every((scope) => Array.isArray(record.scopes) && record.scopes.includes(scope))) {
      return fail("publication scope is not approved");
    }
    if (!String(credit || "").trim() || String(record.credit || "").trim() !== String(credit).trim()) {
      return fail("approved credit does not match the page");
    }
    if (!isOpaqueEvidenceRef(record.evidenceRef) || !String(record.approvedBy || "").trim()) {
      return fail("approval evidence is incomplete");
    }
    if (!record.approvedOn || Number.isNaN(Date.parse(record.approvedOn))) return fail("approval date is invalid");
    if (!allowedClearance.has(record.thirdPartyClearance)) return fail("third-party clearance is incomplete");
    if (record.expiresOn && (Number.isNaN(Date.parse(record.expiresOn)) || Date.parse(record.expiresOn) < Date.now())) {
      return fail("rights approval has expired");
    }

    const canonicalOrigin = new URL(canonicalSiteBaseUrl).origin;
    if (new URL(assetUrl).origin !== canonicalOrigin) {
      const sourceMatches = (manifest.sources || []).filter((source) => source?.sourceId === sourceId);
      if (sourceMatches.length !== 1
        || !isUsableUrl(sourceMatches[0].officialSourceUrl)
        || sourceMatches[0].officialSourceUrl !== officialSourceUrl) {
        return fail("official source does not match the story");
      }
    }

    return { approved: true, assetUrl, credit: String(record.credit).trim(), record };
  };

  const issueReadyForScopes = (issue, manifest, requiredScopes) => {
    const approvals = renderedImageSlots(issue).map((slot) => imageApproval(issue, manifest, slot, requiredScopes));
    return approvals.length > 0 && approvals.every((approval) => approval.approved);
  };

  return {
    canonicalSiteBaseUrl,
    imageApproval,
    issueReadyForScopes,
    renderedImageSlots,
    rotatingImageForIssue
  };
}));
