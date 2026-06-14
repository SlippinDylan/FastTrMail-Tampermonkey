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

module.exports = {
  registerSettingsMenuCommand,
  registerDiagnosticsMenuCommand
};
