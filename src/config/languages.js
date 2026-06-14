function freezeLanguageDefinition(definition) {
  return Object.freeze({ ...definition });
}

module.exports = {
  LANGUAGE_DEFINITIONS: Object.freeze([
    freezeLanguageDefinition({ id: "zh-CN", label: "简体中文", microsoft: "zh-Hans", google: "zh-CN" }),
    freezeLanguageDefinition({ id: "zh-TW", label: "繁體中文", microsoft: "zh-Hant", google: "zh-TW" }),
    freezeLanguageDefinition({ id: "en", label: "English", microsoft: "en", google: "en" }),
    freezeLanguageDefinition({ id: "ja", label: "日本語", microsoft: "ja", google: "ja" })
  ])
};
