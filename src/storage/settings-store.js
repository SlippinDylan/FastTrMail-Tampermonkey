function assertConfig(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createSettingsStore({ tmApi, defaults, languages, providers }) {
  const SETTINGS_KEY = "settings";
  const TARGET_LANGUAGE_KEY = "targetLanguage";
  const PREFERRED_PROVIDER_KEY = "preferredProvider";

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

  function normalizeSettingsSnapshot(value) {
    return {
      targetLanguage: normalizeTargetLanguage(value?.targetLanguage),
      preferredProvider: normalizePreferredProvider(value?.preferredProvider)
    };
  }

  function isSettingsSnapshot(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  async function writeSettingsSnapshot(value) {
    const normalizedValue = normalizeSettingsSnapshot(value);
    await tmApi.setValue(SETTINGS_KEY, normalizedValue);
    return normalizedValue;
  }

  async function readLegacySettingsSnapshot() {
    const [targetLanguage, preferredProvider] = await Promise.all([
      tmApi.getValue(TARGET_LANGUAGE_KEY, defaults.targetLanguage),
      tmApi.getValue(PREFERRED_PROVIDER_KEY, defaults.preferredProvider)
    ]);

    return normalizeSettingsSnapshot({ targetLanguage, preferredProvider });
  }

  async function resolveSettingsSnapshot({ repair }) {
    const storedSnapshot = await tmApi.getValue(SETTINGS_KEY, undefined);
    if (isSettingsSnapshot(storedSnapshot)) {
      const normalizedSnapshot = normalizeSettingsSnapshot(storedSnapshot);
      const needsRepair = (
        normalizedSnapshot.targetLanguage !== storedSnapshot.targetLanguage ||
        normalizedSnapshot.preferredProvider !== storedSnapshot.preferredProvider
      );

      if (repair && needsRepair) {
        await writeSettingsSnapshot(normalizedSnapshot);
      }

      return normalizedSnapshot;
    }

    if (typeof storedSnapshot !== "undefined") {
      const defaultSnapshot = {
        targetLanguage: defaults.targetLanguage,
        preferredProvider: defaults.preferredProvider
      };

      if (repair) {
        await writeSettingsSnapshot(defaultSnapshot);
      }

      return defaultSnapshot;
    }

    const legacySnapshot = await readLegacySettingsSnapshot();

    if (repair) {
      await writeSettingsSnapshot(legacySnapshot);
    }

    return legacySnapshot;
  }

  async function readSettingsSnapshot() {
    return resolveSettingsSnapshot({ repair: true });
  }

  return {
    async getTargetLanguage() {
      return (await readSettingsSnapshot()).targetLanguage;
    },
    async setTargetLanguage(value) {
      const settings = await resolveSettingsSnapshot({ repair: false });
      return (await writeSettingsSnapshot({
        ...settings,
        targetLanguage: value
      })).targetLanguage;
    },
    async getPreferredProvider() {
      return (await readSettingsSnapshot()).preferredProvider;
    },
    async setPreferredProvider(value) {
      const settings = await resolveSettingsSnapshot({ repair: false });
      return (await writeSettingsSnapshot({
        ...settings,
        preferredProvider: value
      })).preferredProvider;
    },
    async getSettings() {
      return readSettingsSnapshot();
    },
    async setSettings(nextSettings) {
      return writeSettingsSnapshot(nextSettings);
    }
  };
}

module.exports = { createSettingsStore };
