const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_SETTINGS } = require("../src/config/defaults.js");
const { createApp } = require("../src/core/app.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const { createI18n } = require("../src/ui/i18n.js");
const { installDom } = require("./helpers/dom.js");

test("app records a diagnostics event when fresh translations fail to render back into the live DOM", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Thread">
          <div class="v-Message-body"></div>
        </div>
      </body>
    </html>
  `);

  try {
    const threadRoot = document.querySelector(".v-Thread");
    const body = document.querySelector(".v-Message-body");
    const runtimeState = createRuntimeState({
      getLocationKey: () => global.location.pathname
    });
    const threadState = runtimeState.createThreadState();
    threadState.root = threadRoot;
    runtimeState.activateThreadState(threadState);

    const diagnosticsEvents = [];
    const messageState = runtimeState.createMessageState({
      key: "thread-1::message-1",
      identity: "message::1",
      instanceId: "message-1"
    });
    const descriptor = {
      key: messageState.key,
      state: messageState,
      body,
      contentRoot: body
    };

    const app = createApp({
      defaults: DEFAULT_SETTINGS,
      document: global.document,
      i18n: createI18n({ navigator: { language: "en-US" } }),
      policies: {
        hasTranslatableText() {
          return true;
        }
      },
      renderer: {
        hasThreadRenderArtifacts() {
          return false;
        },
        clearMessageStatus() {},
        clearThreadRenderArtifacts() {},
        clearTitleTranslation() {},
        renderTitleTranslation() {},
        renderLoadingTranslations() {
          return { ok: true, renderedCount: 1, failedSegments: [] };
        },
        renderTranslatedSegments() {
          return {
            ok: false,
            renderedCount: 0,
            failedSegments: [{ segmentId: "segment-1", reason: "insert-failed" }]
          };
        },
        renderSegmentError() {},
        renderMessageStatus() {}
      },
      requestRegistry: {
        register() {},
        release() {},
        cancelMany() {}
      },
      runtimeState,
      segmenter: {
        collectTranslatableSegments() {
          return [{ id: "segment-1", element: body, sourceElement: body, text: "Hello world" }];
        },
        getSegmentSignature() {
          return "Hello world";
        }
      },
      settingsModal: { open() {} },
      settingsStore: {
        async getTargetLanguage() {
          return "zh-CN";
        },
        async setTargetLanguage(value) {
          return value;
        }
      },
      threadDom: {
        syncThreadButtons() {},
        collectMessageDescriptors() {
          return [descriptor];
        },
        reconcileMessageStates(currentThreadState, descriptors) {
          currentThreadState.messages.set(messageState.key, messageState);
          descriptors[0].state = messageState;
        },
        findTitleElement() {
          return null;
        },
        findLiveMessageElements() {
          return { body, contentRoot: body };
        },
        isMessageBodyDeferred() {
          return false;
        },
        getExistingThreadState(root) {
          return root === threadRoot ? threadState : null;
        },
        resetThreadState() {},
        clearThreadDomState() {},
        findThreadRoot() {
          return threadRoot;
        },
        ensureThreadState() {
          return threadState;
        }
      },
      translateService: {
        getLanguageDefinition() {
          return { id: "zh-CN", label: "简体中文", microsoft: "zh-Hans" };
        },
        translateSegments() {
          const promise = Promise.resolve({ translatedSegments: ["译文"] });
          promise.abort = () => {};
          return promise;
        }
      },
      diagnostics: {
        record(event, payload) {
          diagnosticsEvents.push({ event, payload });
        },
        recordError() {}
      }
    });

    await app.refreshThread(threadRoot, threadState);

    assert.deepEqual(
      diagnosticsEvents.find((entry) => entry.event === "thread.message.render.failed"),
      {
        event: "thread.message.render.failed",
        payload: {
          messageKey: messageState.key,
          phase: "fresh-translation",
          failedSegments: [{ segmentId: "segment-1", reason: "insert-failed" }]
        }
      }
    );
  } finally {
    cleanup();
  }
});

test("app records click-path diagnostics when translation gets activated", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <button class="fmt-translate-button">翻译</button>
        <div class="v-Thread"></div>
      </body>
    </html>
  `);

  try {
    const button = document.querySelector(".fmt-translate-button");
    const threadRoot = document.querySelector(".v-Thread");
    const runtimeState = createRuntimeState({
      getLocationKey: () => global.location.pathname
    });
    const threadState = runtimeState.createThreadState();
    threadState.root = threadRoot;
    const diagnosticsEvents = [];

    const app = createApp({
      defaults: DEFAULT_SETTINGS,
      document: global.document,
      i18n: createI18n({ navigator: { language: "en-US" } }),
      policies: { hasTranslatableText() { return true; } },
      renderer: {
        hasThreadRenderArtifacts() {
          return false;
        }
      },
      requestRegistry: { register() {}, release() {}, cancelMany() {} },
      runtimeState,
      segmenter: { collectTranslatableSegments() { return []; }, getSegmentSignature() { return ""; } },
      settingsModal: { open() {} },
      settingsStore: {
        async getTargetLanguage() {
          return "zh-CN";
        },
        async setTargetLanguage(value) {
          return value;
        }
      },
      threadDom: {
        findThreadRoot(currentButton) {
          return currentButton === button ? threadRoot : null;
        },
        getExistingThreadState() {
          return null;
        },
        ensureThreadState() {
          return threadState;
        },
        syncThreadButtons() {}
      },
      translateService: {
        getLanguageDefinition() {
          return { id: "zh-CN", label: "简体中文", microsoft: "zh-Hans" };
        }
      },
      diagnostics: {
        record(event, payload) {
          diagnosticsEvents.push({ event, payload });
        },
        recordError() {}
      }
    });

    await app.onTranslateClick({ currentTarget: button });

    assert.deepEqual(diagnosticsEvents, [
      {
        event: "ui.translate-click.received",
        payload: {
          buttonClassName: "fmt-translate-button"
        }
      },
      {
        event: "ui.translate-click.activate",
        payload: {
          threadKey: threadState.key
        }
      }
    ]);
  } finally {
    cleanup();
  }
});
