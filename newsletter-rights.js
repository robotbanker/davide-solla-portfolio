(function exposeNewsletterRights(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.NewsletterRights = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const canonicalSiteBaseUrl = "https://www.davidesolla.com";

  const absoluteAssetUrl = (src) => {
    try {
      const url = new URL(String(src || ""), `${canonicalSiteBaseUrl}/`);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
  };

  const absoluteSourceUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
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

  const imageSource = (slotDefinition) => {
    const { image, officialSourceUrl, credit } = slotDefinition || {};
    return {
      assetUrl: absoluteAssetUrl(image?.src),
      credit: String(credit || image?.credit || image?.label || "Official source").trim(),
      sourceUrl: absoluteSourceUrl(officialSourceUrl)
    };
  };

  return {
    canonicalSiteBaseUrl,
    imageSource,
    renderedImageSlots,
    rotatingImageForIssue
  };
}));
