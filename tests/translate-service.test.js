const test = require("node:test");
const assert = require("node:assert/strict");

const { ERROR_CODES, createError } = require("../src/core/errors.js");
const { createTranslateService } = require("../src/translation/translate-service.js");

const language = { id: "zh-CN", label: "简体中文", microsoft: "zh-Hans", google: "zh-CN" };

function createPendingPromise() {
  let rejectPromise = null;
  const pending = new Promise((_resolve, reject) => {
    rejectPromise = reject;
  });
  pending.abort = () => {
    rejectPromise(createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled."));
  };
  return pending;
}

test("translate service uses the preferred provider first when it succeeds", async () => {
  const calls = [];
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "edge-web" }, { id: "google-web" }],
    translators: {
      "edge-web": {
        translateSegments(segments) {
          calls.push({ provider: "edge-web", segments });
          return Promise.resolve({ provider: "edge-web", translatedSegments: ["第一段"] });
        }
      },
      "google-web": {
        translateSegments() {
          throw new Error("should not call google");
        }
      }
    }
  });

  const result = await service.translateSegments(
    [" one "],
    language,
    { preferredProvider: "edge-web" }
  );

  assert.deepEqual(calls, [{ provider: "edge-web", segments: ["one"] }]);
  assert.equal(result.provider, "edge-web");
  assert.deepEqual(result.translatedSegments, ["第一段"]);
});

test("translate service falls back to the secondary provider when the preferred provider returns a recoverable translate error", async () => {
  const calls = [];
  const diagnosticsEvents = [];
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "edge-web" }, { id: "google-web" }],
    translators: {
      "edge-web": {
        translateSegments() {
          calls.push("edge-web");
          return Promise.reject(createError(ERROR_CODES.EDGE_TRANSLATE_FAILED, "Edge translate request failed."));
        }
      },
      "google-web": {
        translateSegments(segments) {
          calls.push("google-web");
          return Promise.resolve({
            provider: "google-web",
            translatedSegments: segments.map((item) => `谷歌:${item}`)
          });
        }
      }
    },
    diagnostics: {
      record(event, payload) {
        diagnosticsEvents.push({ event, payload });
      },
      recordError() {}
    }
  });

  const result = await service.translateSegments(
    ["one", "two"],
    language,
    { preferredProvider: "edge-web" }
  );

  assert.deepEqual(calls, ["edge-web", "google-web"]);
  assert.equal(result.provider, "google-web");
  assert.deepEqual(result.translatedSegments, ["谷歌:one", "谷歌:two"]);
  assert.deepEqual(diagnosticsEvents, [
    {
      event: "translate-service.provider.fallback",
      payload: {
        fromProvider: "edge-web",
        toProvider: "google-web",
        errorCode: ERROR_CODES.EDGE_TRANSLATE_FAILED
      }
    }
  ]);
});

test("translate service respects reversed provider priority and falls back to edge when google fails", async () => {
  const calls = [];
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "edge-web" }, { id: "google-web" }],
    translators: {
      "edge-web": {
        translateSegments() {
          calls.push("edge-web");
          return Promise.resolve({ provider: "edge-web", translatedSegments: ["微软"] });
        }
      },
      "google-web": {
        translateSegments() {
          calls.push("google-web");
          return Promise.reject(createError(ERROR_CODES.GOOGLE_TRANSLATE_FAILED, "Google translate request failed."));
        }
      }
    }
  });

  const result = await service.translateSegments(
    ["one"],
    language,
    { preferredProvider: "google-web" }
  );

  assert.deepEqual(calls, ["google-web", "edge-web"]);
  assert.equal(result.provider, "edge-web");
  assert.deepEqual(result.translatedSegments, ["微软"]);
});

test("translate service does not fall back when the preferred provider request is cancelled", async () => {
  let googleCalls = 0;
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "edge-web" }, { id: "google-web" }],
    translators: {
      "edge-web": {
        translateSegments() {
          return createPendingPromise();
        }
      },
      "google-web": {
        translateSegments() {
          googleCalls += 1;
          return Promise.resolve({ provider: "google-web", translatedSegments: ["谷歌"] });
        }
      }
    }
  });

  const request = service.translateSegments(
    ["one"],
    language,
    { preferredProvider: "edge-web" }
  );

  request.abort();

  await assert.rejects(request, (error) => {
    assert.equal(error.code, ERROR_CODES.TRANSLATION_CANCELLED);
    return true;
  });
  assert.equal(googleCalls, 0);
});
