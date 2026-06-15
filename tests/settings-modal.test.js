const test = require("node:test");
const assert = require("node:assert/strict");

const { DOM_CONSTANTS } = require("../src/config/defaults.js");
const { createI18n } = require("../src/ui/i18n.js");
const { createSettingsModal } = require("../src/ui/settings-modal.js");
const { createStyles } = require("../src/ui/styles.js");
const { installDom } = require("./helpers/dom.js");

test("settings modal renders provider selection and saves the complete settings payload", async () => {
  const { cleanup } = installDom();

  try {
    const savedPayloads = [];
    const runtimeState = {
      withObserverMuted(fn) {
        return fn();
      }
    };
    const modal = createSettingsModal({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      languages: [
        { id: "zh-CN", label: "简体中文" },
        { id: "en", label: "English" }
      ],
      providers: [
        { id: "edge-web", label: "Microsoft Edge（免 Key）" },
        { id: "google-web", label: "Google Web（实验性 / 免费）" }
      ],
      runtimeState,
      document: global.document
    });

    modal.open({
      currentSettings: {
        targetLanguage: "zh-CN",
        preferredProvider: "edge-web"
      },
      onSave(nextSettings) {
        savedPayloads.push(nextSettings);
      }
    });

    const selects = Array.from(document.querySelectorAll("select"));
    assert.equal(selects.length, 2);
    assert.equal(selects[0].value, "zh-CN");
    assert.equal(selects[1].value, "edge-web");
    assert.match(document.body.textContent, /优先翻译工具/);
    assert.match(document.body.textContent, /Google Web（实验性 \/ 免费）/);

    selects[0].value = "en";
    selects[1].value = "google-web";
    document.querySelector('button[data-variant="primary"]').click();

    assert.deepEqual(savedPayloads, [
      {
        targetLanguage: "en",
        preferredProvider: "google-web"
      }
    ]);
  } finally {
    cleanup();
  }
});

test("settings modal styles center footer actions", () => {
  const css = createStyles(DOM_CONSTANTS);

  assert.match(
    css,
    new RegExp(`\\.${DOM_CONSTANTS.MODAL_CLASS} footer\\s*\\{[^}]*justify-content:\\s*center;`, "m")
  );
  assert.match(
    css,
    new RegExp(`\\.${DOM_CONSTANTS.MODAL_CLASS} button\\s*\\{[^}]*justify-content:\\s*center;`, "m")
  );
});

test("settings modal resolves the target-language select by explicit id", () => {
  const { cleanup } = installDom();
  const selectors = [];
  const runtimeState = {
    withObserverMuted(fn) {
      return fn();
    }
  };
  const originalQuerySelector = global.HTMLElement.prototype.querySelector;

  global.HTMLElement.prototype.querySelector = function patchedQuerySelector(selector) {
    selectors.push(selector);
    return originalQuerySelector.call(this, selector);
  };

  try {
    const modal = createSettingsModal({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      languages: [{ id: "zh-CN", label: "简体中文" }],
      providers: [{ id: "edge-web", label: "Microsoft Edge（免 Key）" }],
      runtimeState,
      document: global.document
    });

    modal.open({
      currentSettings: {
        targetLanguage: "zh-CN",
        preferredProvider: "edge-web"
      },
      onSave() {}
    });

    assert.ok(selectors.includes("#fmt-target-language"));
  } finally {
    global.HTMLElement.prototype.querySelector = originalQuerySelector;
    cleanup();
  }
});

test("settings modal keeps the dialog open and shows an error when save fails", async () => {
  const { cleanup } = installDom();

  try {
    const runtimeState = {
      withObserverMuted(fn) {
        return fn();
      }
    };
    const modal = createSettingsModal({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      languages: [{ id: "zh-CN", label: "简体中文" }],
      providers: [{ id: "edge-web", label: "Microsoft Edge（免 Key）" }],
      runtimeState,
      document: global.document
    });

    modal.open({
      currentSettings: {
        targetLanguage: "zh-CN",
        preferredProvider: "edge-web"
      },
      async onSave() {
        throw new Error("保存失败");
      }
    });

    document.querySelector('button[data-variant="primary"]').click();
    await Promise.resolve();

    assert.ok(document.querySelector(`.${DOM_CONSTANTS.MODAL_OVERLAY_CLASS}`));
    assert.match(document.body.textContent, /保存失败/);
  } finally {
    cleanup();
  }
});

test("settings modal prevents concurrent saves while a save is pending", async () => {
  const { cleanup } = installDom();

  try {
    let resolveSave;
    let saveCalls = 0;
    const runtimeState = {
      withObserverMuted(fn) {
        return fn();
      }
    };
    const modal = createSettingsModal({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      languages: [{ id: "zh-CN", label: "简体中文" }],
      providers: [{ id: "edge-web", label: "Microsoft Edge（免 Key）" }],
      runtimeState,
      document: global.document
    });

    modal.open({
      currentSettings: {
        targetLanguage: "zh-CN",
        preferredProvider: "edge-web"
      },
      onSave() {
        saveCalls += 1;
        return new Promise((resolve) => {
          resolveSave = resolve;
        });
      }
    });

    const cancelButton = document.querySelector('button[data-variant="secondary"]');
    const saveButton = document.querySelector('button[data-variant="primary"]');
    const selects = Array.from(document.querySelectorAll("select"));
    saveButton.click();
    saveButton.click();

    assert.equal(saveCalls, 1);
    assert.equal(saveButton.disabled, true);
    assert.equal(cancelButton.disabled, true);
    assert.equal(selects.every((select) => select.disabled), true);

    resolveSave();
    await Promise.resolve();

    assert.equal(document.querySelector(`.${DOM_CONSTANTS.MODAL_OVERLAY_CLASS}`), null);
  } finally {
    cleanup();
  }
});

test("settings modal re-enables actions after save failure", async () => {
  const { cleanup } = installDom();

  try {
    const runtimeState = {
      withObserverMuted(fn) {
        return fn();
      }
    };
    const modal = createSettingsModal({
      constants: DOM_CONSTANTS,
      i18n: createI18n({ navigator: { language: "zh-CN" } }),
      languages: [{ id: "zh-CN", label: "简体中文" }],
      providers: [{ id: "edge-web", label: "Microsoft Edge（免 Key）" }],
      runtimeState,
      document: global.document
    });

    modal.open({
      currentSettings: {
        targetLanguage: "zh-CN",
        preferredProvider: "edge-web"
      },
      async onSave() {
        throw new Error("保存失败");
      }
    });

    const cancelButton = document.querySelector('button[data-variant="secondary"]');
    const saveButton = document.querySelector('button[data-variant="primary"]');
    const selects = Array.from(document.querySelectorAll("select"));
    saveButton.click();
    await Promise.resolve();

    assert.equal(saveButton.disabled, false);
    assert.equal(cancelButton.disabled, false);
    assert.equal(selects.every((select) => select.disabled === false), true);
  } finally {
    cleanup();
  }
});
