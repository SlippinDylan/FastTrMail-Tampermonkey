function registerSettingsMenuCommand({ tmApi, i18n, onClick }) {
  return tmApi.registerMenuCommand(i18n.t("settings.menu"), onClick);
}

module.exports = { registerSettingsMenuCommand };
