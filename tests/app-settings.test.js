const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_SETTINGS, DOM_CONSTANTS } = require("../src/config/defaults.js");
const { createApp } = require("../src/core/app.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const pageLocator = require("../src/fastmail/page-locator.js");
const textPolicies = require("../src/fastmail/text-policies.js");
const { createSegmenter } = require("../src/fastmail/segmenter.js");
const { createThreadDom } = require("../src/fastmail/thread-dom.js");
const { createI18n } = require("../src/ui/i18n.js");
const { createTranslationRenderer } = require("../src/ui/translation-renderer.js");
const toolbarButtonApi = require("../src/ui/toolbar-button.js");
const { installDom } = require("./helpers/dom.js");

function waitForTick() {
  return new Promise((resolve) => {
    global.window.setTimeout(resolve, 0);
  });
}

async function flushWork(ticks = 4) {
  for (let index = 0; index < ticks; index += 1) {
    await waitForTick();
  }
}

function createDeferredRequest() {
  let resolvePromise = null;
  let rejectPromise = null;
  let abortCount = 0;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  promise.abort = () => {
    abortCount += 1;
    rejectPromise(new Error("aborted"));
  };

  return {
    promise,
    resolve(value) {
      resolvePromise(value);
    },
    reject(error) {
      rejectPromise(error);
    },
    get abortCount() {
      return abortCount;
    }
  };
}

function createHarness({ translateService }) {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar">
            <button><span class="label">Archive</span></button>
            <button><span class="label">More</span></button>
            <div class="v-Toolbar-flex"></div>
          </div>
          <div class="v-Page-content">
            <div class="v-Thread">
              <div class="v-Thread-title"><h1>Subject</h1></div>
              <div class="v-MessageCard app-contentCard"></div>
              <div class="v-Message">
                <div class="v-Message-body">
                  <article class="u-article">
                    <p>Hello world</p>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  const runtimeState = createRuntimeState({
    getLocationKey: () => pageLocator.getLocationKey(global.location)
  });
  const segmenter = createSegmenter({
    constants: DOM_CONSTANTS,
    policies: textPolicies,
    runtimeState
  });
  const threadDom = createThreadDom({
    constants: DOM_CONSTANTS,
    i18n: createI18n({ navigator: { language: "zh-CN" } }),
    pageLocator,
    policies: textPolicies,
    runtimeState,
    segmenter,
    toolbarButtonApi
  });
  const renderer = createTranslationRenderer({
    constants: DOM_CONSTANTS,
    i18n: createI18n({ navigator: { language: "zh-CN" } }),
    runtimeState,
    segmenter
  });

  let persistedSettings = {
    targetLanguage: DEFAULT_SETTINGS.targetLanguage,
    preferredProvider: DEFAULT_SETTINGS.preferredProvider
  };
  let openSettingsArgs = null;
  const requests = new Map();
  const app = createApp({
    defaults: DEFAULT_SETTINGS,
    document: global.document,
    i18n: createI18n({ navigator: { language: "zh-CN" } }),
    policies: textPolicies,
    renderer,
    requestRegistry: {
      register(requestId, request) {
        requests.set(requestId, request);
      },
      release(requestId) {
        requests.delete(requestId);
      },
      cancelMany(requestIds) {
        requestIds.forEach((requestId) => {
          requests.get(requestId)?.abort?.();
        });
      }
    },
    runtimeState,
    segmenter,
    settingsModal: {
      open(args) {
        openSettingsArgs = args;
      }
    },
    settingsStore: {
      async getSettings() {
        return { ...persistedSettings };
      },
      async setSettings(nextSettings) {
        persistedSettings = { ...nextSettings };
        return { ...persistedSettings };
      }
    },
    threadDom,
    translateService
  });

  app.injectButtons(document);

  return {
    app,
    cleanup,
    getButton() {
      return document.querySelector(`.${DOM_CONSTANTS.BUTTON_CLASS}`);
    },
    getInlineTranslationText() {
      return document.querySelector(".fmt-inline-translation-content")?.textContent || "";
    },
    getInlineTranslationCount() {
      return document.querySelectorAll(".fmt-inline-translation-content").length;
    },
    getMessageStatusText() {
      return document.querySelector(`.${DOM_CONSTANTS.MESSAGE_STATUS_CLASS}`)?.textContent || "";
    },
    getBodyElement() {
      return document.querySelector(".v-Message-body");
    },
    async openSettings() {
      await app.openSettings();
      return openSettingsArgs;
    }
  };
}

test("settings changes invalidate cached translations and retranslate with the new provider/language", async () => {
  const calls = [];
  const harness = createHarness({
    translateService: {
      getLanguageDefinition(languageId) {
        return { id: languageId, label: languageId, microsoft: languageId };
      },
      translateSegments(segments, language, options) {
        calls.push({
          segments: [...segments],
          languageId: language.id,
          preferredProvider: options.preferredProvider
        });
        const request = Promise.resolve({
          translatedSegments: segments.map((segment) => `${options.preferredProvider}:${language.id}:${segment}`)
        });
        request.abort = () => {};
        return request;
      }
    }
  });

  try {
    await harness.app.onTranslateClick({ currentTarget: harness.getButton() });
    await flushWork();

    assert.equal(calls.length, 2);
    assert.equal(harness.getInlineTranslationText(), "edge-web:zh-CN:Hello world");

    const settingsSession = await harness.openSettings();
    await settingsSession.onSave({
      targetLanguage: "en",
      preferredProvider: "google-web"
    });
    await flushWork();

    assert.equal(calls.length, 4);
    assert.deepEqual(
      calls.slice(-2).map((call) => ({
        languageId: call.languageId,
        preferredProvider: call.preferredProvider
      })),
      [
        { languageId: "en", preferredProvider: "google-web" },
        { languageId: "en", preferredProvider: "google-web" }
      ]
    );
    assert.equal(harness.getInlineTranslationText(), "google-web:en:Hello world");
  } finally {
    harness.cleanup();
  }
});

test("settings changes cancel old in-flight translations and ignore stale results", async () => {
  const calls = [];
  const oldBodyRequest = createDeferredRequest();
  const harness = createHarness({
    translateService: {
      getLanguageDefinition(languageId) {
        return { id: languageId, label: languageId, microsoft: languageId };
      },
      translateSegments(segments, language, options) {
        calls.push({
          segments: [...segments],
          languageId: language.id,
          preferredProvider: options.preferredProvider
        });

        if (segments[0] === "Hello world" && options.preferredProvider === "edge-web") {
          return oldBodyRequest.promise;
        }

        const request = Promise.resolve({
          translatedSegments: segments.map((segment) => `${options.preferredProvider}:${language.id}:${segment}`)
        });
        request.abort = () => {};
        return request;
      }
    }
  });

  try {
    void harness.app.onTranslateClick({ currentTarget: harness.getButton() });
    await flushWork(2);

    const settingsSession = await harness.openSettings();
    const savePromise = settingsSession.onSave({
      targetLanguage: "en",
      preferredProvider: "google-web"
    });
    await flushWork(2);

    oldBodyRequest.resolve({
      translatedSegments: ["edge-web:zh-CN:Hello world"]
    });
    await savePromise;
    await flushWork(6);

    assert.ok(oldBodyRequest.abortCount > 0);
    assert.equal(harness.getInlineTranslationText(), "google-web:en:Hello world");
    assert.deepEqual(
      calls.map((call) => `${call.preferredProvider}:${call.languageId}:${call.segments[0]}`),
      [
        "edge-web:zh-CN:Subject",
        "edge-web:zh-CN:Hello world",
        "google-web:en:Subject",
        "google-web:en:Hello world"
      ]
    );
  } finally {
    harness.cleanup();
  }
});

test("settings changes reject stale body results before the replacement refresh starts", async () => {
  const oldBodyRequest = createDeferredRequest();
  const harness = createHarness({
    translateService: {
      getLanguageDefinition(languageId) {
        return { id: languageId, label: languageId, microsoft: languageId };
      },
      translateSegments(segments, language, options) {
        if (segments[0] === "Hello world" && options.preferredProvider === "edge-web") {
          const request = oldBodyRequest.promise;
          request.abort = () => {};
          return request;
        }

        const request = Promise.resolve({
          translatedSegments: segments.map((segment) => `${options.preferredProvider}:${language.id}:${segment}`)
        });
        request.abort = () => {};
        return request;
      }
    }
  });

  try {
    void harness.app.onTranslateClick({ currentTarget: harness.getButton() });
    await flushWork(2);

    const settingsSession = await harness.openSettings();
    await settingsSession.onSave({
      targetLanguage: "en",
      preferredProvider: "google-web"
    });

    oldBodyRequest.resolve({
      translatedSegments: ["edge-web:zh-CN:Hello world"]
    });
    await Promise.resolve();

    assert.notEqual(harness.getInlineTranslationText(), "edge-web:zh-CN:Hello world");
    await flushWork(6);
  } finally {
    harness.cleanup();
  }
});

test("settings changes clear stale inline translations before the replacement refresh settles", async () => {
  const harness = createHarness({
    translateService: {
      getLanguageDefinition(languageId) {
        return { id: languageId, label: languageId, microsoft: languageId };
      },
      translateSegments(segments, language, options) {
        const request = Promise.resolve({
          translatedSegments: segments.map((segment) => `${options.preferredProvider}:${language.id}:${segment}`)
        });
        request.abort = () => {};
        return request;
      }
    }
  });

  try {
    await harness.app.onTranslateClick({ currentTarget: harness.getButton() });
    await flushWork();

    assert.equal(harness.getInlineTranslationText(), "edge-web:zh-CN:Hello world");

    harness.getBodyElement().className = "fmt-missing-body";

    const settingsSession = await harness.openSettings();
    await settingsSession.onSave({
      targetLanguage: "en",
      preferredProvider: "google-web"
    });

    assert.notEqual(harness.getInlineTranslationText(), "edge-web:zh-CN:Hello world");

    await flushWork();

    assert.notEqual(harness.getInlineTranslationText(), "edge-web:zh-CN:Hello world");
  } finally {
    harness.cleanup();
  }
});
