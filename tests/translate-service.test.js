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

test("translate service does not automatically fallback from edge into google", async () => {
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

  const request = service.translateSegments(
    ["one", "two"],
    language,
    { preferredProvider: "edge-web" }
  );

  await assert.rejects(request, (error) => {
    assert.equal(error.code, ERROR_CODES.EDGE_TRANSLATE_FAILED);
    return true;
  });
  assert.deepEqual(calls, ["edge-web"]);
  assert.deepEqual(diagnosticsEvents, [
    {
      event: "translate-service.provider.fallback.skipped",
      payload: {
        fromProvider: "edge-web",
        toProvider: "google-web",
        errorCode: ERROR_CODES.EDGE_TRANSLATE_FAILED,
        reason: "google-web-explicit-only"
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

test("translate service rejects provider responses with mismatched segment counts", async () => {
  const calls = [];
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "edge-web" }, { id: "google-web" }],
    translators: {
      "edge-web": {
        translateSegments() {
          calls.push("edge-web");
          return Promise.resolve({
            provider: "edge-web",
            translatedSegments: ["only one"]
          });
        }
      },
      "google-web": {
        translateSegments() {
          calls.push("google-web");
          return Promise.resolve({
            provider: "google-web",
            translatedSegments: ["fallback one", "fallback two"]
          });
        }
      }
    }
  });

  await assert.rejects(
    service.translateSegments(
      ["one", "two"],
      language,
      { preferredProvider: "edge-web" }
    ),
    (error) => {
      assert.equal(error.code, "translator_contract_violation");
      assert.equal(error.message, "Translator response did not match the request.");
      assert.equal(error.metadata.providerId, "edge-web");
      assert.equal(error.metadata.expectedSegmentCount, 2);
      assert.equal(error.metadata.actualSegmentCount, 1);
      return true;
    }
  );
  assert.deepEqual(calls, ["edge-web"]);
});

test("translate service rejects provider responses with non-string translated segments", async () => {
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "google-web" }],
    translators: {
      "google-web": {
        translateSegments() {
          return Promise.resolve({
            provider: "google-web",
            translatedSegments: ["ok", null]
          });
        }
      }
    }
  });

  await assert.rejects(
    service.translateSegments(
      ["one", "two"],
      language,
      { preferredProvider: "google-web" }
    ),
    (error) => {
      assert.equal(error.code, "translator_contract_violation");
      assert.equal(error.metadata.providerId, "google-web");
      assert.equal(error.metadata.invalidSegmentIndex, 1);
      return true;
    }
  );
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

test("translate service reports a provider-agnostic error when no translator implementation is available", async () => {
  const service = createTranslateService({
    languages: [language],
    providers: [{ id: "edge-web" }, { id: "google-web" }],
    translators: {}
  });

  const request = service.translateSegments(
    ["one"],
    language,
    { preferredProvider: "edge-web" }
  );

  await assert.rejects(request, (error) => {
    assert.equal(error.code, ERROR_CODES.NO_TRANSLATOR_AVAILABLE);
    assert.equal(error.message, "No translator provider was available.");
    return true;
  });
});
