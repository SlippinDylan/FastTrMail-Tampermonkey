const FASTMAIL_ORIGIN = "https://app.fastmail.com";

function isFastmailUrl(locationLike) {
  return locationLike?.origin === FASTMAIL_ORIGIN;
}

function getLocationKey(locationLike = globalThis.location) {
  return `${locationLike?.pathname || ""}${locationLike?.search || ""}`;
}

function findPageRoot(element) {
  if (!element || typeof element.closest !== "function") {
    return null;
  }

  return element.closest(".v-Page");
}

function collectPageRoots(root) {
  const pageRoots = new Set();

  if (root?.nodeType === 9 && root.documentElement) {
    root = root.body || root.documentElement;
  }

  if (root instanceof globalThis.HTMLElement && root.matches(".v-Page")) {
    pageRoots.add(root);
  }

  const directRoot = root instanceof globalThis.HTMLElement ? findPageRoot(root) : null;
  if (directRoot) {
    pageRoots.add(directRoot);
  }

  if (root && typeof root.querySelectorAll === "function") {
    root.querySelectorAll(".v-Page").forEach((pageRoot) => {
      if (pageRoot instanceof globalThis.HTMLElement) {
        pageRoots.add(pageRoot);
      }
    });
  }

  return Array.from(pageRoots);
}

module.exports = {
  FASTMAIL_ORIGIN,
  collectPageRoots,
  findPageRoot,
  getLocationKey,
  isFastmailUrl
};
