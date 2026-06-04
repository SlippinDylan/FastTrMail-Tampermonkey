const test = require("node:test");
const assert = require("node:assert/strict");

const { DOM_CONSTANTS } = require("../src/config/defaults.js");
const textPolicies = require("../src/fastmail/text-policies.js");
const pageLocator = require("../src/fastmail/page-locator.js");
const { createSegmenter } = require("../src/fastmail/segmenter.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const { createI18n } = require("../src/ui/i18n.js");
const { createTranslationRenderer } = require("../src/ui/translation-renderer.js");
const { installDom } = require("./helpers/dom.js");

test("renderer appends translated text below the source element", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Thread">
          <div class="v-Message-body">
            <p id="source">Hello world</p>
          </div>
        </div>
      </body>
    </html>
  `);

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const segmenter = createSegmenter({
      constants: DOM_CONSTANTS,
      policies: textPolicies,
      runtimeState
    });
    const renderer = createTranslationRenderer({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      runtimeState,
      segmenter
    });

    const source = document.getElementById("source");
    const segments = [{ id: "seg-1", element: source, sourceElement: source, text: "Hello world" }];
    const renderResult = renderer.renderTranslatedSegments(segments, ["你好，世界"]);

    assert.equal(renderResult.ok, true);
    assert.equal(source.nextElementSibling.textContent.trim(), "你好，世界");
  } finally {
    cleanup();
  }
});

test("renderer clears thread artifacts for restore-original behavior", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Thread">
          <div class="v-Thread-title">
            <h1>Subject</h1>
          </div>
          <div class="v-Message-body">
            <p id="source">Hello world</p>
          </div>
        </div>
      </body>
    </html>
  `);

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const segmenter = createSegmenter({
      constants: DOM_CONSTANTS,
      policies: textPolicies,
      runtimeState
    });
    const renderer = createTranslationRenderer({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      runtimeState,
      segmenter
    });

    const threadRoot = document.querySelector(".v-Thread");
    const title = document.querySelector("h1");
    const source = document.getElementById("source");
    const segments = [{ id: "seg-1", element: source, sourceElement: source, text: "Hello world" }];

    renderer.renderTitleTranslation(threadRoot, title, "主题", "done");
    renderer.renderTranslatedSegments(segments, ["你好，世界"]);
    assert.equal(renderer.hasThreadRenderArtifacts(threadRoot), true);

    renderer.clearThreadRenderArtifacts(threadRoot);
    assert.equal(renderer.hasThreadRenderArtifacts(threadRoot), false);
  } finally {
    cleanup();
  }
});
