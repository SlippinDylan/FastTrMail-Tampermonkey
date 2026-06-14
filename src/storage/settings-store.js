function assertConfig(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSettingsStore({ tmApi, defaults, languages, providers }) {
  assertConfig(tmApi && typeof tmApi.getValue === "function", "tmApi.getValue must be a function");
  assertConfig(tmApi && typeof tmApi.setValue === "function", "tmApi.setValue must be a function");
  assertConfig(defaults && typeof defaults.targetLanguage === "string", "defaults.targetLanguage must be a string");
  assertConfig(defaults && typeof defaults.preferredProvider === "string", "defaults.preferredProvider must be a string");
  assertConfig(Array.isArray(languages) && languages.length > 0, "languages must be a non-empty array");
  assertConfig(Array.isArray(providers) && providers.length > 0, "providers must be a non-empty array");

  const supportedLanguages = new Set(languages.map((language) => language.id));
  const supportedProviders = new Set(providers.map((provider) => provider.id));
  assertConfig(supportedLanguages.has(defaults.targetLanguage), "defaults.targetLanguage must exist in languages");
  assertConfig(supportedProviders.has(defaults.preferredProvider), "defaults.preferredProvider must exist in providers");

  function normalizeTargetLanguage(value) {
    return supportedLanguages.has(value) ? value : defaults.targetLanguage;
  }

  function normalizePreferredProvider(value) {
    return supportedProviders.has(value) ? value : defaults.preferredProvider;
  }

  async function getNormalizedValue(key, fallback, normalize) {
    const value = await tmApi.getValue(key, fallback);
    const normalizedValue = normalize(value);

    if (normalizedValue !== value) {
      await tmApi.setValue(key, normalizedValue);
    }

    return normalizedValue;
  }

  async function setNormalizedValue(key, value, normalize) {
    const normalizedValue = normalize(value);
    await tmApi.setValue(key, normalizedValue);
    return normalizedValue;
  }

  return {
    async getTargetLanguage() {
      return getNormalizedValue("targetLanguage", defaults.targetLanguage, normalizeTargetLanguage);
    },
    async setTargetLanguage(value) {
      return setNormalizedValue("targetLanguage", value, normalizeTargetLanguage);
    },
    async getPreferredProvider() {
      return getNormalizedValue("preferredProvider", defaults.preferredProvider, normalizePreferredProvider);
    },
    async setPreferredProvider(value) {
      return setNormalizedValue("preferredProvider", value, normalizePreferredProvider);
    },
    async getSettings() {
      const [targetLanguage, preferredProvider] = await Promise.all([
        getNormalizedValue("targetLanguage", defaults.targetLanguage, normalizeTargetLanguage),
        getNormalizedValue("preferredProvider", defaults.preferredProvider, normalizePreferredProvider)
      ]);

      return { targetLanguage, preferredProvider };
    },
    async setSettings(nextSettings) {
      const targetLanguage = await setNormalizedValue(
        "targetLanguage",
        nextSettings?.targetLanguage,
        normalizeTargetLanguage
      );
      const preferredProvider = await setNormalizedValue(
        "preferredProvider",
        nextSettings?.preferredProvider,
        normalizePreferredProvider
      );

      return { targetLanguage, preferredProvider };
    }
  };
}

module.exports = { createSettingsStore };
