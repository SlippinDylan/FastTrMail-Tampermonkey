function assertConfig(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeEnabled(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function createDiagnosticsStore({ tmApi }) {
  assertConfig(tmApi && typeof tmApi.getValue === "function", "tmApi.getValue must be a function");
  assertConfig(tmApi && typeof tmApi.setValue === "function", "tmApi.setValue must be a function");

  async function getEnabled() {
    return normalizeEnabled(await tmApi.getValue("diagnosticsEnabled", false));
  }

  async function setEnabled(value) {
    const normalizedValue = Boolean(value);
    await tmApi.setValue("diagnosticsEnabled", normalizedValue);
    return normalizedValue;
  }

  async function toggleEnabled() {
    const nextValue = !(await getEnabled());
    return setEnabled(nextValue);
  }

  return {
    getEnabled,
    setEnabled,
    toggleEnabled
  };
}

module.exports = { createDiagnosticsStore };
