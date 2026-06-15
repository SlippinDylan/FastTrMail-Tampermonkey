const {
  ERROR_CODES,
  attachAbort,
  createError,
  normalizeError
} = require("../core/errors.js");
const { createNoopDiagnostics } = require("../diagnostics/diagnostics.js");

const MAX_SEGMENTS_PER_EDGE_BATCH = 20;
const MAX_CHARS_PER_EDGE_SEGMENT = 10000;
const MAX_CHARS_PER_EDGE_BATCH = 20000;

function createSegmentBatches(segments) {
  const batches = [];
  let currentBatch = [];
  let currentBatchChars = 0;

  segments.forEach((text, segmentIndex) => {
    const segmentLength = String(text || "").length;
    if (segmentLength > MAX_CHARS_PER_EDGE_SEGMENT) {
      throw createError(
        ERROR_CODES.EDGE_TRANSLATE_FAILED,
        "Edge translate segment was too long.",
        {
          reason: "edge-segment-too-long",
          segmentIndex,
          segmentLength,
          maxSegmentLength: MAX_CHARS_PER_EDGE_SEGMENT
        }
      );
    }

    const wouldExceedSegmentCount = currentBatch.length >= MAX_SEGMENTS_PER_EDGE_BATCH;
    const wouldExceedCharBudget = currentBatch.length > 0 &&
      currentBatchChars + segmentLength > MAX_CHARS_PER_EDGE_BATCH;
    if (wouldExceedSegmentCount || wouldExceedCharBudget) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchChars = 0;
    }

    currentBatch.push(text);
    currentBatchChars += segmentLength;
  });

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

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
        const batches = createSegmentBatches(segments);
        diagnostics.record("edge-translate.request.start", {
          batchCount: batches.length,
          segmentCount: segments.length,
          targetLanguage: language.id
        });
        const tokenRequest = edgeAuth.getToken();
        activeAbort = () => tokenRequest.abort?.();
        const token = await tokenRequest;

        if (wasAborted) {
          throw createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled.");
        }

        const translatedSegments = [];

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          if (wasAborted) {
            throw createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled.");
          }

          const batch = batches[batchIndex];
          const translateRequest = xhr.request({
            method: "POST",
            url: `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(language.microsoft)}`,
            nocache: true,
            timeout: 15000,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            data: JSON.stringify(batch.map((text) => ({ text })))
          });
          activeAbort = () => translateRequest.abort?.();

          if (wasAborted) {
            activeAbort();
          }

          const response = await translateRequest;
          diagnostics.record("edge-translate.response.received", {
            batchIndex,
            status: response?.status || 0,
            responseTextLength: String(response?.responseText || "").length
          });

          let payload = null;

          try {
            payload = JSON.parse(response?.responseText || "[]");
          } catch (error) {
            throw createError(
              ERROR_CODES.EDGE_TRANSLATE_FAILED,
              "Edge translate response was invalid.",
              { batchIndex },
              error
            );
          }

          const batchTranslations = Array.isArray(payload)
            ? payload.map((item) => getTranslatedText(item))
            : [];
          diagnostics.record("edge-translate.response.parsed", {
            batchIndex,
            translatedSegmentCount: batchTranslations.length
          });

          if (batchTranslations.length !== batch.length) {
            throw createError(
              ERROR_CODES.EDGE_TRANSLATE_FAILED,
              "Edge translated segment count mismatch.",
              {
                batchIndex,
                expectedSegmentCount: batch.length,
                actualSegmentCount: batchTranslations.length
              }
            );
          }

          translatedSegments.push(...batchTranslations);
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
