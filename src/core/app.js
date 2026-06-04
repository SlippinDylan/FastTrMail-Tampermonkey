function createApp({
  defaults,
  document,
  i18n,
  policies,
  renderer,
  requestRegistry,
  runtimeState,
  segmenter,
  settingsModal,
  settingsStore,
  threadDom,
  translateService,
  window = globalThis.window
}) {
  let targetLanguageId = defaults.targetLanguage;
  let settingsLoadPromise = null;

  async function ensureTargetLanguageId() {
    if (!settingsLoadPromise) {
      settingsLoadPromise = settingsStore.getTargetLanguage()
        .then((value) => {
          targetLanguageId = value;
          return value;
        })
        .finally(() => {
          settingsLoadPromise = null;
        });
    }

    return settingsLoadPromise;
  }

  async function persistTargetLanguageId(nextValue) {
    targetLanguageId = await settingsStore.setTargetLanguage(nextValue);
    refreshActiveThreads();
    return targetLanguageId;
  }

  function getLanguageDefinition() {
    return translateService.getLanguageDefinition(targetLanguageId);
  }

  function injectButtons(root = document) {
    threadDom.injectButtons(root, onTranslateClick);
  }

  async function openSettings() {
    const currentValue = await ensureTargetLanguageId();
    settingsModal.open({
      currentValue,
      onSave: persistTargetLanguageId
    });
  }

  function cancelPendingThreadRequests(threadState) {
    if (!threadState?.pendingRequestIds || threadState.pendingRequestIds.size === 0) {
      return;
    }

    const requestIds = Array.from(threadState.pendingRequestIds);
    threadState.pendingRequestIds.clear();
    requestRegistry.cancelMany(requestIds);
  }

  function restoreThread(threadRoot) {
    const threadState = threadDom.getExistingThreadState(threadRoot, { includeStale: true });
    if (threadState) {
      cancelPendingThreadRequests(threadState);
    }

    threadDom.resetThreadState(threadRoot);
    threadDom.syncThreadButtons(threadRoot, false);
    renderer.clearThreadRenderArtifacts(threadRoot);
    threadDom.clearThreadDomState(threadRoot);
  }

  async function onTranslateClick(event) {
    const button = event.currentTarget;
    if (!(button instanceof globalThis.HTMLElement)) {
      return;
    }

    const threadRoot = threadDom.findThreadRoot(button);
    if (!threadRoot) {
      return;
    }

    const threadState = threadDom.getExistingThreadState(threadRoot);
    const shouldRestoreOriginal = threadState?.active === true || renderer.hasThreadRenderArtifacts(threadRoot);

    if (shouldRestoreOriginal) {
      restoreThread(threadRoot);
      return;
    }

    await ensureTargetLanguageId();
    const nextThreadState = threadDom.ensureThreadState(threadRoot);
    runtimeState.activateThreadState(nextThreadState);
    threadDom.syncThreadButtons(threadRoot, true);
    scheduleThreadRefresh(threadRoot, { immediate: true });
  }

  function scheduleThreadRefresh(threadRoot, { immediate = false, delayMs } = {}) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return;
    }

    const state = threadDom.getExistingThreadState(threadRoot);
    if (!state?.active) {
      return;
    }

    if (state.processing) {
      state.pendingRefresh = true;
      return;
    }

    if (state.refreshTimer) {
      return;
    }

    const delay = typeof delayMs === "number"
      ? Math.max(0, delayMs)
      : immediate
        ? 0
        : 80;
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = 0;
      void refreshThread(threadRoot, state);
    }, delay);
  }

  async function refreshThread(threadRoot, threadState) {
    if (!(threadRoot instanceof globalThis.HTMLElement) || !threadRoot.isConnected) {
      return;
    }

    const liveThreadState = threadDom.getExistingThreadState(threadRoot, { includeStale: true });
    if (liveThreadState !== threadState || threadState.active !== true || threadState.cancelled === true) {
      return;
    }

    if (threadState.processing) {
      threadState.pendingRefresh = true;
      return;
    }

    threadState.processing = true;
    const runToken = runtimeState.beginThreadRun(threadState);

    try {
      threadDom.syncThreadButtons(threadRoot, true);

      const descriptors = threadDom.collectMessageDescriptors(threadRoot);
      threadDom.reconcileMessageStates(threadState, descriptors);

      if (!runtimeState.isRunCurrent(threadState, runToken)) {
        return;
      }

      await processThreadTitle(threadRoot, threadState, runToken);
      await processMessageDescriptors(threadRoot, threadState, descriptors, runToken);
    } finally {
      threadState.processing = false;

      if (threadState.pendingRefresh && threadState.active && !threadState.cancelled) {
        const delay = threadState.pendingRefreshDelayMs || 0;
        threadState.pendingRefresh = false;
        threadState.pendingRefreshDelayMs = 0;
        scheduleThreadRefresh(threadRoot, { delayMs: delay });
      }
    }
  }

  async function processThreadTitle(threadRoot, threadState, runToken) {
    const titleState = threadState.title;
    const titleElement = threadDom.findTitleElement(threadRoot);
    const titleText = normalizeTranslationText(titleElement?.textContent || "");

    if (!(titleElement instanceof globalThis.HTMLElement) || !titleText || !policies.hasTranslatableText(titleText)) {
      threadState.title = runtimeState.createTitleState();
      renderer.clearTitleTranslation(threadRoot);
      return;
    }

    if (titleState.sourceText === titleText && titleState.status === "done" && titleState.translatedText) {
      if (runtimeState.isRunCurrent(threadState, runToken)) {
        renderer.renderTitleTranslation(threadRoot, titleElement, titleState.translatedText, "done");
      }
      return;
    }

    const requestId = titleState.requestId + 1;
    titleState.sourceText = titleText;
    titleState.translatedText = "";
    titleState.status = "translating";
    titleState.error = "";
    titleState.requestId = requestId;
    renderer.renderTitleTranslation(threadRoot, titleElement, i18n.t("content.loading"), "loading");

    const translationRequestId = `title:${threadState.key}:${runToken.runId}:${requestId}`;
    const request = translateService.translateSegments([titleText], getLanguageDefinition());
    requestRegistry.register(translationRequestId, request);
    runtimeState.trackThreadRequest(threadState, translationRequestId);

    try {
      const response = await request;
      const translatedTitle = Array.isArray(response?.translatedSegments)
        ? response.translatedSegments[0]
        : "";

      if (!translatedTitle) {
        throw new Error(i18n.t("content.titleTranslationEmpty"));
      }

      if (!isTitleRequestCurrent(threadState, requestId, titleText)) {
        return;
      }

      threadState.title.translatedText = translatedTitle;
      threadState.title.status = "done";
      threadState.title.error = "";

      if (!runtimeState.isRunCurrent(threadState, runToken)) {
        return;
      }

      const liveTitleElement = threadDom.findTitleElement(threadRoot);
      if (liveTitleElement instanceof globalThis.HTMLElement) {
        renderer.renderTitleTranslation(threadRoot, liveTitleElement, translatedTitle, "done");
      }
    } catch (error) {
      if (!isTitleRequestCurrent(threadState, requestId, titleText)) {
        return;
      }

      const message = resolveErrorMessage(error, i18n.t("content.titleTranslationFailed"));
      threadState.title.translatedText = "";
      threadState.title.status = "error";
      threadState.title.error = message;

      if (!runtimeState.isRunCurrent(threadState, runToken)) {
        return;
      }

      const liveTitleElement = threadDom.findTitleElement(threadRoot);
      if (liveTitleElement instanceof globalThis.HTMLElement) {
        renderer.renderTitleTranslation(threadRoot, liveTitleElement, message, "error");
      }
    } finally {
      requestRegistry.release(translationRequestId);
      runtimeState.releaseThreadRequest(threadState, translationRequestId);
    }
  }

  async function processMessageDescriptors(threadRoot, threadState, descriptors, runToken) {
    for (const descriptor of descriptors) {
      if (!runtimeState.isRunCurrent(threadState, runToken)) {
        return;
      }

      const messageState = descriptor.state;
      const liveElements = threadDom.findLiveMessageElements(threadRoot, descriptor);
      descriptor.body = liveElements.body;
      descriptor.contentRoot = liveElements.contentRoot || descriptor.body;
      renderer.clearMessageStatus(descriptor);

      if (!descriptor.body) {
        if (threadDom.isMessageBodyDeferred(descriptor)) {
          messageState.status = "pending-body";
          messageState.error = "";
        } else {
          messageState.status = "pending-body";
          messageState.error = i18n.t("content.bodyNotFound");
          renderer.renderMessageStatus(descriptor, messageState.error, "error");
        }
        continue;
      }

      const segments = segmenter.collectTranslatableSegments(descriptor.contentRoot || descriptor.body);
      if (segments.length === 0) {
        messageState.status = "no-segments";
        messageState.error = i18n.t("content.noSegments");
        renderer.renderMessageStatus(descriptor, messageState.error, "error");
        continue;
      }

      const segmentSignature = segmenter.getSegmentSignature(segments);
      descriptor.segments = segments;
      descriptor.segmentSignature = segmentSignature;

      if (
        Array.isArray(messageState.translatedSegments) &&
        messageState.translatedSegments.length === segments.length &&
        messageState.segmentSignature === segmentSignature
      ) {
        const renderResult = renderer.renderTranslatedSegments(segments, messageState.translatedSegments);
        messageState.status = renderResult.ok ? "translated" : "render-pending";
        messageState.error = renderResult.ok ? "" : "cached-render-failed";
        continue;
      }

      await translateMessageDescriptor(threadState, descriptor, runToken);
    }
  }

  async function translateMessageDescriptor(threadState, descriptor, runToken) {
    const messageState = descriptor.state;
    const segments = descriptor.segments || [];

    if (segments.length === 0 || !runtimeState.isRunCurrent(threadState, runToken)) {
      return;
    }

    messageState.status = "translating";
    messageState.error = "";
    renderer.renderLoadingTranslations(segments);

    messageState.requestSerial += 1;
    const requestSerial = messageState.requestSerial;
    const requestId = `message:${threadState.key}:${messageState.instanceId}:${requestSerial}`;
    const request = translateService.translateSegments(
      segments.map((segment) => segment.text),
      getLanguageDefinition()
    );
    requestRegistry.register(requestId, request);
    runtimeState.trackThreadRequest(threadState, requestId);

    try {
      const response = await request;
      if (!runtimeState.isRunCurrent(threadState, runToken) || messageState.requestSerial !== requestSerial) {
        return;
      }

      messageState.segmentSignature = descriptor.segmentSignature || "";
      messageState.translatedSegments = response.translatedSegments;
      messageState.status = "translated";
      messageState.error = "";
      renderer.clearMessageStatus(descriptor);
      renderer.renderTranslatedSegments(segments, response.translatedSegments);
    } catch (error) {
      if (!runtimeState.isRunCurrent(threadState, runToken) || messageState.requestSerial !== requestSerial) {
        return;
      }

      const message = resolveErrorMessage(error, i18n.t("content.translationFailed"));
      messageState.status = "error";
      messageState.error = message;
      renderer.renderSegmentError(segments, message);
    } finally {
      requestRegistry.release(requestId);
      runtimeState.releaseThreadRequest(threadState, requestId);
    }
  }

  function resetDocumentTranslationState() {
    runtimeState.syncCurrentLocationKey();
    runtimeState.advanceDocumentGeneration();

    for (const threadState of Array.from(runtimeState.state.activeThreadStates)) {
      cancelPendingThreadRequests(threadState);
      runtimeState.deactivateThreadState(threadState);
    }

    runtimeState.state.activeThreadStates.clear();
    renderer.clearThreadRenderArtifacts(document.body || document.documentElement);
    threadDom.clearThreadDomState(document);
  }

  function refreshActiveThreads() {
    for (const threadState of Array.from(runtimeState.state.activeThreadStates)) {
      if (threadState.root instanceof globalThis.HTMLElement && threadState.root.isConnected) {
        scheduleThreadRefresh(threadState.root, { immediate: true });
      }
    }
  }

  function isTitleRequestCurrent(threadState, requestId, titleText) {
    return threadState.title.requestId === requestId && threadState.title.sourceText === titleText;
  }

  function normalizeTranslationText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function resolveErrorMessage(error, fallbackMessage) {
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message.trim();
    }

    return fallbackMessage;
  }

  return {
    ensureTargetLanguageId,
    injectButtons,
    onTranslateClick,
    openSettings,
    refreshActiveThreads,
    refreshThread,
    resetDocumentTranslationState,
    restoreThread,
    scheduleThreadRefresh
  };
}

module.exports = { createApp };
