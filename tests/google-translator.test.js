const test = require("node:test");
const assert = require("node:assert/strict");

const { ERROR_CODES } = require("../src/core/errors.js");
const { createGoogleWebTranslator } = require("../src/translation/google-translator.js");

const language = { id: "zh-CN", label: "简体中文", google: "zh-CN" };

test("google web translator preserves segment order and decodes html entities", async () => {
  const requestedUrls = [];
  const translator = createGoogleWebTranslator({
    xhr: {
      request(details) {
        requestedUrls.push(details.url);
        return Promise.resolve({
          status: 200,
          responseText: JSON.stringify([
            [["第一&amp;段", "one"]],
            null,
            "en"
          ])
        });
      }
    }
  });

  const result = await translator.translateSegments(["one", "two"], language);

  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /translate_a\/single/);
  assert.deepEqual(result, {
    provider: "google-web",
    providerLabel: "Google Web（实验性 / 免费）",
    targetLanguage: "zh-CN",
    targetLanguageLabel: "简体中文",
    translatedSegments: ["第一&段", "第一&段"]
  });
});

test("google web translator normalizes upstream failures into stable translate errors", async () => {
  const translator = createGoogleWebTranslator({
    xhr: {
      request() {
        return Promise.reject(Object.assign(new Error("HTTP 429"), { status: 429 }));
      }
    }
  });

  await assert.rejects(
    translator.translateSegments(["one"], language),
    (error) => {
      assert.equal(error.code, ERROR_CODES.GOOGLE_TRANSLATE_FAILED);
      assert.equal(error.message, "Google translate request failed.");
      assert.equal(error.metadata.status, 429);
      return true;
    }
  );
});

test("google web translator preserves cancellation instead of converting it into a provider failure", async () => {
  let rejectRequest = null;
  let abortCount = 0;
  const translator = createGoogleWebTranslator({
    xhr: {
      request() {
        const pending = new Promise((_resolve, reject) => {
          rejectRequest = reject;
        });
        pending.abort = () => {
          abortCount += 1;
          rejectRequest({ type: "abort" });
        };
        return pending;
      }
    }
  });

  const request = translator.translateSegments(["one"], language);
  request.abort();

  await assert.rejects(request, (error) => {
    assert.equal(error.code, ERROR_CODES.TRANSLATION_CANCELLED);
    return true;
  });
  assert.equal(abortCount, 1);
});
