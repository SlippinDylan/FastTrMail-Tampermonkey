const MENU_COMMAND_REGISTRY_KEY = "__fastTrMailTampermonkeyMenuCommands__";
const DEFAULT_SCRIPT_KEY = "fasttrmail-tampermonkey";

function getRegistryScope(scope) {
  if (scope && (typeof scope === "object" || typeof scope === "function")) {
    return scope;
  }

  return globalThis;
}

function getRegisteredMenuCommands(scope, scriptKey) {
  const registryScope = getRegistryScope(scope);
  if (!registryScope[MENU_COMMAND_REGISTRY_KEY]) {
    registryScope[MENU_COMMAND_REGISTRY_KEY] = new Map();
  }

  const registriesByScript = registryScope[MENU_COMMAND_REGISTRY_KEY];
  const resolvedScriptKey = scriptKey || DEFAULT_SCRIPT_KEY;
  if (!registriesByScript.has(resolvedScriptKey)) {
    registriesByScript.set(resolvedScriptKey, new Map());
  }

  return registriesByScript.get(resolvedScriptKey);
}

function wrapAsyncMenuHandler(handler, { diagnostics, event }) {
  return (...args) => {
    try {
      const result = handler(...args);
      if (result && typeof result.then === "function") {
        return result.catch((error) => {
          diagnostics?.recordError?.(event, error, {});
        });
      }
      return result;
    } catch (error) {
      diagnostics?.recordError?.(event, error, {});
      return undefined;
    }
  };
}

function registerSettingsMenuCommand({ tmApi, i18n, onClick, diagnostics }) {
  return tmApi.registerMenuCommand(
    i18n.t("settings.menu"),
    wrapAsyncMenuHandler(onClick, {
      diagnostics,
      event: "ui.settings.menu.unexpected-error"
    })
  );
}

function registerDiagnosticsMenuCommand({ tmApi, i18n, diagnosticsStore, diagnostics }) {
  const menuLabel = i18n.t("diagnostics.toggleMenu");

  return tmApi.registerMenuCommand(
    menuLabel,
    wrapAsyncMenuHandler(async () => {
      const nextEnabled = await diagnosticsStore.toggleEnabled();
      diagnostics?.setEnabled?.(nextEnabled);
    }, {
      diagnostics,
      event: "ui.diagnostics.menu.unexpected-error"
    })
  );
}

function createMenuCommandRegistry({ tmApi, scope = globalThis, scriptKey = DEFAULT_SCRIPT_KEY }) {
  let activeKey = null;
  const registeredMenuCommands = getRegisteredMenuCommands(scope, scriptKey);

  function registerMenuCommand(label, handler) {
    if (!activeKey) {
      return tmApi.registerMenuCommand(label, handler);
    }

    const existing = registeredMenuCommands.get(activeKey);
    if (existing) {
      existing.label = label;
      existing.handler = handler;
      return existing.commandId;
    }

    const entry = {
      label,
      handler,
      commandId: 0
    };
    entry.commandId = tmApi.registerMenuCommand(label, (...args) => entry.handler(...args));
    registeredMenuCommands.set(activeKey, entry);
    return entry.commandId;
  }

  return {
    tmApi: {
      ...tmApi,
      registerMenuCommand
    },
    ensure(key, register) {
      activeKey = key;
      try {
        return register();
      } finally {
        activeKey = null;
      }
    }
  };
}

module.exports = {
  createMenuCommandRegistry,
  wrapAsyncMenuHandler,
  registerSettingsMenuCommand,
  registerDiagnosticsMenuCommand
};
