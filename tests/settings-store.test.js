const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_SETTINGS } = require("../src/config/defaults.js");
const { LANGUAGE_DEFINITIONS } = require("../src/config/languages.js");
const { createTmApi } = require("../src/platform/tm-api.js");
const { createSettingsStore } = require("../src/storage/settings-store.js");

test("settings store repairs unsupported persisted targetLanguage values back into storage", async () => {
  const calls = [];
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        calls.push({ key, fallback });
        if (key === "settings") {
          return {
            targetLanguage: "unsupported",
            preferredProvider: "edge-web"
          };
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const value = await store.getTargetLanguage();

  assert.equal(value, "zh-CN");
  assert.deepEqual(calls, [{ key: "settings", fallback: undefined }]);
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "zh-CN",
      preferredProvider: "edge-web"
    }
  }]);
});

test("settings store repairs unsupported persisted preferredProvider values back into storage", async () => {
  const calls = [];
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        calls.push({ key, fallback });
        if (key === "settings") {
          return {
            targetLanguage: "en",
            preferredProvider: "unsupported"
          };
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const value = await store.getPreferredProvider();

  assert.equal(value, "edge-web");
  assert.deepEqual(calls, [{ key: "settings", fallback: undefined }]);
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "en",
      preferredProvider: "edge-web"
    }
  }]);
});

test("settings store persists supported targetLanguage values only and returns the normalized value", async () => {
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        if (key === "settings") {
          return {
            targetLanguage: "zh-CN",
            preferredProvider: "edge-web"
          };
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const value = await store.setTargetLanguage("en");

  assert.equal(value, "en");
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "en",
      preferredProvider: "edge-web"
    }
  }]);
});

test("settings store normalizes unsupported targetLanguage values on write", async () => {
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        if (key === "settings") {
          return {
            targetLanguage: "zh-CN",
            preferredProvider: "edge-web"
          };
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const value = await store.setTargetLanguage("unsupported");

  assert.equal(value, "zh-CN");
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "zh-CN",
      preferredProvider: "edge-web"
    }
  }]);
});

test("settings store persists supported preferredProvider values only and returns the normalized value", async () => {
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        if (key === "settings") {
          return {
            targetLanguage: "zh-CN",
            preferredProvider: "edge-web"
          };
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const value = await store.setPreferredProvider("google-web");

  assert.equal(value, "google-web");
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "zh-CN",
      preferredProvider: "google-web"
    }
  }]);
});

test("settings store persists a canonical snapshot in one write when saving multiple fields", async () => {
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(_key, fallback) {
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const value = await store.setSettings({
    targetLanguage: "en",
    preferredProvider: "google-web"
  });

  assert.deepEqual(value, {
    targetLanguage: "en",
    preferredProvider: "google-web"
  });
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "en",
      preferredProvider: "google-web"
    }
  }]);
});

test("settings store rebuilds the canonical snapshot from legacy keys when the snapshot is missing", async () => {
  const writes = [];
  const calls = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        calls.push({ key, fallback });
        if (key === "settings") {
          return undefined;
        }
        if (key === "targetLanguage") {
          return "en";
        }
        if (key === "preferredProvider") {
          return "google-web";
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const settings = await store.getSettings();

  assert.deepEqual(settings, {
    targetLanguage: "en",
    preferredProvider: "google-web"
  });
  assert.deepEqual(calls, [
    { key: "settings", fallback: undefined },
    { key: "targetLanguage", fallback: "zh-CN" },
    { key: "preferredProvider", fallback: "edge-web" }
  ]);
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "en",
      preferredProvider: "google-web"
    }
  }]);
});

test("settings store ignores malformed snapshot payloads and repairs them from normalized values", async () => {
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        if (key === "settings") {
          return "broken";
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "en" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const settings = await store.getSettings();

  assert.deepEqual(settings, {
    targetLanguage: "zh-CN",
    preferredProvider: "edge-web"
  });
  assert.deepEqual(writes, [{
    key: "settings",
    value: {
      targetLanguage: "zh-CN",
      preferredProvider: "edge-web"
    }
  }]);
});

test("settings store returns normalized multi-field settings snapshot", async () => {
  const writes = [];
  const store = createSettingsStore({
    tmApi: {
      async getValue(key, fallback) {
        if (key === "settings") {
          return {
            targetLanguage: "ja",
            preferredProvider: "edge-web"
          };
        }
        return fallback;
      },
      async setValue(key, value) {
        writes.push({ key, value });
      }
    },
    defaults: { targetLanguage: "zh-CN", preferredProvider: "edge-web" },
    languages: [{ id: "zh-CN" }, { id: "ja" }],
    providers: [{ id: "edge-web" }, { id: "google-web" }]
  });

  const settings = await store.getSettings();

  assert.deepEqual(settings, {
    targetLanguage: "ja",
    preferredProvider: "edge-web"
  });
  assert.deepEqual(writes, []);
});

test("settings store rejects invalid configuration when default targetLanguage is unsupported", () => {
  assert.throws(
    () =>
      createSettingsStore({
        tmApi: {
          getValue() {},
          setValue() {}
        },
        defaults: { targetLanguage: "fr", preferredProvider: "edge-web" },
        languages: [{ id: "zh-CN" }, { id: "en" }],
        providers: [{ id: "edge-web" }, { id: "google-web" }]
      }),
    /defaults\.targetLanguage/
  );
});

test("settings store rejects invalid configuration when default preferredProvider is unsupported", () => {
  assert.throws(
    () =>
      createSettingsStore({
        tmApi: {
          getValue() {},
          setValue() {}
        },
        defaults: { targetLanguage: "zh-CN", preferredProvider: "unsupported" },
        languages: [{ id: "zh-CN" }, { id: "en" }],
        providers: [{ id: "edge-web" }, { id: "google-web" }]
      }),
    /defaults\.preferredProvider/
  );
});

test("tm api validates required GM capabilities up front", () => {
  assert.throws(
    () => createTmApi({}),
    /Missing Tampermonkey capability: GM_getValue/
  );
});

test("language definitions are deep frozen entry objects", () => {
  assert.ok(Object.isFrozen(LANGUAGE_DEFINITIONS));
  assert.ok(Object.isFrozen(LANGUAGE_DEFINITIONS[0]));
  assert.throws(() => {
    Object.defineProperty(LANGUAGE_DEFINITIONS[0], "id", { value: "mutated" });
  });
});

test("default settings remain aligned with supported language definitions", () => {
  const supportedIds = new Set(LANGUAGE_DEFINITIONS.map((item) => item.id));

  assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
  assert.ok(supportedIds.has(DEFAULT_SETTINGS.targetLanguage));
  assert.equal(typeof DEFAULT_SETTINGS.preferredProvider, "string");
});
