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
    "settings.menu": "FastTrMail 设置",
    "settings.title": "FastTrMail 设置",
    "settings.targetLanguage": "目标语言",
    "settings.save": "保存",
    "settings.cancel": "取消",
    "settings.saved": "设置已保存。"
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
    "settings.menu": "FastTrMail Settings",
    "settings.title": "FastTrMail Settings",
    "settings.targetLanguage": "Target language",
    "settings.save": "Save",
    "settings.cancel": "Cancel",
    "settings.saved": "Settings saved."
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
