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
