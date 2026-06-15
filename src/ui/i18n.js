const MESSAGES = Object.freeze({
  zh: Object.freeze({
    "content.translate": "翻译",
    "content.restoreOriginal": "恢复原文",
    "content.loading": "翻译中…",
    "content.bodyNotFound": "邮件正文尚未加载完成。",
    "content.noSegments": "没有可翻译的内容。",
    "content.translationFailed": "翻译失败。",
    "content.titleTranslationFailed": "标题翻译失败。",
    "content.titleTranslationEmpty": "标题翻译结果为空。",
    "diagnostics.toggleMenu": "FastTrMail 切换诊断日志",
    "settings.menu": "FastTrMail 设置",
    "settings.title": "FastTrMail 设置",
    "settings.targetLanguage": "目标语言",
    "settings.preferredProvider": "优先翻译工具",
    "settings.save": "保存",
    "settings.cancel": "取消",
    "settings.saved": "设置已保存。",
    "settings.saveFailed": "保存失败。",
    "settings.providerNotice": "免 Key 翻译接口可能变更或失效；上线使用时建议保留备用 provider。",
    "providers.edge-web": "Microsoft Edge（免 Key）",
    "providers.google-web": "Google Web（实验性 / 免费）"
  }),
  en: Object.freeze({
    "content.translate": "Translate",
    "content.restoreOriginal": "Restore",
    "content.loading": "Translating…",
    "content.bodyNotFound": "Message body has not loaded yet.",
    "content.noSegments": "No translatable content was found.",
    "content.translationFailed": "Translation failed.",
    "content.titleTranslationFailed": "Subject translation failed.",
    "content.titleTranslationEmpty": "Subject translation was empty.",
    "diagnostics.toggleMenu": "Toggle FastTrMail Diagnostics",
    "settings.menu": "FastTrMail Settings",
    "settings.title": "FastTrMail Settings",
    "settings.targetLanguage": "Target language",
    "settings.preferredProvider": "Preferred translator",
    "settings.save": "Save",
    "settings.cancel": "Cancel",
    "settings.saved": "Settings saved.",
    "settings.saveFailed": "Failed to save settings.",
    "settings.providerNotice": "No-key translation endpoints may change or stop working; keep a fallback provider available for production use.",
    "providers.edge-web": "Microsoft Edge (No Key)",
    "providers.google-web": "Google Web (Experimental / Free)"
  })
});

function normalizeLocale(language) {
  return String(language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function createI18n({ navigator = globalThis.navigator } = {}) {
  const locale = normalizeLocale(navigator?.language);

  return {
    locale,
    t(key, replacements = null, overrideLocale = locale) {
      const dictionary = MESSAGES[normalizeLocale(overrideLocale)] || MESSAGES.en;
      let message = dictionary[key] || MESSAGES.en[key] || key;

      if (replacements && typeof replacements === "object") {
        for (const [name, value] of Object.entries(replacements)) {
          message = message.replaceAll(`{${name}}`, String(value));
        }
      }

      return message;
    }
  };
}

module.exports = { createI18n, normalizeLocale };
