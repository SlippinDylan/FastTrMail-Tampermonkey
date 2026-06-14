const MAX_ENTRY_COUNT = 200;
const MAX_STRING_LENGTH = 160;

function createNoopDiagnostics() {
  return {
    isEnabled() {
      return false;
    },
    setEnabled() {},
    record() {},
    recordError() {},
    getEntries() {
      return [];
    }
  };
}

function createDiagnostics({
  enabled = false,
  maxEntries = MAX_ENTRY_COUNT,
  now = Date.now,
  console = globalThis.console
} = {}) {
  let isEnabled = Boolean(enabled);
  let sequence = 0;
  const entries = [];

  function pushEntry(entry) {
    entries.push(entry);
    if (entries.length > maxEntries) {
      entries.shift();
    }
  }

  function trimString(value) {
    if (typeof value !== "string" || value.length <= MAX_STRING_LENGTH) {
      return value;
    }

    return `${value.slice(0, MAX_STRING_LENGTH)}…`;
  }

  function sanitizeValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item));
    }

    if (!value || typeof value !== "object") {
      return trimString(value);
    }

    const output = {};
    for (const [key, entryValue] of Object.entries(value)) {
      output[key] = sanitizeValue(entryValue);
    }
    return output;
  }

  function summarizeError(error) {
    return sanitizeValue({
      code: typeof error?.code === "string" ? error.code : "",
      message: typeof error?.message === "string" ? error.message : String(error || ""),
      name: typeof error?.name === "string" ? error.name : "",
      status: typeof error?.status === "number" ? error.status : undefined,
      statusText: typeof error?.statusText === "string" ? error.statusText : undefined,
      metadata: error?.metadata && typeof error.metadata === "object" ? error.metadata : undefined
    });
  }

  function record(event, payload = {}) {
    if (!isEnabled) {
      return null;
    }

    return emit(event, payload);
  }

  function emit(event, payload = {}) {
    const entry = {
      sequence: sequence + 1,
      timestamp: now(),
      event,
      ...sanitizeValue(payload)
    };
    sequence += 1;
    pushEntry(entry);
    console?.info?.(`[FastTrMail][diagnostics][${event}]`, entry);
      return entry;
  }

  function recordError(event, error, payload = {}) {
    return record(event, {
      ...payload,
      error: summarizeError(error)
    });
  }

  return {
    isEnabled() {
      return isEnabled;
    },
    setEnabled(nextValue) {
      const nextEnabled = Boolean(nextValue);
      if (nextEnabled === isEnabled) {
        return nextEnabled;
      }

      isEnabled = nextEnabled;
      emit("diagnostics.state.changed", {
        enabled: nextEnabled
      });
      return nextEnabled;
    },
    record,
    recordError,
    getEntries() {
      return entries.slice();
    }
  };
}

module.exports = {
  createDiagnostics,
  createNoopDiagnostics
};
