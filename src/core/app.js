const { createNoopDiagnostics } = require("../diagnostics/diagnostics.js");

function createApp({
  defaults,
  document,
  diagnostics = createNoopDiagnostics(),
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
  let currentSettings = {
    targetLanguage: defaults.targetLanguage,
    preferredProvider: defaults.preferredProvider
  };
  let settingsLoadPromise = null;

  async function ensureSettings() {
    if (!settingsLoadPromise) {
      settingsLoadPromise = readSettingsSnapshot()
        .then((value) => {
          currentSettings = value;
          return value;
        })
        .finally(() => {
          settingsLoadPromise = null;
        });
    }

    return settingsLoadPromise;
  }

  async function ensureTargetLanguageId() {
    const settings = await ensureSettings();
    return settings.targetLanguage;
  }

  async function persistSettings(nextSettings) {
    currentSettings = await writeSettingsSnapshot(nextSettings);
    runtimeState.advanceSettingsRevision();
    invalidateActiveThreadTranslations();
    refreshActiveThreads();
    return currentSettings;
  }

  function getLanguageDefinition() {
    return translateService.getLanguageDefinition(currentSettings.targetLanguage);
  }

  function injectButtons(root = document) {
    threadDom.injectButtons(root, onTranslateClick);
  }

  async function openSettings() {
    const resolvedSettings = await ensureSettings();
    settingsModal.open({
      currentSettings: resolvedSettings,
      onSave: persistSettings
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

  function invalidateThreadTranslationState(threadState) {
    if (!threadState) {
      return;
    }

    const nextSettingsRevision = runtimeState.state.settingsRevision;
    threadState.title.translatedText = "";
    threadState.title.status = "idle";
    threadState.title.error = "";
    threadState.title.requestId += 1;
    threadState.title.settingsRevision = nextSettingsRevision;

    for (const messageState of threadState.messages.values()) {
      messageState.segmentSignature = "";
      messageState.translatedSegments = null;
      messageState.status = "idle";
      messageState.error = "";
      messageState.requestSerial += 1;
      messageState.settingsRevision = nextSettingsRevision;
    }
  }

  function invalidateActiveThreadTranslations() {
    for (const threadState of Array.from(runtimeState.state.activeThreadStates)) {
      cancelPendingThreadRequests(threadState);
      invalidateThreadTranslationState(threadState);
      if (threadState.root instanceof globalThis.HTMLElement) {
        renderer.clearThreadRenderArtifacts(threadState.root);
      }
    }
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
      diagnostics.record("ui.translate-click.invalid-target", {
        targetType: typeof button
      });
      return;
    }
    diagnostics.record("ui.translate-click.received", {
      buttonClassName: button.className || ""
    });

    const threadRoot = threadDom.findThreadRoot(button);
    if (!threadRoot) {
      diagnostics.record("ui.translate-click.thread-missing", {
        buttonClassName: button.className || ""
      });
      return;
    }

    const threadState = threadDom.getExistingThreadState(threadRoot);
    const shouldRestoreOriginal = threadState?.active === true || renderer.hasThreadRenderArtifacts(threadRoot);

    if (shouldRestoreOriginal) {
      diagnostics.record("ui.translate-click.restore", {
        threadKey: threadState?.key || ""
      });
      restoreThread(threadRoot);
      return;
    }

    await ensureSettings();
    const nextThreadState = threadDom.ensureThreadState(threadRoot);
    diagnostics.record("ui.translate-click.activate", {
      threadKey: nextThreadState.key
    });
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
    const textCache = typeof segmenter.createTextExtractionCache === "function"
      ? segmenter.createTextExtractionCache()
      : null;
    diagnostics.record("thread.refresh.start", {
      threadKey: threadState.key,
      runId: runToken.runId
    });

    try {
      threadDom.syncThreadButtons(threadRoot, true);

      const descriptors = threadDom.collectMessageDescriptors(threadRoot, { textCache });
      threadDom.reconcileMessageStates(threadState, descriptors);
      diagnostics.record("thread.refresh.collected", {
        threadKey: threadState.key,
        runId: runToken.runId,
        messageCount: descriptors.length
      });

      if (!runtimeState.isRunCurrent(threadState, runToken)) {
        return;
      }

      await processThreadTitle(threadRoot, threadState, runToken);
      await processMessageDescriptors(threadRoot, threadState, descriptors, runToken, { textCache });
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
    const settingsRevision = runtimeState.state.settingsRevision;
    const titleElement = threadDom.findTitleElement(threadRoot);
    const titleText = normalizeTranslationText(titleElement?.textContent || "");

    if (!(titleElement instanceof globalThis.HTMLElement) || !titleText || !policies.hasTranslatableText(titleText)) {
      threadState.title = runtimeState.createTitleState();
      renderer.clearTitleTranslation(threadRoot);
      return;
    }

    if (
      titleState.sourceText === titleText &&
      titleState.status === "done" &&
      titleState.translatedText &&
      titleState.settingsRevision === settingsRevision
    ) {
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
    titleState.settingsRevision = settingsRevision;
    renderer.renderTitleTranslation(threadRoot, titleElement, i18n.t("content.loading"), "loading");

    const translationRequestId = `title:${threadState.key}:${runToken.runId}:${requestId}`;
    const request = translateService.translateSegments(
      [titleText],
      getLanguageDefinition(),
      { preferredProvider: currentSettings.preferredProvider }
    );
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

      if (!isTitleRequestCurrent(threadState, requestId, titleText, settingsRevision)) {
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
      if (!isTitleRequestCurrent(threadState, requestId, titleText, settingsRevision)) {
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

  async function processMessageDescriptors(threadRoot, threadState, descriptors, runToken, { textCache } = {}) {
    for (const descriptor of descriptors) {
      if (!runtimeState.isRunCurrent(threadState, runToken)) {
        return;
      }

      const messageState = descriptor.state;
      const liveElements = threadDom.findLiveMessageElements(threadRoot, descriptor, { textCache });
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

      const segments = segmenter.collectTranslatableSegments(descriptor.contentRoot || descriptor.body, { textCache });
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
        messageState.segmentSignature === segmentSignature &&
        messageState.settingsRevision === runtimeState.state.settingsRevision
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
    const settingsRevision = runtimeState.state.settingsRevision;

    if (segments.length === 0 || !runtimeState.isRunCurrent(threadState, runToken)) {
      return;
    }

    messageState.status = "translating";
    messageState.error = "";
    messageState.settingsRevision = settingsRevision;
    renderer.renderLoadingTranslations(segments);

    messageState.requestSerial += 1;
    const requestSerial = messageState.requestSerial;
    const requestId = `message:${threadState.key}:${messageState.instanceId}:${requestSerial}`;
    const request = translateService.translateSegments(
      segments.map((segment) => segment.text),
      getLanguageDefinition(),
      { preferredProvider: currentSettings.preferredProvider }
    );
    diagnostics.record("thread.message.translate.start", {
      messageKey: messageState.key,
      segmentCount: segments.length,
      requestId
    });
    requestRegistry.register(requestId, request);
    runtimeState.trackThreadRequest(threadState, requestId);

    try {
      const response = await request;
      if (
        !runtimeState.isRunCurrent(threadState, runToken) ||
        messageState.requestSerial !== requestSerial ||
        messageState.settingsRevision !== settingsRevision
      ) {
        return;
      }

      messageState.segmentSignature = descriptor.segmentSignature || "";
      messageState.translatedSegments = response.translatedSegments;
      messageState.status = "translated";
      messageState.error = "";
      renderer.clearMessageStatus(descriptor);
      const renderResult = renderer.renderTranslatedSegments(segments, response.translatedSegments);
      if (!renderResult?.ok) {
        diagnostics.record("thread.message.render.failed", {
          messageKey: messageState.key,
          phase: "fresh-translation",
          failedSegments: renderResult?.failedSegments || []
        });
      }
    } catch (error) {
      if (
        !runtimeState.isRunCurrent(threadState, runToken) ||
        messageState.requestSerial !== requestSerial ||
        messageState.settingsRevision !== settingsRevision
      ) {
        return;
      }

      const message = resolveErrorMessage(error, i18n.t("content.translationFailed"));
      messageState.status = "error";
      messageState.error = message;
      diagnostics.recordError("thread.message.translate.error", error, {
        messageKey: messageState.key,
        requestId
      });
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

  function isTitleRequestCurrent(threadState, requestId, titleText, settingsRevision) {
    return (
      threadState.title.requestId === requestId &&
      threadState.title.sourceText === titleText &&
      threadState.title.settingsRevision === settingsRevision
    );
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

  async function readSettingsSnapshot() {
    if (typeof settingsStore.getSettings === "function") {
      return settingsStore.getSettings();
    }

    const [targetLanguage, preferredProvider] = await Promise.all([
      typeof settingsStore.getTargetLanguage === "function"
        ? settingsStore.getTargetLanguage()
        : defaults.targetLanguage,
      typeof settingsStore.getPreferredProvider === "function"
        ? settingsStore.getPreferredProvider()
        : defaults.preferredProvider
    ]);

    return { targetLanguage, preferredProvider };
  }

  async function writeSettingsSnapshot(nextSettings) {
    if (typeof settingsStore.setSettings === "function") {
      return settingsStore.setSettings(nextSettings);
    }

    const targetLanguage = typeof settingsStore.setTargetLanguage === "function"
      ? await settingsStore.setTargetLanguage(nextSettings?.targetLanguage)
      : defaults.targetLanguage;
    const preferredProvider = typeof settingsStore.setPreferredProvider === "function"
      ? await settingsStore.setPreferredProvider(nextSettings?.preferredProvider)
      : defaults.preferredProvider;

    return { targetLanguage, preferredProvider };
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
