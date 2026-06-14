const {
  ERROR_CODES,
  attachAbort,
  createError,
  normalizeError
} = require("../core/errors.js");
const { createNoopDiagnostics } = require("../diagnostics/diagnostics.js");

const SEGMENT_CONCURRENCY = 4;
const HTML_ENTITIES = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'"
});

function decodeHtmlEntities(value) {
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const digits = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return HTML_ENTITIES[entity.toLowerCase()] || match;
  });
}

function extractTranslatedText(payload) {
  const translatedText = Array.isArray(payload?.[0])
    ? payload[0]
        .map((item) => (Array.isArray(item) && typeof item[0] === "string" ? item[0] : ""))
        .join("")
        .trim()
    : "";

  if (!translatedText) {
    throw createError(ERROR_CODES.GOOGLE_TRANSLATE_FAILED, "Google translate response was invalid.");
  }

  return decodeHtmlEntities(translatedText);
}

function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  return Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  ).then(() => results);
}

function createGoogleWebTranslator({ xhr, diagnostics = createNoopDiagnostics() }) {
  return {
    translateSegments(segments, language) {
      let wasAborted = false;
      const activeRequests = new Set();
      const operation = (async () => {
        diagnostics.record("google-translate.request.start", {
          segmentCount: segments.length,
          targetLanguage: language.id
        });

        const translatedSegments = await mapWithConcurrency(
          segments,
          SEGMENT_CONCURRENCY,
          async (segment) => {
            if (wasAborted) {
              throw createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled.");
            }

            const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
            endpoint.searchParams.set("client", "gtx");
            endpoint.searchParams.set("sl", "auto");
            endpoint.searchParams.set("tl", language.google || language.id);
            endpoint.searchParams.set("dt", "t");
            endpoint.searchParams.set("q", segment);

            const request = xhr.request({
              method: "GET",
              url: endpoint.toString(),
              nocache: true,
              timeout: 15000
            });
            activeRequests.add(request);

            try {
              const response = await request;
              diagnostics.record("google-translate.response.received", {
                status: response?.status || 0,
                responseTextLength: String(response?.responseText || "").length
              });

              let payload = null;
              try {
                payload = JSON.parse(response?.responseText || "null");
              } catch (error) {
                throw createError(ERROR_CODES.GOOGLE_TRANSLATE_FAILED, "Google translate response was invalid.", {}, error);
              }

              return extractTranslatedText(payload);
            } finally {
              activeRequests.delete(request);
            }
          }
        );

        diagnostics.record("google-translate.response.parsed", {
          translatedSegmentCount: translatedSegments.length
        });

        if (translatedSegments.length !== segments.length) {
          throw createError(ERROR_CODES.GOOGLE_TRANSLATE_FAILED, "Google translated segment count mismatch.");
        }

        return {
          provider: "google-web",
          providerLabel: "Google Web（实验性 / 免费）",
          targetLanguage: language.id,
          targetLanguageLabel: language.label,
          translatedSegments
        };
      })().catch((error) => {
        diagnostics.recordError("google-translate.request.error", error, {
          requestStage: "google-translate",
          segmentCount: segments.length
        });
        throw normalizeError(
          ERROR_CODES.GOOGLE_TRANSLATE_FAILED,
          "Google translate request failed.",
          error,
          {
            requestStage: "google-translate",
            segmentCount: segments.length
          }
        );
      });

      return attachAbort(operation, () => {
        wasAborted = true;
        for (const request of Array.from(activeRequests)) {
          request.abort?.();
        }
      });
    }
  };
}

module.exports = { createGoogleWebTranslator };
