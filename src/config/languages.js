function freezeLanguageDefinition(definition) {
  return Object.freeze({ ...definition });
}

module.exports = {
  LANGUAGE_DEFINITIONS: Object.freeze([
    freezeLanguageDefinition({ id: "zh-CN", label: "简体中文", microsoft: "zh-Hans" }),
    freezeLanguageDefinition({ id: "zh-TW", label: "繁體中文", microsoft: "zh-Hant" }),
    freezeLanguageDefinition({ id: "en", label: "English", microsoft: "en" }),
    freezeLanguageDefinition({ id: "ja", label: "日本語", microsoft: "ja" })
  ])
};
