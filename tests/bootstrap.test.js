const test = require("node:test");
const assert = require("node:assert/strict");

const { createI18n } = require("../src/ui/i18n.js");
const {
  createMenuCommandRegistry,
  registerDiagnosticsMenuCommand,
  registerSettingsMenuCommand
} = require("../src/ui/menu-command.js");

test("menu command registry registers each bootstrap menu command only once across retries", async () => {
  assert.equal(typeof createMenuCommandRegistry, "function");

  const registrations = [];
  const registry = createMenuCommandRegistry({
    tmApi: {
      registerMenuCommand(label, handler) {
        registrations.push({ label, handler });
        return registrations.length;
      }
    }
  });
  const i18n = createI18n({ navigator: { language: "zh-CN" } });

  registry.ensure("settings", () => registerSettingsMenuCommand({
    tmApi: registry.tmApi,
    i18n,
    onClick() {}
  }));
  registry.ensure("diagnostics", () => registerDiagnosticsMenuCommand({
    tmApi: registry.tmApi,
    i18n,
    diagnostics: { setEnabled() {} },
    diagnosticsStore: {
      async toggleEnabled() {
        return true;
      }
    }
  }));

  registry.ensure("settings", () => registerSettingsMenuCommand({
    tmApi: registry.tmApi,
    i18n,
    onClick() {}
  }));
  registry.ensure("diagnostics", () => registerDiagnosticsMenuCommand({
    tmApi: registry.tmApi,
    i18n,
    diagnostics: { setEnabled() {} },
    diagnosticsStore: {
      async toggleEnabled() {
        return true;
      }
    }
  }));

  assert.deepEqual(
    registrations.map((entry) => entry.label),
    ["FastTrMail 设置", "FastTrMail 切换诊断日志"]
  );
});

test("menu command registry keeps a single registration but dispatches to the latest handler after retry", async () => {
  const registrations = [];
  const registry = createMenuCommandRegistry({
    tmApi: {
      registerMenuCommand(label, handler) {
        registrations.push({ label, handler });
        return registrations.length;
      }
    }
  });
  const i18n = createI18n({ navigator: { language: "zh-CN" } });
  const calls = [];

  registry.ensure("settings-latest-handler", () => registerSettingsMenuCommand({
    tmApi: registry.tmApi,
    i18n,
    onClick() {
      calls.push("first");
    }
  }));

  registry.ensure("settings-latest-handler", () => registerSettingsMenuCommand({
    tmApi: registry.tmApi,
    i18n,
    onClick() {
      calls.push("second");
    }
  }));

  assert.equal(registrations.length, 1);
  registrations[0].handler();
  assert.deepEqual(calls, ["second"]);
});
