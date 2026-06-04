const { ERROR_CODES, createError } = require("../core/errors.js");

function createTranslateService({ edgeTranslator, languages }) {
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
    translateSegments(segments, language) {
      const normalizedSegments = segments
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);

      return edgeTranslator.translateSegments(normalizedSegments, language);
    }
  };
}

module.exports = { createTranslateService };
