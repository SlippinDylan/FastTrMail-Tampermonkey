const test = require("node:test");
const assert = require("node:assert/strict");

const { createI18n } = require("../src/ui/i18n.js");
const {
  registerDiagnosticsMenuCommand
} = require("../src/ui/menu-command.js");
const {
  createDiagnostics,
  createNoopDiagnostics
} = require("../src/diagnostics/diagnostics.js");
const { createDiagnosticsStore } = require("../src/diagnostics/store.js");
const { DOM_CONSTANTS } = require("../src/config/defaults.js");
const { createTranslationRenderer } = require("../src/ui/translation-renderer.js");
const { installDom } = require("./helpers/dom.js");

test("diagnostics logger stays silent while disabled and emits structured entries once enabled", () => {
  const calls = [];
  const diagnostics = createDiagnostics({
    enabled: false,
    now: () => 123,
    console: {
      info(...args) {
        calls.push(args);
      }
    }
  });

  diagnostics.record("edge-auth.request.start", { requestId: "auth-1" });
  assert.equal(calls.length, 0);
  assert.deepEqual(diagnostics.getEntries(), []);

  diagnostics.setEnabled(true);
  diagnostics.record("edge-auth.request.start", { requestId: "auth-2" });

  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], "[FastTrMail][diagnostics][edge-auth.request.start]");
  assert.equal(diagnostics.getEntries().length, 2);
  assert.equal(diagnostics.getEntries()[1].event, "edge-auth.request.start");
  assert.equal(diagnostics.getEntries()[1].requestId, "auth-2");
});

test("diagnostics logger records explicit state changes when disabling", () => {
  const calls = [];
  const diagnostics = createDiagnostics({
    enabled: true,
    now: () => 456,
    console: {
      info(...args) {
        calls.push(args);
      }
    }
  });

  diagnostics.setEnabled(false);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[FastTrMail][diagnostics][diagnostics.state.changed]");
  assert.equal(diagnostics.getEntries()[0].enabled, false);
  assert.equal(diagnostics.isEnabled(), false);
});

test("diagnostics store normalizes persisted values and toggles them", async () => {
  const writes = [];
  let persistedValue = "true";
  const store = createDiagnosticsStore({
    tmApi: {
      async getValue(key, fallback) {
        assert.equal(key, "diagnosticsEnabled");
        assert.equal(fallback, false);
        return persistedValue;
      },
      async setValue(key, value) {
        writes.push({ key, value });
        persistedValue = value;
      }
    }
  });

  assert.equal(await store.getEnabled(), true);
  assert.equal(await store.toggleEnabled(), false);
  assert.equal(await store.getEnabled(), false);
  assert.deepEqual(writes, [{ key: "diagnosticsEnabled", value: false }]);
});

test("diagnostics store toggleEnabled still works when the method is extracted from the store object", async () => {
  let persistedValue = true;
  const store = createDiagnosticsStore({
    tmApi: {
      async getValue() {
        return persistedValue;
      },
      async setValue(key, value) {
        void key;
        persistedValue = value;
      }
    }
  });
  const { toggleEnabled } = store;

  assert.equal(await toggleEnabled(), false);
  assert.equal(persistedValue, false);
});

test("diagnostics menu command toggles persisted state and the live diagnostics instance", async () => {
  let menuHandler = null;
  const diagnostics = createNoopDiagnostics();
  let enabledState = false;
  let setEnabledCalls = 0;
  diagnostics.isEnabled = () => enabledState;
  diagnostics.setEnabled = (nextValue) => {
    enabledState = nextValue;
    setEnabledCalls += 1;
  };

  registerDiagnosticsMenuCommand({
    tmApi: {
      registerMenuCommand(label, handler) {
        assert.equal(label, "FastTrMail 切换诊断日志");
        menuHandler = handler;
        return 1;
      }
    },
    i18n: createI18n({ navigator: { language: "zh-CN" } }),
    diagnosticsStore: {
      async toggleEnabled() {
        return true;
      }
    },
    diagnostics
  });

  await menuHandler();

  assert.equal(enabledState, true);
  assert.equal(setEnabledCalls, 1);
});

test("translation renderer ignores invalid bodies when removing inline translations", () => {
  const { cleanup } = installDom();

  try {
    const renderer = createTranslationRenderer({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      runtimeState: {
        withObserverMuted(fn) {
          return fn();
        }
      },
      segmenter: {
        getExistingSegmentAnchor() {
          return null;
        },
        ensureSegmentAnchor() {
          return null;
        }
      }
    });

    assert.doesNotThrow(() => renderer.removeInlineTranslations(null));
  } finally {
    cleanup();
  }
});
