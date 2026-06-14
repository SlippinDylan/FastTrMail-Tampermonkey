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

  return {
    async getEnabled() {
      return normalizeEnabled(await tmApi.getValue("diagnosticsEnabled", false));
    },
    async setEnabled(value) {
      const normalizedValue = Boolean(value);
      await tmApi.setValue("diagnosticsEnabled", normalizedValue);
      return normalizedValue;
    },
    async toggleEnabled() {
      const nextValue = !(await this.getEnabled());
      return this.setEnabled(nextValue);
    }
  };
}

module.exports = { createDiagnosticsStore };
