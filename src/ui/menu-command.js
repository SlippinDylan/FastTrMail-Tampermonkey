const registeredMenuCommands = new Map();

function registerSettingsMenuCommand({ tmApi, i18n, onClick }) {
  return tmApi.registerMenuCommand(i18n.t("settings.menu"), onClick);
}

function registerDiagnosticsMenuCommand({ tmApi, i18n, diagnosticsStore, diagnostics }) {
  const menuLabel = i18n.t("diagnostics.toggleMenu");

  return tmApi.registerMenuCommand(menuLabel, async () => {
    const nextEnabled = await diagnosticsStore.toggleEnabled();
    diagnostics?.setEnabled?.(nextEnabled);
  });
}

function createMenuCommandRegistry({ tmApi }) {
  let activeKey = null;

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
  registerSettingsMenuCommand,
  registerDiagnosticsMenuCommand
};
