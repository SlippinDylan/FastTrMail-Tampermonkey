const {
  ERROR_CODES,
  attachAbort,
  createError
} = require("../core/errors.js");
const { createNoopDiagnostics } = require("../diagnostics/diagnostics.js");

function createTranslateService({
  diagnostics = createNoopDiagnostics(),
  edgeTranslator,
  languages,
  providers,
  translators
}) {
  const translatorMap = translators || {
    "edge-web": edgeTranslator
  };
  const providerIds = Array.isArray(providers) && providers.length > 0
    ? providers.map((provider) => provider.id)
    : Object.keys(translatorMap);

  function getProviderOrder(preferredProvider) {
    const primaryProvider = providerIds.includes(preferredProvider) ? preferredProvider : providerIds[0];
    return [
      primaryProvider,
      ...providerIds.filter((providerId) => providerId !== primaryProvider)
    ];
  }

  function isRecoverableProviderError(error) {
    return error?.code === ERROR_CODES.EDGE_AUTH_FAILED ||
      error?.code === ERROR_CODES.EDGE_TRANSLATE_FAILED ||
      error?.code === ERROR_CODES.GOOGLE_TRANSLATE_FAILED;
  }

  return {
    getLanguageDefinition(languageId) {
      const language = languages.find((item) => item.id === languageId) || null;

      if (!language) {
        throw createError(
          ERROR_CODES.UNSUPPORTED_TARGET_LANGUAGE,
          "Unsupported target language."
        );
      }

      return language;
    },
    translateSegments(segments, language, options = {}) {
      const normalizedSegments = segments
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);

      let activeAbort = () => {};
      let wasAborted = false;
      const operation = (async () => {
        let lastError = null;
        const providerOrder = getProviderOrder(options.preferredProvider);

        for (let index = 0; index < providerOrder.length; index += 1) {
          if (wasAborted) {
            throw createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled.");
          }

          const providerId = providerOrder[index];
          const translator = translatorMap[providerId];
          if (!translator || typeof translator.translateSegments !== "function") {
            continue;
          }

          const request = translator.translateSegments(normalizedSegments, language);
          activeAbort = () => request.abort?.();

          try {
            return await request;
          } catch (error) {
            lastError = error;
            const fallbackProviderId = providerOrder[index + 1];
            if (!fallbackProviderId || !isRecoverableProviderError(error)) {
              throw error;
            }

            diagnostics.record("translate-service.provider.fallback", {
              fromProvider: providerId,
              toProvider: fallbackProviderId,
              errorCode: error.code || ""
            });
          }
        }

        throw lastError || createError(ERROR_CODES.EDGE_TRANSLATE_FAILED, "No translator provider was available.");
      })();

      return attachAbort(operation, () => {
        wasAborted = true;
        activeAbort();
      });
    }
  };
}

module.exports = { createTranslateService };
