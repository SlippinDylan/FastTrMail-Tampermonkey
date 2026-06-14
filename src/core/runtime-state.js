function createTitleState() {
  return {
    sourceText: "",
    translatedText: "",
    status: "idle",
    error: "",
    requestId: 0
  };
}

function createRuntimeState({ getLocationKey }) {
  const state = {
    threadStates: new WeakMap(),
    activeThreadStates: new Set(),
    observerMuteDepth: 0,
    observerControl: null,
    documentRefreshScheduled: false,
    observedThreadRoots: new Set(),
    observedThreadFlushTimer: 0,
    messageInstanceCounter: 0,
    segmentCounter: 0,
    threadStateCounter: 0,
    currentLocationKey: getLocationKey(),
    documentGeneration: 0
  };

  function nextSegmentId() {
    const segmentId = `fmt-segment-${state.segmentCounter}`;
    state.segmentCounter += 1;
    return segmentId;
  }

  function nextMessageInstanceId() {
    const messageInstanceId = `fmt-message-${state.messageInstanceCounter}`;
    state.messageInstanceCounter += 1;
    return messageInstanceId;
  }

  function nextThreadStateKey() {
    const threadStateKey = `fmt-thread-${state.threadStateCounter}`;
    state.threadStateCounter += 1;
    return threadStateKey;
  }

  function withObserverMuted(task) {
    const shouldSuspendObserver = state.observerMuteDepth === 0;
    state.observerMuteDepth += 1;

    if (shouldSuspendObserver) {
      state.observerControl?.suspend?.();
    }

    try {
      return task();
    } finally {
      state.observerMuteDepth -= 1;

      if (state.observerMuteDepth === 0) {
        state.observerControl?.resume?.();
      }
    }
  }

  function setObserverControl(observerControl) {
    state.observerControl = observerControl || null;

    if (!state.observerControl) {
      return;
    }

    if (state.observerMuteDepth > 0) {
      state.observerControl.suspend?.();
      return;
    }

    state.observerControl.resume?.();
  }

  function createThreadState() {
    return {
      key: nextThreadStateKey(),
      active: false,
      cancelled: false,
      generation: state.documentGeneration,
      runId: 0,
      root: null,
      messages: new Map(),
      refreshTimer: 0,
      processing: false,
      pendingRefresh: false,
      pendingRefreshDelayMs: 0,
      pendingRequestIds: new Set(),
      title: createTitleState()
    };
  }

  function createMessageState({ key, identity, instanceId }) {
    return {
      key,
      identity,
      instanceId,
      status: "idle",
      segmentSignature: "",
      translatedSegments: null,
      requestSerial: 0,
      error: ""
    };
  }

  function clearRefreshTimer(threadState) {
    if (!threadState?.refreshTimer) {
      return;
    }

    globalThis.clearTimeout(threadState.refreshTimer);
    threadState.refreshTimer = 0;
  }

  function activateThreadState(threadState) {
    if (!threadState) {
      return;
    }

    threadState.active = true;
    threadState.cancelled = false;
    threadState.generation = state.documentGeneration;
    state.activeThreadStates.add(threadState);
  }

  function deactivateThreadState(threadState) {
    if (!threadState) {
      return;
    }

    clearRefreshTimer(threadState);
    threadState.active = false;
    threadState.cancelled = true;
    threadState.processing = false;
    threadState.pendingRefresh = false;
    threadState.pendingRefreshDelayMs = 0;
    threadState.runId += 1;
    state.activeThreadStates.delete(threadState);

    if (threadState.title.status === "translating") {
      threadState.title.status = threadState.title.translatedText ? "done" : "idle";
      threadState.title.error = "";
    }

    for (const messageState of threadState.messages.values()) {
      if (messageState.status === "translating") {
        messageState.status = Array.isArray(messageState.translatedSegments) ? "translated" : "idle";
        messageState.error = "";
      }
    }
  }

  function isThreadStateCurrent(threadState) {
    return Boolean(threadState) && threadState.generation === state.documentGeneration;
  }

  function trackThreadRequest(threadState, requestId) {
    if (threadState && requestId) {
      threadState.pendingRequestIds.add(requestId);
    }
  }

  function releaseThreadRequest(threadState, requestId) {
    if (threadState && requestId) {
      threadState.pendingRequestIds.delete(requestId);
    }
  }

  function beginThreadRun(threadState) {
    activateThreadState(threadState);
    threadState.runId += 1;

    return {
      threadKey: threadState.key,
      generation: threadState.generation,
      runId: threadState.runId
    };
  }

  function isRunCurrent(threadState, runToken) {
    if (!threadState || !runToken) {
      return false;
    }

    return (
      threadState.active === true &&
      threadState.cancelled !== true &&
      threadState.generation === runToken.generation &&
      threadState.runId === runToken.runId &&
      state.currentLocationKey === getLocationKey()
    );
  }

  function hasLocationChanged() {
    return state.currentLocationKey !== getLocationKey();
  }

  function syncCurrentLocationKey() {
    state.currentLocationKey = getLocationKey();
    return state.currentLocationKey;
  }

  function advanceDocumentGeneration() {
    syncCurrentLocationKey();
    state.documentGeneration += 1;

    return state.documentGeneration;
  }

  return {
    state,
    nextSegmentId,
    nextMessageInstanceId,
    nextThreadStateKey,
    withObserverMuted,
    setObserverControl,
    createTitleState,
    createThreadState,
    createMessageState,
    clearRefreshTimer,
    activateThreadState,
    deactivateThreadState,
    isThreadStateCurrent,
    trackThreadRequest,
    releaseThreadRequest,
    beginThreadRun,
    isRunCurrent,
    hasLocationChanged,
    syncCurrentLocationKey,
    advanceDocumentGeneration
  };
}

module.exports = { createRuntimeState };
