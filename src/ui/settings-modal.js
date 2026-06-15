function createSettingsModal({
  constants,
  i18n,
  languages,
  providers,
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

  function open({ currentSettings, onSave }) {
    close();

    let isSaving = false;
    overlay = document.createElement("div");
    overlay.className = constants.MODAL_OVERLAY_CLASS;
    overlay.innerHTML = `
      <div class="${constants.MODAL_CLASS}" role="dialog" aria-modal="true" aria-label="${i18n.t("settings.title")}">
        <h2>${i18n.t("settings.title")}</h2>
        <label for="fmt-target-language">${i18n.t("settings.targetLanguage")}</label>
        <select id="fmt-target-language"></select>
        <label for="fmt-preferred-provider">${i18n.t("settings.preferredProvider")}</label>
        <select id="fmt-preferred-provider"></select>
        <div class="fmt-settings-modal-error" aria-live="polite"></div>
        <footer>
          <button type="button" data-variant="secondary">${i18n.t("settings.cancel")}</button>
          <button type="button" data-variant="primary">${i18n.t("settings.save")}</button>
        </footer>
      </div>
    `;

    const select = overlay.querySelector("#fmt-target-language");
    const providerSelect = overlay.querySelector("#fmt-preferred-provider");
    const errorNode = overlay.querySelector(".fmt-settings-modal-error");
    const cancelButton = overlay.querySelector('button[data-variant="secondary"]');
    const saveButton = overlay.querySelector('button[data-variant="primary"]');
    const syncPendingState = () => {
      select.disabled = isSaving;
      providerSelect.disabled = isSaving;
      cancelButton.disabled = isSaving;
      saveButton.disabled = isSaving;
    };

    for (const language of languages) {
      const option = document.createElement("option");
      option.value = language.id;
      option.textContent = language.label;
      option.selected = language.id === currentSettings?.targetLanguage;
      select.appendChild(option);
    }

    for (const provider of providers) {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.label;
      option.selected = provider.id === currentSettings?.preferredProvider;
      providerSelect.appendChild(option);
    }

    overlay.addEventListener("click", (event) => {
      if (isSaving) {
        return;
      }
      if (event.target === overlay) {
        close();
      }
    });
    cancelButton.addEventListener("click", () => {
      if (isSaving) {
        return;
      }
      close();
    });
    saveButton.addEventListener("click", async () => {
      if (isSaving) {
        return;
      }

      isSaving = true;
      syncPendingState();

      if (errorNode instanceof globalThis.HTMLElement) {
        errorNode.textContent = "";
      }

      try {
        await onSave({
          targetLanguage: select.value,
          preferredProvider: providerSelect.value
        });
        close();
      } catch (error) {
        if (errorNode instanceof globalThis.HTMLElement) {
          errorNode.textContent = typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : i18n.t("settings.saveFailed");
        }
      } finally {
        isSaving = false;
        if (overlay) {
          syncPendingState();
        }
      }
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
