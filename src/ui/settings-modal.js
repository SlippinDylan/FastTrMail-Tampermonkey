function createSettingsModal({
  constants,
  i18n,
  languages,
  runtimeState,
  document = globalThis.document
}) {
  let overlay = null;

  function close() {
    if (!overlay) {
      return;
    }

    const node = overlay;
    overlay = null;
    runtimeState.withObserverMuted(() => {
      node.remove();
    });
  }

  function open({ currentValue, onSave }) {
    close();

    overlay = document.createElement("div");
    overlay.className = constants.MODAL_OVERLAY_CLASS;
    overlay.innerHTML = `
      <div class="${constants.MODAL_CLASS}" role="dialog" aria-modal="true" aria-label="${i18n.t("settings.title")}">
        <h2>${i18n.t("settings.title")}</h2>
        <label for="fmt-target-language">${i18n.t("settings.targetLanguage")}</label>
        <select id="fmt-target-language"></select>
        <footer>
          <button type="button" data-variant="secondary">${i18n.t("settings.cancel")}</button>
          <button type="button" data-variant="primary">${i18n.t("settings.save")}</button>
        </footer>
      </div>
    `;

    const select = overlay.querySelector("select");
    const cancelButton = overlay.querySelector('button[data-variant="secondary"]');
    const saveButton = overlay.querySelector('button[data-variant="primary"]');

    for (const language of languages) {
      const option = document.createElement("option");
      option.value = language.id;
      option.textContent = language.label;
      option.selected = language.id === currentValue;
      select.appendChild(option);
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    cancelButton.addEventListener("click", () => close());
    saveButton.addEventListener("click", async () => {
      await onSave(select.value);
      close();
    });

    runtimeState.withObserverMuted(() => {
      document.body.appendChild(overlay);
    });
    select.focus();
  }

  return {
    close,
    open
  };
}

module.exports = { createSettingsModal };
