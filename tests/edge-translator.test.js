const test = require("node:test");
const assert = require("node:assert/strict");

const { ERROR_CODES } = require("../src/core/errors.js");
const { createEdgeTranslator } = require("../src/translation/edge-translator.js");
const { createTranslateService } = require("../src/translation/translate-service.js");

test("edge translator preserves segment order and emits normalized translatedSegments", async () => {
  let requestDetails = null;
  const translator = createEdgeTranslator({
    edgeAuth: { getToken: async () => "a.b.c" },
    xhr: {
      request: async (details) => {
        requestDetails = details;
        return {
          status: 200,
          responseText: JSON.stringify([
            { translations: [{ text: "第一段" }] },
            { translations: [{ text: "第二段" }] }
          ])
        };
      }
    }
  });

  const result = await translator.translateSegments(
    ["one", "two"],
    { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
  );

  assert.deepEqual(result, {
    provider: "edge-web",
    providerLabel: "Microsoft Edge（免 Key）",
    targetLanguage: "zh-CN",
    targetLanguageLabel: "简体中文",
    translatedSegments: ["第一段", "第二段"]
  });
  assert.equal(requestDetails.timeout, 15000);
  assert.equal(requestDetails.nocache, true);
});

test("edge translator normalizes parse failures into stable translate errors", async () => {
  const translator = createEdgeTranslator({
    edgeAuth: { getToken: async () => "a.b.c" },
    xhr: {
      request: async () => ({
        status: 200,
        responseText: "{"
      })
    }
  });

  await assert.rejects(
    translator.translateSegments(
      ["one"],
      { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
    ),
    (error) => {
      assert.equal(error.code, ERROR_CODES.EDGE_TRANSLATE_FAILED);
      assert.equal(error.message, "Edge translate response was invalid.");
      return true;
    }
  );
});

test("edge translator normalizes non-2xx transport status into stable translate errors", async () => {
  const translator = createEdgeTranslator({
    edgeAuth: { getToken: async () => "a.b.c" },
    xhr: {
      request: async () => {
        throw Object.assign(new Error("HTTP 429"), { status: 429, responseText: "slow down" });
      }
    }
  });

  await assert.rejects(
    translator.translateSegments(
      ["one"],
      { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
    ),
    (error) => {
      assert.equal(error.code, ERROR_CODES.EDGE_TRANSLATE_FAILED);
      assert.equal(error.message, "Edge translate request failed.");
      assert.equal(error.metadata.status, 429);
      return true;
    }
  );
});

test("edge translator fails hard on malformed translation entries", async () => {
  const translator = createEdgeTranslator({
    edgeAuth: { getToken: async () => "a.b.c" },
    xhr: {
      request: async () => ({
        status: 200,
        responseText: JSON.stringify([
          { translations: [{ text: "第一段" }] },
          { translations: [{}] }
        ])
      })
    }
  });

  await assert.rejects(
    translator.translateSegments(
      ["one", "two"],
      { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
    ),
    (error) => {
      assert.equal(error.code, ERROR_CODES.EDGE_TRANSLATE_FAILED);
      assert.equal(error.message, "Edge translate response was invalid.");
      return true;
    }
  );
});

test("edge translator exposes abort during auth and preserves cancellation", async () => {
  let rejectToken = null;
  let authAbortCount = 0;
  const translator = createEdgeTranslator({
    edgeAuth: {
      getToken() {
        const pending = new Promise((resolve, reject) => {
          rejectToken = reject;
        });

        pending.abort = () => {
          authAbortCount += 1;
          rejectToken({ type: "abort" });
        };

        return pending;
      }
    },
    xhr: {
      request: async () => {
        throw new Error("should not reach translate xhr");
      }
    }
  });

  const translationPromise = translator.translateSegments(
    ["one"],
    { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
  );

  assert.equal(typeof translationPromise.abort, "function");

  await new Promise((resolve) => setTimeout(resolve, 0));
  translationPromise.abort();

  await assert.rejects(translationPromise, (error) => {
    assert.equal(error.code, ERROR_CODES.TRANSLATION_CANCELLED);
    return true;
  });
  assert.equal(authAbortCount, 1);
});

test("edge translator exposes abort during translate xhr and preserves cancellation", async () => {
  let rejectRequest = null;
  let requestAbortCount = 0;
  let markRequestStarted = null;
  const requestStarted = new Promise((resolve) => {
    markRequestStarted = resolve;
  });
  const translator = createEdgeTranslator({
    edgeAuth: { getToken: async () => "a.b.c" },
    xhr: {
      request() {
        markRequestStarted();
        const pending = new Promise((resolve, reject) => {
          rejectRequest = reject;
        });

        pending.abort = () => {
          requestAbortCount += 1;
          rejectRequest({ type: "abort" });
        };

        return pending;
      }
    }
  });

  const translationPromise = translator.translateSegments(
    ["one"],
    { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
  );

  assert.equal(typeof translationPromise.abort, "function");

  await requestStarted;
  translationPromise.abort();

  await assert.rejects(translationPromise, (error) => {
    assert.equal(error.code, ERROR_CODES.TRANSLATION_CANCELLED);
    return true;
  });
  assert.equal(requestAbortCount, 1);
});

test("translate service preserves translator abortability while remaining a narrow facade", async () => {
  let abortCount = 0;
  const service = createTranslateService({
    edgeTranslator: {
      translateSegments(segments, language) {
        assert.deepEqual(segments, ["one", "two"]);
        assert.equal(language.id, "zh-CN");

        const pending = new Promise(() => {});
        pending.abort = () => {
          abortCount += 1;
        };
        return pending;
      }
    },
    languages: [{ id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }]
  });

  const translationPromise = service.translateSegments(
    [" one ", "", "two"],
    { id: "zh-CN", microsoft: "zh-Hans", label: "简体中文" }
  );

  assert.equal(typeof translationPromise.abort, "function");
  translationPromise.abort();
  assert.equal(abortCount, 1);
});
