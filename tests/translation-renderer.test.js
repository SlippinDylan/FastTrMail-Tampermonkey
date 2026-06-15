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

test("renderer clears message-scoped inline artifacts from only the current body container", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Message" id="message-node">
          <div class="v-Message-body" id="body-a">
            <p id="source-a">Hello world</p>
          </div>
          <div class="v-Message-body" id="body-b">
            <p id="source-b">Second message</p>
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
    const sourceA = document.getElementById("source-a");
    const sourceB = document.getElementById("source-b");

    renderer.renderTranslatedSegments(
      [{ id: "seg-a", element: sourceA, sourceElement: sourceA, text: "Hello world" }],
      ["你好"]
    );
    renderer.renderTranslatedSegments(
      [{ id: "seg-b", element: sourceB, sourceElement: sourceB, text: "Second message" }],
      ["第二封"]
    );

    renderer.clearMessageTranslations({
      messageNode: document.getElementById("message-node"),
      body: document.getElementById("body-a"),
      contentRoot: document.getElementById("body-a")
    });

    assert.equal(document.querySelector('[data-fmt-segment-id="seg-a"]'), null);
    assert.equal(document.querySelector('[data-fmt-segment-id="seg-b"]').textContent.trim(), "第二封");
  } finally {
    cleanup();
  }
});

test("renderer prunes obsolete segment translations while preserving current ones in the message body", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Message" id="message-node">
          <div class="v-Message-body" id="body-a">
            <p id="source-a">Hello world</p>
            <p id="source-b">Second line</p>
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
    const sourceA = document.getElementById("source-a");
    const sourceB = document.getElementById("source-b");
    const segments = [
      { id: "seg-a", element: sourceA, sourceElement: sourceA, text: "Hello world" },
      { id: "seg-b", element: sourceB, sourceElement: sourceB, text: "Second line" }
    ];

    renderer.renderTranslatedSegments(segments, ["你好", "第二行"]);
    renderer.pruneMessageTranslations({
      messageNode: document.getElementById("message-node"),
      body: document.getElementById("body-a"),
      contentRoot: document.getElementById("body-a")
    }, [segments[1]]);

    assert.equal(document.querySelector('[data-fmt-segment-id="seg-a"]'), null);
    assert.equal(document.querySelector('[data-fmt-segment-id="seg-b"]').textContent.trim(), "第二行");
  } finally {
    cleanup();
  }
});
