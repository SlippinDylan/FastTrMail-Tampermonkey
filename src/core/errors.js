const ERROR_CODES = Object.freeze({
  EDGE_AUTH_FAILED: "edge_auth_failed",
  EDGE_TRANSLATE_FAILED: "edge_translate_failed",
  UNSUPPORTED_TARGET_LANGUAGE: "unsupported_target_language",
  TRANSLATION_CANCELLED: "translation_cancelled"
});

function createError(code, message, metadata = {}, cause) {
  const error = new Error(message || code);
  error.code = code;
  error.metadata = metadata;

  if (cause !== undefined) {
    error.cause = cause;
  }

  return error;
}

function isStableError(error) {
  return Boolean(error && typeof error.code === "string" && Object.values(ERROR_CODES).includes(error.code));
}

function isAbortLikeError(error) {
  return Boolean(
    error &&
      (
        error.code === ERROR_CODES.TRANSLATION_CANCELLED ||
        error.name === "AbortError" ||
        error.type === "abort" ||
        error.error === "abort"
      )
  );
}

function normalizeError(code, message, cause, metadata = {}) {
  if (isStableError(cause)) {
    return cause;
  }

  if (isAbortLikeError(cause)) {
    return createError(
      ERROR_CODES.TRANSLATION_CANCELLED,
      "Translation request was cancelled.",
      metadata,
      cause
    );
  }

  return createError(
    code,
    message,
    {
      ...metadata,
      status: typeof cause?.status === "number" ? cause.status : metadata.status,
      statusText: typeof cause?.statusText === "string" ? cause.statusText : metadata.statusText,
      causeMessage: typeof cause?.message === "string" ? cause.message : undefined
    },
    cause
  );
}

function attachAbort(promise, abort) {
  promise.abort = typeof abort === "function" ? abort : () => {};
  return promise;
}

module.exports = { ERROR_CODES, attachAbort, createError, normalizeError };
