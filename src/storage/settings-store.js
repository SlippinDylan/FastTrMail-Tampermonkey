function assertConfig(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSettingsStore({ tmApi, defaults, languages }) {
  assertConfig(tmApi && typeof tmApi.getValue === "function", "tmApi.getValue must be a function");
  assertConfig(tmApi && typeof tmApi.setValue === "function", "tmApi.setValue must be a function");
  assertConfig(defaults && typeof defaults.targetLanguage === "string", "defaults.targetLanguage must be a string");
  assertConfig(Array.isArray(languages) && languages.length > 0, "languages must be a non-empty array");

  const supportedLanguages = new Set(languages.map((language) => language.id));
  assertConfig(supportedLanguages.has(defaults.targetLanguage), "defaults.targetLanguage must exist in languages");

  function normalizeTargetLanguage(value) {
    return supportedLanguages.has(value) ? value : defaults.targetLanguage;
  }

  return {
    async getTargetLanguage() {
      const value = await tmApi.getValue("targetLanguage", defaults.targetLanguage);
      const normalizedValue = normalizeTargetLanguage(value);

      if (normalizedValue !== value) {
        await tmApi.setValue("targetLanguage", normalizedValue);
      }

      return normalizedValue;
    },
    async setTargetLanguage(value) {
      const normalizedValue = normalizeTargetLanguage(value);
      await tmApi.setValue("targetLanguage", normalizedValue);
      return normalizedValue;
    }
  };
}

module.exports = { createSettingsStore };
