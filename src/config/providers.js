function freezeProviderDefinition(definition) {
  return Object.freeze({ ...definition });
}

module.exports = {
  PROVIDER_DEFINITIONS: Object.freeze([
    freezeProviderDefinition({ id: "edge-web" }),
    freezeProviderDefinition({ id: "google-web" })
  ])
};
