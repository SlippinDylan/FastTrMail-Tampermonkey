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

async function flushTicks(ticks = 3) {
  for (let index = 0; index < ticks; index += 1) {
    await waitForTick();
  }
}

function createLifecycleDom() {
  return installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar"></div>
          <div class="v-Page-content">
            <div class="v-Thread">
              <div class="v-Thread-title"><h1>Subject</h1></div>
              <div class="v-MessageCard app-contentCard"></div>
              <div class="v-Message">
                <div class="v-Message-body">
                  <div class="message-body-text">Original body text</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
}

test("observed-thread pruning disposes detached active threads before dropping state", async () => {
  const { cleanup } = createLifecycleDom();

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const threadRoot = document.querySelector(".v-Thread");
    const mutationTarget = document.querySelector(".message-body-text");
    const callOrder = [];
    const app = {
      injectButtons() {},
      onTranslateClick() {},
      resetDocumentTranslationState() {},
      scheduleThreadRefresh() {},
      disposeThread(root) {
        callOrder.push({ event: "dispose", root });
      }
    };
    const threadDom = {
      findThreadRoot() {
        return threadRoot;
      },
      collectDetachedActiveThreadRoots() {
        return [threadRoot];
      },
      pruneDetachedThreadStates() {
        callOrder.push({ event: "prune" });
      },
      getExistingThreadState(root) {
        return root === threadRoot ? { active: true } : null;
      }
    };

    createLifecycle({
      app,
      constants: DOM_CONSTANTS,
      document: global.document,
      runtimeState,
      threadDom
    }).initialize();

    threadRoot.remove();
    mutationTarget.textContent = "Updated body text";
    await flushTicks();

    assert.deepEqual(callOrder, [
      { event: "dispose", root: threadRoot },
      { event: "prune" }
    ]);
  } finally {
    cleanup();
  }
});

test("observer callback contains unexpected DOM errors and later mutations still schedule work", async () => {
  const { cleanup } = createLifecycleDom();
  const originalClosest = global.HTMLElement.prototype.closest;

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const threadRoot = document.querySelector(".v-Thread");
    const bodyText = document.querySelector(".message-body-text");
    const boom = new Error("observer boom");
    const lifecycleErrors = [];
    const refreshCalls = [];
    let shouldThrow = true;
    const app = {
      injectButtons() {},
      onTranslateClick() {},
      resetDocumentTranslationState() {},
      reportLifecycleError(event, error) {
        lifecycleErrors.push({ event, error });
      },
      scheduleThreadRefresh(root, options) {
        refreshCalls.push({ root, options });
      }
    };
    const threadDom = {
      findThreadRoot() {
        return threadRoot;
      },
      pruneDetachedThreadStates() {},
      getExistingThreadState(root) {
        return root === threadRoot ? { active: true } : null;
      }
    };

    createLifecycle({
      app,
      constants: DOM_CONSTANTS,
      document: global.document,
      runtimeState,
      threadDom
    }).initialize();

    global.HTMLElement.prototype.closest = function patchedClosest(selector) {
      if (selector === ".v-Thread" && shouldThrow) {
        shouldThrow = false;
        global.HTMLElement.prototype.closest = originalClosest;
        throw boom;
      }
      return originalClosest.call(this, selector);
    };

    document.querySelector(".v-Page-content").appendChild(document.createElement("div"));
    await flushTicks();

    bodyText.textContent = "Updated body text";
    await flushTicks();

    assert.deepEqual(lifecycleErrors, [
      { event: "lifecycle.observer.unexpected-error", error: boom }
    ]);
    assert.deepEqual(refreshCalls, [
      { root: threadRoot, options: { immediate: true } }
    ]);
  } finally {
    global.HTMLElement.prototype.closest = originalClosest;
    cleanup();
  }
});

test("document refresh timer contains unexpected errors and leaves later refreshes possible", async () => {
  const { cleanup } = createLifecycleDom();

  try {
    let locationKey = "thread-a";
    const runtimeState = createRuntimeState({
      getLocationKey: () => locationKey
    });
    const boom = new Error("document refresh boom");
    const lifecycleErrors = [];
    let injectCalls = 0;
    const app = {
      injectButtons() {
        injectCalls += 1;
        if (injectCalls === 2) {
          throw boom;
        }
      },
      onTranslateClick() {},
      resetDocumentTranslationState() {
        runtimeState.syncCurrentLocationKey();
      },
      reportLifecycleError(event, error) {
        lifecycleErrors.push({ event, error });
      },
      scheduleThreadRefresh() {}
    };
    const threadDom = {
      findThreadRoot() {
        return document.querySelector(".v-Thread");
      },
      pruneDetachedThreadStates() {},
      getExistingThreadState() {
        return null;
      }
    };

    createLifecycle({
      app,
      constants: DOM_CONSTANTS,
      document: global.document,
      runtimeState,
      threadDom
    }).initialize();

    locationKey = "thread-b";
    document.body.appendChild(document.createElement("div"));
    await flushTicks();

    locationKey = "thread-c";
    document.body.appendChild(document.createElement("section"));
    await flushTicks();

    assert.deepEqual(lifecycleErrors, [
      { event: "lifecycle.document-refresh.unexpected-error", error: boom }
    ]);
    assert.equal(injectCalls, 3);
  } finally {
    cleanup();
  }
});

test("thread flush timer contains unexpected errors and leaves later flushes possible", async () => {
  const { cleanup } = createLifecycleDom();

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const threadRoot = document.querySelector(".v-Thread");
    const bodyText = document.querySelector(".message-body-text");
    const boom = new Error("thread flush boom");
    const lifecycleErrors = [];
    const refreshCalls = [];
    let injectCalls = 0;
    const app = {
      injectButtons() {
        injectCalls += 1;
        if (injectCalls === 2) {
          throw boom;
        }
      },
      onTranslateClick() {},
      resetDocumentTranslationState() {},
      reportLifecycleError(event, error) {
        lifecycleErrors.push({ event, error });
      },
      scheduleThreadRefresh(root, options) {
        refreshCalls.push({ root, options });
      }
    };
    const threadDom = {
      findThreadRoot() {
        return threadRoot;
      },
      pruneDetachedThreadStates() {},
      getExistingThreadState(root) {
        return root === threadRoot ? { active: true } : null;
      }
    };

    createLifecycle({
      app,
      constants: DOM_CONSTANTS,
      document: global.document,
      runtimeState,
      threadDom
    }).initialize();

    bodyText.textContent = "First update";
    await flushTicks();

    bodyText.textContent = "Second update";
    await flushTicks();

    assert.deepEqual(lifecycleErrors, [
      { event: "lifecycle.thread-refresh.unexpected-error", error: boom }
    ]);
    assert.deepEqual(refreshCalls, [
      { root: threadRoot, options: { immediate: true } }
    ]);
  } finally {
    cleanup();
  }
});

test("lifecycle refreshes the active thread on hidden style and inert visibility mutations", async () => {
  for (const [attributeName, attributeValue] of [
    ["hidden", ""],
    ["style", "display: none;"],
    ["inert", ""]
  ]) {
    const { cleanup } = createLifecycleDom();

    try {
      const runtimeState = createRuntimeState({
        getLocationKey: () => pageLocator.getLocationKey(global.location)
      });
      const threadRoot = document.querySelector(".v-Thread");
      const messageBody = document.querySelector(".v-Message-body");
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
        findThreadRoot() {
          return threadRoot;
        },
        pruneDetachedThreadStates() {},
        getExistingThreadState(root) {
          return root === threadRoot ? { active: true } : null;
        }
      };

      createLifecycle({
        app,
        constants: DOM_CONSTANTS,
        document: global.document,
        runtimeState,
        threadDom
      }).initialize();

      messageBody.setAttribute(attributeName, attributeValue);
      await flushTicks();

      assert.deepEqual(
        refreshCalls,
        [{ root: threadRoot, options: { immediate: true } }],
        `${attributeName} mutation should schedule a refresh`
      );
    } finally {
      cleanup();
    }
  }
});

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

test("lifecycle ignores document click fallback for managed translate buttons", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar">
            <button class="fmt-translate-button"><span class="label">翻译</span></button>
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
    const button = document.querySelector(".fmt-translate-button");
    const onTranslateClickCalls = [];

    const app = {
      injectButtons() {},
      onTranslateClick(payload) {
        onTranslateClickCalls.push(payload);
      },
      resetDocumentTranslationState() {},
      scheduleThreadRefresh() {}
    };

    const threadDom = {
      isManagedTranslateButton(currentButton) {
        return currentButton === button;
      },
      findThreadRoot() {
        return document.querySelector(".v-Thread");
      },
      pruneDetachedThreadStates() {},
      getExistingThreadState() {
        return null;
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
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, button: 0, detail: 1 }));

    assert.equal(onTranslateClickCalls.length, 0);
  } finally {
    cleanup();
  }
});

test("lifecycle ignores child-list mutations caused by managed translate buttons", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar">
            <button class="fmt-translate-button"><span class="label">翻译</span></button>
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
    const button = document.querySelector(".fmt-translate-button");
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
      isManagedTranslateButton(currentButton) {
        return currentButton === button;
      },
      findThreadRoot() {
        return document.querySelector(".v-Thread");
      },
      pruneDetachedThreadStates() {},
      getExistingThreadState(root) {
        return root === document.querySelector(".v-Thread") ? { active: true } : null;
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
    const spacer = document.createElement("span");
    toolbar.appendChild(spacer);
    button.remove();
    toolbar.appendChild(button);
    await waitForTick();
    await waitForTick();

    assert.equal(refreshCalls.length, 0);
  } finally {
    cleanup();
  }
});

test("lifecycle suppresses async observer feedback for DOM writes wrapped in withObserverMuted", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar"></div>
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
      findThreadRoot() {
        return threadRoot;
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
    runtimeState.withObserverMuted(() => {
      const node = document.createElement("div");
      node.textContent = "internal mutation";
      threadRoot.appendChild(node);
    });
    await waitForTick();
    await waitForTick();

    assert.equal(refreshCalls.length, 0);
  } finally {
    cleanup();
  }
});

test("lifecycle refreshes the active thread when an existing body text node changes in place", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar"></div>
          <div class="v-Page-content">
            <div class="v-Thread">
              <div class="v-Thread-title"><h1>Subject</h1></div>
              <div class="v-Message">
                <div class="v-Message-body">
                  <div class="message-body-text">Original body text</div>
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
    const threadRoot = document.querySelector(".v-Thread");
    const bodyTextNode = document.querySelector(".message-body-text").firstChild;
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
      findThreadRoot() {
        return threadRoot;
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
    bodyTextNode.data = "Updated body text";
    await waitForTick();
    await waitForTick();

    assert.deepEqual(refreshCalls, [{ root: threadRoot, options: { immediate: true } }]);
  } finally {
    cleanup();
  }
});

test("lifecycle refreshes the active thread when an existing title text node changes in place", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Page">
          <div class="v-Toolbar"></div>
          <div class="v-Page-content">
            <div class="v-Thread">
              <div class="v-Thread-title"><h1>Original subject</h1></div>
              <div class="v-Message">
                <div class="v-Message-body">
                  <div class="message-body-text">Body text</div>
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
    const threadRoot = document.querySelector(".v-Thread");
    const titleTextNode = document.querySelector(".v-Thread-title h1").firstChild;
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
      findThreadRoot() {
        return threadRoot;
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
    titleTextNode.data = "Updated subject";
    await waitForTick();
    await waitForTick();

    assert.deepEqual(refreshCalls, [{ root: threadRoot, options: { immediate: true } }]);
  } finally {
    cleanup();
  }
});
