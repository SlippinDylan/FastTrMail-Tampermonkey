const { DEFAULT_SETTINGS, DOM_CONSTANTS } = require("../config/defaults.js");
const { LANGUAGE_DEFINITIONS } = require("../config/languages.js");
const { createRuntimeState } = require("../core/runtime-state.js");
const { createApp } = require("../core/app.js");
const { createLifecycle } = require("../core/lifecycle.js");
const { createSegmenter } = require("../fastmail/segmenter.js");
const pageLocator = require("../fastmail/page-locator.js");
const { createThreadDom } = require("../fastmail/thread-dom.js");
const textPolicies = require("../fastmail/text-policies.js");
const { createTmApi } = require("../platform/tm-api.js");
const { createXhr } = require("../platform/xhr.js");
const { createSettingsStore } = require("../storage/settings-store.js");
const { createEdgeAuth } = require("../translation/edge-auth.js");
const { createEdgeTranslator } = require("../translation/edge-translator.js");
const { createRequestRegistry } = require("../translation/request-registry.js");
const { createTranslateService } = require("../translation/translate-service.js");
const { createI18n } = require("../ui/i18n.js");
const { registerSettingsMenuCommand } = require("../ui/menu-command.js");
const { createSettingsModal } = require("../ui/settings-modal.js");
const { createStyles } = require("../ui/styles.js");
const toolbarButtonApi = require("../ui/toolbar-button.js");
const { createTranslationRenderer } = require("../ui/translation-renderer.js");

const BOOTSTRAP_KEY = "__fastTrMailTampermonkeyBootstrap__";
const BOOTSTRAP_RETRY_KEY = "__fastTrMailTampermonkeyBootstrapRetries__";
const MAX_BOOTSTRAP_RETRIES = 3;

function ensureStyles(document, constants) {
  if (document.head.querySelector(`style[${constants.STYLES_ATTRIBUTE}]`)) {
    return;
  }

  const style = document.createElement("style");
  style.setAttribute(constants.STYLES_ATTRIBUTE, "true");
  style.textContent = createStyles(constants);
  document.head.appendChild(style);
}

async function bootstrap() {
  if (globalThis[BOOTSTRAP_KEY] === "ready" || globalThis[BOOTSTRAP_KEY] === "booting") {
    return;
  }

  if (!pageLocator.isFastmailUrl(globalThis.location)) {
    return;
  }

  globalThis[BOOTSTRAP_KEY] = "booting";

  try {
    const tmApi = createTmApi(globalThis);
    const xhr = createXhr({ tmApi });
    const settingsStore = createSettingsStore({
      tmApi,
      defaults: DEFAULT_SETTINGS,
      languages: LANGUAGE_DEFINITIONS
    });
    const edgeAuth = createEdgeAuth({ xhr });
    const edgeTranslator = createEdgeTranslator({ edgeAuth, xhr });
    const translateService = createTranslateService({
      edgeTranslator,
      languages: LANGUAGE_DEFINITIONS
    });
    const i18n = createI18n();
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(globalThis.location)
    });
    const requestRegistry = createRequestRegistry();
    const segmenter = createSegmenter({
      constants: DOM_CONSTANTS,
      policies: textPolicies,
      runtimeState
    });
    const threadDom = createThreadDom({
      constants: DOM_CONSTANTS,
      i18n,
      pageLocator,
      policies: textPolicies,
      runtimeState,
      segmenter,
      toolbarButtonApi
    });
    const renderer = createTranslationRenderer({
      constants: DOM_CONSTANTS,
      i18n,
      runtimeState,
      segmenter
    });
    const settingsModal = createSettingsModal({
      constants: DOM_CONSTANTS,
      i18n,
      languages: LANGUAGE_DEFINITIONS,
      runtimeState
    });
    const app = createApp({
      defaults: DEFAULT_SETTINGS,
      document: globalThis.document,
      i18n,
      policies: textPolicies,
      renderer,
      requestRegistry,
      runtimeState,
      segmenter,
      settingsModal,
      settingsStore,
      threadDom,
      translateService
    });
    const lifecycle = createLifecycle({
      app,
      constants: DOM_CONSTANTS,
      document: globalThis.document,
      runtimeState,
      threadDom
    });

    ensureStyles(globalThis.document, DOM_CONSTANTS);
    registerSettingsMenuCommand({
      tmApi,
      i18n,
      onClick: () => {
        void app.openSettings();
      }
    });
    await app.ensureTargetLanguageId();
    lifecycle.initialize();
    globalThis[BOOTSTRAP_KEY] = "ready";
    globalThis[BOOTSTRAP_RETRY_KEY] = 0;
  } catch (error) {
    globalThis[BOOTSTRAP_KEY] = "idle";
    const retryCount = Number(globalThis[BOOTSTRAP_RETRY_KEY] || 0) + 1;
    globalThis[BOOTSTRAP_RETRY_KEY] = retryCount;
    console.error("[FastTrMail] bootstrap failed", error);

    if (retryCount < MAX_BOOTSTRAP_RETRIES) {
      globalThis.setTimeout(() => {
        void bootstrap();
      }, retryCount * 1000);
    }
  }
}

if (globalThis.document?.readyState === "loading") {
  globalThis.document.addEventListener("DOMContentLoaded", () => {
    void bootstrap();
  }, { once: true });
} else {
  void bootstrap();
}
