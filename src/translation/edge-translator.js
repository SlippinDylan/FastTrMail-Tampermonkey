const {
  ERROR_CODES,
  attachAbort,
  createError,
  normalizeError
} = require("../core/errors.js");
const { createNoopDiagnostics } = require("../diagnostics/diagnostics.js");

function createEdgeTranslator({ edgeAuth, xhr, diagnostics = createNoopDiagnostics() }) {
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
        diagnostics.record("edge-translate.request.start", {
          segmentCount: segments.length,
          targetLanguage: language.id
        });
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
        diagnostics.record("edge-translate.response.received", {
          status: response?.status || 0,
          responseTextLength: String(response?.responseText || "").length
        });

        let payload = null;

        try {
          payload = JSON.parse(response?.responseText || "[]");
        } catch (error) {
          throw createError(ERROR_CODES.EDGE_TRANSLATE_FAILED, "Edge translate response was invalid.", {}, error);
        }

        const translatedSegments = Array.isArray(payload)
          ? payload.map((item) => getTranslatedText(item))
          : [];
        diagnostics.record("edge-translate.response.parsed", {
          translatedSegmentCount: translatedSegments.length
        });

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
        diagnostics.recordError("edge-translate.request.error", error, {
          requestStage: "edge-translate",
          segmentCount: segments.length
        });
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
