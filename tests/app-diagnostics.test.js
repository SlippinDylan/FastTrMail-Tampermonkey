const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_SETTINGS, DOM_CONSTANTS } = require("../src/config/defaults.js");
const { createApp } = require("../src/core/app.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const { createI18n } = require("../src/ui/i18n.js");
const { createTranslationRenderer } = require("../src/ui/translation-renderer.js");
const { installDom } = require("./helpers/dom.js");

function waitForTick() {
  return new Promise((resolve) => {
    global.window.setTimeout(resolve, 0);
  });
}

async function flushTimers(ticks = 4) {
  for (let index = 0; index < ticks; index += 1) {
    await waitForTick();
  }
}

function createResolvedRequest(value) {
  const promise = Promise.resolve(value);
  promise.abort = () => {};
  return promise;
}

function createDeferredRequest() {
  let resolveRequest = null;
  let rejectRequest = null;
  const promise = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  promise.abort = () => {};
  return { promise, resolve: resolveRequest, reject: rejectRequest };
}

function createMessageRefreshHarness() {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Thread">
          <div class="v-MessageCard app-contentCard"></div>
          <div class="v-Message">
            <div class="v-Message-body">
              <p id="line-1">Hello world</p>
              <p id="line-2">Second line</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  const runtimeState = createRuntimeState({
    getLocationKey: () => global.location.pathname
  });
  const i18n = createI18n({ navigator: { language: "en-US" } });
  const threadRoot = document.querySelector(".v-Thread");
  const messageNode = document.querySelector(".v-Message");
  const card = document.querySelector(".v-MessageCard");
  const initialBody = document.querySelector(".v-Message-body");
  const messageState = runtimeState.createMessageState({
    key: "thread-1::message-1",
    identity: "message::1",
    instanceId: "message-1"
  });
  const threadState = runtimeState.createThreadState();
  threadState.root = threadRoot;
  threadState.messages.set(messageState.key, messageState);
  runtimeState.activateThreadState(threadState);

  let liveBody = initialBody;
  let currentSegments = [];
  const descriptor = {
    key: messageState.key,
    state: messageState,
    body: initialBody,
    contentRoot: initialBody,
    messageNode,
    card
  };

  const segmenter = {
    collectTranslatableSegments() {
      return currentSegments;
    },
    getSegmentSignature(segments) {
      return segments.map((segment) => segment.id).join("|");
    },
    getExistingSegmentAnchor() {
      return null;
    },
    ensureSegmentAnchor() {
      return null;
    }
  };
  const renderer = createTranslationRenderer({
    constants: DOM_CONSTANTS,
    i18n,
    runtimeState,
    segmenter
  });

  const app = createApp({
    defaults: DEFAULT_SETTINGS,
    diagnostics: {
      record() {},
      recordError() {}
    },
    document: global.document,
    i18n,
    policies: {
      hasTranslatableText() {
        return true;
      }
    },
    renderer,
    requestRegistry: {
      register() {},
      release() {},
      cancelMany() {}
    },
    runtimeState,
    segmenter,
    settingsModal: { open() {} },
    settingsStore: {
      async getSettings() {
        return { ...DEFAULT_SETTINGS };
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
        return { body: liveBody, contentRoot: liveBody };
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
      translateSegments(segments) {
        return createResolvedRequest({
          translatedSegments: segments.map((segmentText) => `译:${segmentText}`)
        });
      }
    }
  });

  return {
    app,
    cleanup,
    descriptor,
    messageState,
    threadRoot,
    threadState,
    body: initialBody,
    getElement(selector) {
      return document.querySelector(selector);
    },
    getInlineTranslations() {
      return Array.from(document.querySelectorAll(`.${DOM_CONSTANTS.INLINE_TRANSLATION_CLASS}`)).map((node) => ({
        segmentId: node.getAttribute(DOM_CONSTANTS.SEGMENT_ATTRIBUTE),
        text: node.textContent.trim()
      }));
    },
    getMessageStatusText() {
      return document.querySelector(`.${DOM_CONSTANTS.MESSAGE_STATUS_CLASS}`)?.textContent || "";
    },
    setLiveBody(nextBody) {
      liveBody = nextBody;
    },
    setSegments(nextSegments) {
      currentSegments = nextSegments;
    }
  };
}

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

test("thread refresh starts body translation without waiting for a slow title translation", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Thread">
          <h1 id="thread-title">Subject</h1>
          <div class="v-Message">
            <div class="v-Message-body">
              <p id="line-1">Hello world</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => global.location.pathname
    });
    const i18n = createI18n({ navigator: { language: "en-US" } });
    const threadRoot = document.querySelector(".v-Thread");
    const title = document.querySelector("#thread-title");
    const body = document.querySelector(".v-Message-body");
    const line = document.querySelector("#line-1");
    const messageState = runtimeState.createMessageState({
      key: "thread-1::message-1",
      identity: "message::1",
      instanceId: "message-1"
    });
    const threadState = runtimeState.createThreadState();
    const descriptor = {
      key: messageState.key,
      state: messageState,
      body,
      contentRoot: body,
      messageNode: document.querySelector(".v-Message")
    };
    const titleRequest = createDeferredRequest();
    let bodyRequestCount = 0;
    threadState.root = threadRoot;
    runtimeState.activateThreadState(threadState);

    const app = createApp({
      defaults: DEFAULT_SETTINGS,
      diagnostics: {
        record() {},
        recordError() {}
      },
      document: global.document,
      i18n,
      policies: {
        hasTranslatableText() {
          return true;
        }
      },
      renderer: {
        clearMessageStatus() {},
        clearTitleTranslation() {},
        renderLoadingTranslations() {},
        renderMessageStatus() {},
        renderSegmentError() {},
        renderTitleTranslation() {},
        renderTranslatedSegments() {
          return { ok: true };
        }
      },
      requestRegistry: {
        register() {},
        release() {},
        cancelMany() {}
      },
      runtimeState,
      segmenter: {
        collectTranslatableSegments() {
          return [{ id: "segment-1", element: line, sourceElement: line, text: "Hello world" }];
        },
        getSegmentSignature() {
          return "segment-1";
        }
      },
      settingsModal: { open() {} },
      settingsStore: {
        async getSettings() {
          return { ...DEFAULT_SETTINGS };
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
          return title;
        },
        findLiveMessageElements() {
          return { body, contentRoot: body };
        },
        isMessageBodyDeferred() {
          return false;
        },
        getExistingThreadState(root) {
          return root === threadRoot ? threadState : null;
        }
      },
      translateService: {
        getLanguageDefinition() {
          return { id: "zh-CN", label: "简体中文", microsoft: "zh-Hans" };
        },
        translateSegments(segments) {
          if (segments[0] === "Subject") {
            return titleRequest.promise;
          }

          bodyRequestCount += 1;
          return createResolvedRequest({
            translatedSegments: segments.map((segmentText) => `译:${segmentText}`)
          });
        }
      }
    });

    const refreshPromise = app.refreshThread(threadRoot, threadState);
    await waitForTick();

    assert.equal(bodyRequestCount, 1);
    titleRequest.resolve({ translatedSegments: ["译:Subject"] });
    await refreshPromise;
  } finally {
    cleanup();
  }
});

test("thread refresh contains unexpected collector failures and records diagnostics instead of leaking rejections", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Thread"></div>
      </body>
    </html>
  `);

  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => {
    unhandledRejections.push(reason);
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const threadRoot = document.querySelector(".v-Thread");
    const runtimeState = createRuntimeState({
      getLocationKey: () => global.location.pathname
    });
    const threadState = runtimeState.createThreadState();
    threadState.root = threadRoot;
    runtimeState.activateThreadState(threadState);

    const recordedErrors = [];
    const boom = new Error("collector boom");
    const app = createApp({
      defaults: DEFAULT_SETTINGS,
      diagnostics: {
        record() {},
        recordError(event, error, payload) {
          recordedErrors.push({ event, error, payload });
        }
      },
      document: global.document,
      i18n: createI18n({ navigator: { language: "en-US" } }),
      policies: {
        hasTranslatableText() {
          return true;
        }
      },
      renderer: {
        clearThreadRenderArtifacts() {},
        clearTitleTranslation() {},
        hasThreadRenderArtifacts() {
          return false;
        }
      },
      requestRegistry: {
        register() {},
        release() {},
        cancelMany() {}
      },
      runtimeState,
      segmenter: {},
      settingsModal: { open() {} },
      settingsStore: {
        async getSettings() {
          return { ...DEFAULT_SETTINGS };
        }
      },
      threadDom: {
        syncThreadButtons() {},
        collectMessageDescriptors() {
          throw boom;
        },
        getExistingThreadState(root) {
          return root === threadRoot ? threadState : null;
        }
      },
      translateService: {
        getLanguageDefinition() {
          return { id: "zh-CN", label: "简体中文", microsoft: "zh-Hans" };
        }
      }
    });

    app.scheduleThreadRefresh(threadRoot, { immediate: true });
    await flushTimers();

    assert.deepEqual(unhandledRejections, []);
    assert.deepEqual(recordedErrors, [
      {
        event: "thread.refresh.unexpected-error",
        error: boom,
        payload: { threadKey: threadState.key }
      }
    ]);
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    cleanup();
  }
});

test("translate click contains unexpected settings-load failures and records diagnostics", async () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <button class="fmt-translate-button">Translate</button>
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
    const boom = new Error("settings unavailable");
    const recordedErrors = [];

    const app = createApp({
      defaults: DEFAULT_SETTINGS,
      diagnostics: {
        record() {},
        recordError(event, error, payload) {
          recordedErrors.push({ event, error, payload });
        }
      },
      document: global.document,
      i18n: createI18n({ navigator: { language: "en-US" } }),
      policies: {
        hasTranslatableText() {
          return true;
        }
      },
      renderer: {
        clearThreadRenderArtifacts() {},
        hasThreadRenderArtifacts() {
          return false;
        }
      },
      requestRegistry: {
        register() {},
        release() {},
        cancelMany() {}
      },
      runtimeState,
      segmenter: {},
      settingsModal: { open() {} },
      settingsStore: {
        async getSettings() {
          throw boom;
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
      }
    });

    await assert.doesNotReject(() => app.onTranslateClick({ currentTarget: button }));
    assert.deepEqual(recordedErrors, [
      {
        event: "ui.translate-click.unexpected-error",
        error: boom,
        payload: {}
      }
    ]);
  } finally {
    cleanup();
  }
});

test("message refresh clears stale inline translations when the live body disappears", async () => {
  const harness = createMessageRefreshHarness();

  try {
    const source = harness.getElement("#line-1");
    harness.setSegments([
      { id: "segment-1", element: source, sourceElement: source, text: "Hello world" }
    ]);

    await harness.app.refreshThread(harness.threadRoot, harness.threadState);
    assert.deepEqual(harness.getInlineTranslations(), [
      { segmentId: "segment-1", text: "译:Hello world" }
    ]);

    harness.setLiveBody(null);
    await harness.app.refreshThread(harness.threadRoot, harness.threadState);

    assert.deepEqual(harness.getInlineTranslations(), []);
    assert.equal(harness.messageState.status, "pending-body");
    assert.notEqual(harness.messageState.error, "");
    assert.notEqual(harness.getMessageStatusText(), "");
  } finally {
    harness.cleanup();
  }
});

test("message refresh clears stale inline translations when the live segment list becomes empty", async () => {
  const harness = createMessageRefreshHarness();

  try {
    const source = harness.getElement("#line-1");
    harness.setSegments([
      { id: "segment-1", element: source, sourceElement: source, text: "Hello world" }
    ]);

    await harness.app.refreshThread(harness.threadRoot, harness.threadState);
    assert.deepEqual(harness.getInlineTranslations(), [
      { segmentId: "segment-1", text: "译:Hello world" }
    ]);

    harness.setSegments([]);
    await harness.app.refreshThread(harness.threadRoot, harness.threadState);

    assert.deepEqual(harness.getInlineTranslations(), []);
    assert.equal(harness.messageState.status, "no-segments");
    assert.notEqual(harness.messageState.error, "");
    assert.notEqual(harness.getMessageStatusText(), "");
  } finally {
    harness.cleanup();
  }
});

test("message refresh prunes obsolete inline translations when the segment set shrinks", async () => {
  const harness = createMessageRefreshHarness();

  try {
    const firstLine = harness.getElement("#line-1");
    const secondLine = harness.getElement("#line-2");
    harness.setSegments([
      { id: "segment-1", element: firstLine, sourceElement: firstLine, text: "Hello world" },
      { id: "segment-2", element: secondLine, sourceElement: secondLine, text: "Second line" }
    ]);

    await harness.app.refreshThread(harness.threadRoot, harness.threadState);
    assert.deepEqual(harness.getInlineTranslations(), [
      { segmentId: "segment-1", text: "译:Hello world" },
      { segmentId: "segment-2", text: "译:Second line" }
    ]);

    harness.setSegments([
      { id: "segment-2", element: secondLine, sourceElement: secondLine, text: "Second line current" }
    ]);
    await harness.app.refreshThread(harness.threadRoot, harness.threadState);

    assert.deepEqual(harness.getInlineTranslations(), [
      { segmentId: "segment-2", text: "译:Second line current" }
    ]);
  } finally {
    harness.cleanup();
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
