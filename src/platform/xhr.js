function createXhr({ tmApi }) {
  function isSuccessStatus(status) {
    return typeof status === "number" && status >= 200 && status < 300;
  }

  function createHttpStatusError(response) {
    const error = new Error(`HTTP ${response?.status || 0}`);
    error.status = response?.status;
    error.statusText = response?.statusText;
    error.responseText = response?.responseText;
    error.finalUrl = response?.finalUrl;
    error.context = response?.context;
    error.response = response;
    return error;
  }

  return {
    request(details) {
      let requestHandle = null;

      const promise = new Promise((resolve, reject) => {
        requestHandle = tmApi.xmlHttpRequest({
          ...details,
          onload(response) {
            if (isSuccessStatus(response?.status)) {
              resolve(response);
              return;
            }

            reject(createHttpStatusError(response));
          },
          onerror: reject,
          ontimeout: reject,
          onabort: reject
        });
      });

      promise.abort = () => {
        if (requestHandle && typeof requestHandle.abort === "function") {
          requestHandle.abort();
        }
      };

      return promise;
    }
  };
}

module.exports = { createXhr };
