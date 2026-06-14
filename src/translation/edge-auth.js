const {
  ERROR_CODES,
  attachAbort,
  createError,
  normalizeError
} = require("../core/errors.js");
const { createNoopDiagnostics } = require("../diagnostics/diagnostics.js");

const EDGE_FALLBACK_HEADERS = Object.freeze({
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
  "sec-ch-ua": "\"Chromium\";v=\"136\", \"Microsoft Edge\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\""
});

function createEdgeAuth({ xhr, now = Date.now, diagnostics = createNoopDiagnostics() }) {
  let cache = null;
  let inflight = null;

  function isJwtLike(token) {
    return typeof token === "string" && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token);
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

    if (typeof globalThis.atob !== "function") {
      throw new Error("base64 decoder is unavailable");
    }

    const binary = globalThis.atob(padded);
    let percentEncoded = "";

    for (let index = 0; index < binary.length; index += 1) {
      percentEncoded += `%${binary.charCodeAt(index).toString(16).padStart(2, "0")}`;
    }

    return decodeURIComponent(percentEncoded);
  }

  function getExpiry(token) {
    const [, payload = ""] = token.split(".");

    try {
      const parsed = JSON.parse(decodeBase64Url(payload));
      return typeof parsed.exp === "number" ? parsed.exp * 1000 : now() + 600000;
    } catch {
      return now() + 600000;
    }
  }

  return {
    getToken() {
      if (cache && cache.expiresAt > now() + 60000) {
        return attachAbort(Promise.resolve(cache.token), () => {});
      }

      if (!inflight) {
        let activeAbort = () => {};
        const operation = (async () => {
          let request = xhr.request({
            method: "GET",
            url: "https://edge.microsoft.com/translate/auth",
            nocache: true,
            timeout: 8000,
            headers: {
              Accept: "*/*"
            }
          });
          diagnostics.record("edge-auth.request.start", {
            attempt: 1,
            timeoutMs: 8000,
            usedFallbackHeaders: false
          });
          activeAbort = () => request.abort?.();
          let response = await request;
          let token = String(response?.responseText || "").trim();
          diagnostics.record("edge-auth.request.result", {
            attempt: 1,
            usedFallbackHeaders: false,
            status: response?.status || 0,
            responseTextLength: token.length,
            isJwtLike: isJwtLike(token)
          });

          if (!isJwtLike(token)) {
            request = xhr.request({
              method: "GET",
              url: "https://edge.microsoft.com/translate/auth",
              nocache: true,
              timeout: 8000,
              headers: {
                Accept: "*/*",
                ...EDGE_FALLBACK_HEADERS
              }
            });
            diagnostics.record("edge-auth.request.start", {
              attempt: 2,
              timeoutMs: 8000,
              usedFallbackHeaders: true
            });
            activeAbort = () => request.abort?.();
            response = await request;
            token = String(response?.responseText || "").trim();
            diagnostics.record("edge-auth.request.result", {
              attempt: 2,
              usedFallbackHeaders: true,
              status: response?.status || 0,
              responseTextLength: token.length,
              isJwtLike: isJwtLike(token)
            });
          }

          if (!isJwtLike(token)) {
            diagnostics.record("edge-auth.token.rejected", {
              reason: "token-not-jwt-like",
              tokenLength: token.length
            });
            throw createError(ERROR_CODES.EDGE_AUTH_FAILED, "Edge auth token is invalid.");
          }

          cache = {
            token,
            expiresAt: getExpiry(token)
          };
          diagnostics.record("edge-auth.token.accepted", {
            tokenLength: token.length,
            expiresAt: cache.expiresAt
          });

          return token;
        })()
          .catch((error) => {
          diagnostics.recordError("edge-auth.request.error", error, {
            requestStage: "edge-auth"
          });
          throw normalizeError(
            ERROR_CODES.EDGE_AUTH_FAILED,
            "Edge auth request failed.",
            error,
            {
              requestStage: "edge-auth"
            }
          );
        })
          .finally(() => {
            inflight = null;
          });

        inflight = {
          consumerCount: 0,
          abortTransport() {
            activeAbort();
          },
          promise: operation
        };
      }

      inflight.consumerCount += 1;

      let isSettled = false;
      let isCancelled = false;
      let rejectConsumer = null;
      const sharedState = inflight;
      const consumerPromise = new Promise((resolve, reject) => {
        rejectConsumer = reject;

        sharedState.promise.then(
          (token) => {
            if (isCancelled) {
              return;
            }

            isSettled = true;
            resolve(token);
          },
          (error) => {
            if (isCancelled) {
              return;
            }

            isSettled = true;
            reject(error);
          }
        );
      });

      return attachAbort(consumerPromise, () => {
        if (isSettled || isCancelled) {
          return;
        }

        isCancelled = true;
        sharedState.consumerCount -= 1;

        if (sharedState.consumerCount === 0) {
          sharedState.abortTransport();
        }

        rejectConsumer(
          createError(ERROR_CODES.TRANSLATION_CANCELLED, "Translation request was cancelled.")
        );
      });
    }
  };
}

module.exports = { createEdgeAuth };
