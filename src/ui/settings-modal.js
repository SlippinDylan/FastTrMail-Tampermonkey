function createSettingsModal({
  constants,
  i18n,
  languages,
  providers,
  runtimeState,
  document = globalThis.document
}) {
  let overlay = null;
  let restoreFocusTarget = null;

  function isElement(node) {
    const HTMLElementCtor = document.defaultView?.HTMLElement || globalThis.HTMLElement;
    return typeof HTMLElementCtor === "function" && node instanceof HTMLElementCtor;
  }

  function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((node) => isElement(node) && !node.disabled);
  }

  function close() {
    if (!overlay) {
      return;
    }

    const node = overlay;
    const focusTarget = restoreFocusTarget;
    overlay = null;
    restoreFocusTarget = null;
    runtimeState.withObserverMuted(() => {
      node.remove();
    });

    if (isElement(focusTarget) && focusTarget.isConnected) {
      focusTarget.focus();
    }
  }

  function open({ currentSettings, onSave, currentTarget }) {
    close();

    let isSaving = false;
    restoreFocusTarget = isElement(currentTarget) ? currentTarget : document.activeElement;
    overlay = document.createElement("div");
    overlay.className = constants.MODAL_OVERLAY_CLASS;
    overlay.innerHTML = `
      <div class="${constants.MODAL_CLASS}" role="dialog" aria-modal="true" aria-label="${i18n.t("settings.title")}">
        <h2>${i18n.t("settings.title")}</h2>
        <label for="fmt-target-language">${i18n.t("settings.targetLanguage")}</label>
        <select id="fmt-target-language"></select>
        <label for="fmt-preferred-provider">${i18n.t("settings.preferredProvider")}</label>
        <select id="fmt-preferred-provider"></select>
        <p class="fmt-settings-modal-provider-notice">${i18n.t("settings.providerNotice")}</p>
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
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (!isSaving) {
          event.preventDefault();
          close();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(overlay);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
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
    overlay.addEventListener("keydown", handleKeyDown);
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
