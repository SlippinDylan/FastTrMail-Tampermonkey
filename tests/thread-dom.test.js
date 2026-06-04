const test = require("node:test");
const assert = require("node:assert/strict");

const { DOM_CONSTANTS } = require("../src/config/defaults.js");
const pageLocator = require("../src/fastmail/page-locator.js");
const textPolicies = require("../src/fastmail/text-policies.js");
const { createSegmenter } = require("../src/fastmail/segmenter.js");
const { createThreadDom } = require("../src/fastmail/thread-dom.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const { createI18n } = require("../src/ui/i18n.js");
const toolbarButtonApi = require("../src/ui/toolbar-button.js");
const { installDom } = require("./helpers/dom.js");

test("thread dom injects the translate button after Fastmail more action", () => {
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
            </div>
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
    const threadDom = createThreadDom({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      pageLocator,
      policies: textPolicies,
      runtimeState,
      segmenter,
      toolbarButtonApi
    });

    threadDom.injectButtons(document, () => {});

    const toolbar = document.querySelector(".v-Toolbar");
    const buttons = Array.from(toolbar.children).map((node) => node.textContent.trim());

    assert.deepEqual(buttons, ["Archive", "More", "", "翻译", ""]);
  } finally {
    cleanup();
  }
});

test("thread dom finds title and message body from a Fastmail thread", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Page-content">
            <div class="v-Thread">
              <div class="v-Thread-title"><h1>Subject line</h1></div>
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
      i18n: createI18n({ navigator: { language: "en-US" } }),
      pageLocator,
      policies: textPolicies,
      runtimeState,
      segmenter,
      toolbarButtonApi
    });

    const threadRoot = document.querySelector(".v-Thread");
    const title = threadDom.findTitleElement(threadRoot);
    const descriptors = threadDom.collectMessageDescriptors(threadRoot);

    assert.equal(title.textContent, "Subject line");
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].body.classList.contains("v-Message-body"), true);
    assert.equal(descriptors[0].contentRoot.classList.contains("v-Message-body"), true);
  } finally {
    cleanup();
  }
});

test("thread dom reuses a matching button shell and updates its label state", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar">
            <button><span class="label">Archive</span></button>
            <button><span class="label">More</span></button>
            <button class="v-Button v-Button--subtleStandard v-Button--sizeM fmt-translate-button">
              <span class="label">恢复原文</span>
            </button>
            <div class="v-Toolbar-flex"></div>
          </div>
          <div class="v-Page-content">
            <div class="v-Thread">
              <div class="v-Thread-title"><h1>Subject</h1></div>
            </div>
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
    const threadDom = createThreadDom({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      pageLocator,
      policies: textPolicies,
      runtimeState,
      segmenter,
      toolbarButtonApi
    });

    threadDom.injectButtons(document, () => {});

    const button = document.querySelector(`.${DOM_CONSTANTS.BUTTON_CLASS}`);
    const threadRoot = document.querySelector(".v-Thread");
    const state = threadDom.ensureThreadState(threadRoot);
    state.active = true;
    threadDom.injectButtons(document, () => {});

    assert.equal(button.querySelector(".label").textContent, "恢复原文");
  } finally {
    cleanup();
  }
});

test("thread dom normalizes toolbar button activations onto the button element for mouseup handlers", async () => {
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
            </div>
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
    const threadDom = createThreadDom({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      pageLocator,
      policies: textPolicies,
      runtimeState,
      segmenter,
      toolbarButtonApi
    });

    let capturedCurrentTarget = null;
    threadDom.injectButtons(document, (event) => {
      capturedCurrentTarget = event.currentTarget;
    });

    const button = document.querySelector(`.${DOM_CONSTANTS.BUTTON_CLASS}`);
    button.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, button: 0, detail: 1 }));

    assert.equal(capturedCurrentTarget, button);
  } finally {
    cleanup();
  }
});
