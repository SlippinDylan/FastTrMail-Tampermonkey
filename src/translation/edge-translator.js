const {
  ERROR_CODES,
  attachAbort,
  createError,
  normalizeError
} = require("../core/errors.js");

function createEdgeTranslator({ edgeAuth, xhr }) {
  function getTranslatedText(item) {
    const text = item?.translations?.[0]?.text;

    if (typeof text !== "string") {
      throw createError(ERROR_CODES.EDGE_TRANSLATE_FAILED, "Edge translate response was invalid.");
    }

    return text;
  }

  return {
    translateSegments(segments, language) {
      let activeAbort = () => {};
      let wasAborted = false;
      const operation = (async () => {
        const tokenRequest = edgeAuth.getToken();
        activeAbort = () => tokenRequest.abort?.();
        const token = await tokenRequest;

        if (wasAborted) {
          throw createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled.");
        }

        const translateRequest = xhr.request({
          method: "POST",
          url: `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(language.microsoft)}`,
          nocache: true,
          timeout: 15000,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          data: JSON.stringify(segments.map((text) => ({ text })))
        });
        activeAbort = () => translateRequest.abort?.();

        if (wasAborted) {
          activeAbort();
        }

        const response = await translateRequest;

        let payload = null;

        try {
          payload = JSON.parse(response?.responseText || "[]");
        } catch (error) {
          throw createError(ERROR_CODES.EDGE_TRANSLATE_FAILED, "Edge translate response was invalid.", {}, error);
        }

        const translatedSegments = Array.isArray(payload)
          ? payload.map((item) => getTranslatedText(item))
          : [];

        if (translatedSegments.length !== segments.length) {
          throw createError(
            ERROR_CODES.EDGE_TRANSLATE_FAILED,
            "Edge translated segment count mismatch."
          );
        }

        return {
          provider: "edge-web",
          providerLabel: "Microsoft Edge（免 Key）",
          targetLanguage: language.id,
          targetLanguageLabel: language.label,
          translatedSegments
        };
      })().catch((error) => {
        throw normalizeError(
          ERROR_CODES.EDGE_TRANSLATE_FAILED,
          "Edge translate request failed.",
          error,
          {
            requestStage: "edge-translate",
            segmentCount: segments.length
          }
        );
      });

      return attachAbort(operation, () => {
        wasAborted = true;
        activeAbort();
      });
    }
  };
}

module.exports = { createEdgeTranslator };
