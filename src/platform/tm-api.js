const REQUIRED_CAPABILITIES = Object.freeze([
  "GM_getValue",
  "GM_setValue",
  "GM_registerMenuCommand",
  "GM_xmlhttpRequest"
]);

function validateCapability(scope, capability) {
  if (typeof scope?.[capability] !== "function") {
    throw new Error(`Missing Tampermonkey capability: ${capability}`);
  }
}

function createTmApi(scope = globalThis) {
  for (const capability of REQUIRED_CAPABILITIES) {
    validateCapability(scope, capability);
  }

  return {
    getValue(key, fallback) {
      return scope.GM_getValue(key, fallback);
    },
    setValue(key, value) {
      return scope.GM_setValue(key, value);
    },
    registerMenuCommand(label, handler) {
      return scope.GM_registerMenuCommand(label, handler);
    },
    xmlHttpRequest(details) {
      return scope.GM_xmlhttpRequest(details);
    }
  };
}

module.exports = { createTmApi };
