function createRequestRegistry() {
  const activeRequests = new Map();

  function register(requestId, request) {
    if (!requestId) {
      return request;
    }

    if (request && typeof request.abort === "function") {
      activeRequests.set(requestId, request);
    } else {
      activeRequests.delete(requestId);
    }

    return request;
  }

  function release(requestId) {
    if (requestId) {
      activeRequests.delete(requestId);
    }
  }

  function cancel(requestId) {
    const request = requestId ? activeRequests.get(requestId) : null;
    activeRequests.delete(requestId);

    if (request && typeof request.abort === "function") {
      request.abort();
    }
  }

  function cancelMany(requestIds) {
    for (const requestId of requestIds || []) {
      cancel(requestId);
    }
  }

  function cancelAll() {
    cancelMany(Array.from(activeRequests.keys()));
  }

  return {
    register,
    release,
    cancel,
    cancelMany,
    cancelAll
  };
}

module.exports = { createRequestRegistry };
