const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_SETTINGS, DOM_CONSTANTS } = require("../src/config/defaults.js");
const { createApp } = require("../src/core/app.js");
const { createLifecycle } = require("../src/core/lifecycle.js");
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

function createHarness() {
  const runtimeState = createRuntimeState({
    getLocationKey: () => pageLocator.getLocationKey(global.location)
  });
  const segmenter = createSegmenter({
    constants: DOM_CONSTANTS,
    policies: textPolicies,
    runtimeState
  });
  const i18n = createI18n({ navigator: { language: "zh-CN" } });
  const threadDom = createThreadDom({
    constants: DOM_CONSTANTS,
    i18n,
    pageLocator,
    policies: textPolicies,
    runtimeState,
    segmenter,
    toolbarButtonApi
  });
  const renderer = createTranslationRenderer({
    constants: DOM_CONSTANTS,
    i18n,
    runtimeState,
    segmenter
  });
  const app = createApp({
    defaults: DEFAULT_SETTINGS,
    document: global.document,
    i18n,
    policies: textPolicies,
    renderer,
    requestRegistry: { register() {}, release() {}, cancelMany() {} },
    runtimeState,
    segmenter,
    settingsModal: { open() {} },
    settingsStore: {
      async getTargetLanguage() {
        return "zh-CN";
      },
      async setTargetLanguage(value) {
        return value;
      }
    },
    threadDom,
    translateService: {
      getLanguageDefinition() {
        return { id: "zh-CN", label: "简体中文", microsoft: "zh-Hans" };
      },
      translateSegments(segments) {
        const promise = Promise.resolve({
          translatedSegments: segments.map((text) => `译:${text}`)
        });
        promise.abort = () => {};
        return promise;
      }
    }
  });
  const lifecycle = createLifecycle({
    app,
    constants: DOM_CONSTANTS,
    document: global.document,
    runtimeState,
    threadDom
  });

  return { lifecycle, renderer };
}

test("toolbar mouseup triggers translation when Fastmail never emits a click event", async () => {
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

  try {
    const { lifecycle, renderer } = createHarness();
    lifecycle.initialize();

    const button = document.querySelector(`.${DOM_CONSTANTS.BUTTON_CLASS}`);
    button.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, button: 0, detail: 1 }));
    await waitForTick();
    await waitForTick();

    const threadRoot = document.querySelector(".v-Thread");
    assert.equal(renderer.hasThreadRenderArtifacts(threadRoot), true);
    assert.equal(button.classList.contains(DOM_CONSTANTS.BUTTON_ACTIVE_CLASS), true);
  } finally {
    cleanup();
  }
});

test("mouseup followed by click does not immediately restore the translated thread", async () => {
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

  try {
    const { lifecycle, renderer } = createHarness();
    lifecycle.initialize();

    const button = document.querySelector(`.${DOM_CONSTANTS.BUTTON_CLASS}`);
    button.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, button: 0, detail: 1 }));
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, button: 0, detail: 1 }));
    await waitForTick();
    await waitForTick();

    const threadRoot = document.querySelector(".v-Thread");
    assert.equal(renderer.hasThreadRenderArtifacts(threadRoot), true);
    assert.equal(button.classList.contains(DOM_CONSTANTS.BUTTON_ACTIVE_CLASS), true);
  } finally {
    cleanup();
  }
});
