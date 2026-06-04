const test = require("node:test");
const assert = require("node:assert/strict");

const { ERROR_CODES } = require("../src/core/errors.js");
const { createXhr } = require("../src/platform/xhr.js");
const { createEdgeAuth } = require("../src/translation/edge-auth.js");

function createJwt(exp) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}

test("edge auth retries with edge-like headers and caches a jwt token", async () => {
  const requests = [];
  const originalBuffer = global.Buffer;
  const token = createJwt(1_000);
  const auth = createEdgeAuth({
    xhr: {
      request(details) {
        requests.push(details);
        return Promise.resolve({
          status: 200,
          responseText: requests.length === 1 ? "not-a-jwt" : token
        });
      }
    },
    now: () => 1_000
  });

  global.Buffer = undefined;

  try {
    const firstToken = await auth.getToken();
    const secondToken = await auth.getToken();

    assert.equal(firstToken, token);
    assert.equal(secondToken, token);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].headers["user-agent"].includes("Edg/"), true);
  } finally {
    global.Buffer = originalBuffer;
  }
});

test("edge auth uses bounded no-cache requests like the original extension", async () => {
  const requests = [];
  const token = createJwt(1_000);
  const auth = createEdgeAuth({
    xhr: {
      request(details) {
        requests.push(details);
        return Promise.resolve({
          status: 200,
          responseText: requests.length === 1 ? "not-a-jwt" : token
        });
      }
    },
    now: () => 1_000
  });

  await auth.getToken();

  assert.equal(requests.length, 2);
  assert.equal(requests[0].timeout, 8000);
  assert.equal(requests[0].nocache, true);
  assert.equal(requests[1].timeout, 8000);
  assert.equal(requests[1].nocache, true);
});

test("edge auth normalizes raw transport failures into stable auth errors", async () => {
  const auth = createEdgeAuth({
    xhr: {
      request() {
        return Promise.reject(new Error("socket closed"));
      }
    }
  });

  await assert.rejects(auth.getToken(), (error) => {
    assert.equal(error.code, ERROR_CODES.EDGE_AUTH_FAILED);
    assert.equal(error.message, "Edge auth request failed.");
    assert.equal(error.metadata.causeMessage, "socket closed");
    return true;
  });
});

test("edge auth exposes abort and normalizes cancellation", async () => {
  let rejectRequest = null;
  let abortCount = 0;
  const auth = createEdgeAuth({
    xhr: {
      request() {
        const pending = new Promise((resolve, reject) => {
          rejectRequest = reject;
        });

        pending.abort = () => {
          abortCount += 1;
          rejectRequest({ type: "abort" });
        };

        return pending;
      }
    }
  });

  const tokenPromise = auth.getToken();

  assert.equal(typeof tokenPromise.abort, "function");

  tokenPromise.abort();

  await assert.rejects(tokenPromise, (error) => {
    assert.equal(error.code, ERROR_CODES.TRANSLATION_CANCELLED);
    return true;
  });
  assert.equal(abortCount, 1);
});

test("edge auth dedupes concurrent callers without letting one abort cancel the others", async () => {
  let rejectRequest = null;
  let resolveRequest = null;
  let requestCount = 0;
  let abortCount = 0;
  const token = createJwt(1_000);
  const auth = createEdgeAuth({
    xhr: {
      request() {
        requestCount += 1;
        const pending = new Promise((resolve, reject) => {
          resolveRequest = resolve;
          rejectRequest = reject;
        });

        pending.abort = () => {
          abortCount += 1;
          rejectRequest({ type: "abort" });
        };

        return pending;
      }
    },
    now: () => 1_000
  });

  const first = auth.getToken();
  const second = auth.getToken();

  first.abort();

  await assert.rejects(first, (error) => {
    assert.equal(error.code, ERROR_CODES.TRANSLATION_CANCELLED);
    return true;
  });

  resolveRequest({ status: 200, responseText: token });

  await assert.doesNotReject(second);
  assert.equal(await second, token);
  assert.equal(requestCount, 1);
  assert.equal(abortCount, 0);
});

test("edge auth normalizes non-2xx status failures into stable auth errors", async () => {
  const auth = createEdgeAuth({
    xhr: {
      request() {
        return Promise.reject(
          Object.assign(new Error("HTTP 503"), { status: 503, responseText: "edge down" })
        );
      }
    }
  });

  await assert.rejects(auth.getToken(), (error) => {
    assert.equal(error.code, ERROR_CODES.EDGE_AUTH_FAILED);
    assert.equal(error.message, "Edge auth request failed.");
    assert.equal(error.metadata.status, 503);
    assert.equal(error.metadata.causeMessage, "HTTP 503");
    return true;
  });
});

test("xhr wrapper rejects non-2xx responses and exposes abort", async () => {
  let requestDetails = null;
  let aborted = false;
  const xhr = createXhr({
    tmApi: {
      xmlHttpRequest(details) {
        requestDetails = details;
        return {
          abort() {
            aborted = true;
            details.onabort({ type: "abort" });
          }
        };
      }
    }
  });

  const statusPromise = xhr.request({ method: "GET", url: "https://example.com/status" });
  requestDetails.onload({ status: 503, statusText: "Service Unavailable", responseText: "down" });

  await assert.rejects(statusPromise, (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.statusText, "Service Unavailable");
    assert.equal(error.responseText, "down");
    return true;
  });

  const abortPromise = xhr.request({ method: "GET", url: "https://example.com/abort" });
  abortPromise.abort();

  await assert.rejects(abortPromise, (error) => {
    assert.equal(error.type, "abort");
    return true;
  });
  assert.equal(aborted, true);
});
