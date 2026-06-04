const test = require("node:test");
const assert = require("node:assert/strict");

const { DOM_CONSTANTS } = require("../src/config/defaults.js");
const { createLifecycle } = require("../src/core/lifecycle.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const pageLocator = require("../src/fastmail/page-locator.js");
const { installDom } = require("./helpers/dom.js");

function waitForTick() {
  return new Promise((resolve) => {
    global.window.setTimeout(resolve, 0);
  });
}

test("lifecycle ignores toolbar attribute mutations when deciding active thread refreshes", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar">
            <button><span class="label">Archive</span></button>
            <button class="fmt-translate-button"><span class="label">翻译</span></button>
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
    const threadRoot = document.querySelector(".v-Thread");
    const toolbar = document.querySelector(".v-Toolbar");
    const refreshCalls = [];

    const app = {
      injectButtons() {},
      onTranslateClick() {},
      resetDocumentTranslationState() {},
      scheduleThreadRefresh(root, options) {
        refreshCalls.push({ root, options });
      }
    };

    const threadDom = {
      findThreadRoot(node) {
        return node?.closest?.(".v-Toolbar") ? threadRoot : null;
      },
      pruneDetachedThreadStates() {},
      getExistingThreadState(root) {
        return root === threadRoot ? { active: true } : null;
      }
    };

    const lifecycle = createLifecycle({
      app,
      constants: DOM_CONSTANTS,
      document: global.document,
      runtimeState,
      threadDom
    });

    lifecycle.initialize();
    toolbar.setAttribute("aria-hidden", "true");
    await waitForTick();
    await waitForTick();

    assert.equal(refreshCalls.length, 0);
  } finally {
    cleanup();
  }
});
