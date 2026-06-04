function createLifecycle({
  app,
  constants,
  document,
  runtimeState,
  threadDom,
  window = globalThis.window
}) {
  const TRANSLATE_CLICK_HANDLED = Symbol.for("fasttrmail.translateClickHandled");
  let observer = null;

  function initialize() {
    app.injectButtons(document);
    document.addEventListener("click", handleDocumentClick, true);

    observer = new MutationObserver((mutations) => {
      if (runtimeState.state.observerMuteDepth > 0) {
        return;
      }

      if (runtimeState.hasLocationChanged()) {
        scheduleDocumentRefresh();
        return;
      }

      const affectedThreadRoots = collectAffectedThreadRoots(mutations);
      if (affectedThreadRoots.size > 0) {
        scheduleObservedThreadRefresh(affectedThreadRoots);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-hidden"]
    });
  }

  function handleDocumentClick(event) {
    if (event?.[TRANSLATE_CLICK_HANDLED]) {
      return;
    }

    const target = event.target;
    if (!(target instanceof globalThis.Element)) {
      return;
    }

    const button = target.closest(`.${constants.BUTTON_CLASS}`);
    if (!(button instanceof globalThis.HTMLElement)) {
      return;
    }

    event[TRANSLATE_CLICK_HANDLED] = true;
    void app.onTranslateClick({
      currentTarget: button
    });
  }

  function scheduleDocumentRefresh() {
    if (runtimeState.state.documentRefreshScheduled) {
      return;
    }

    runtimeState.state.documentRefreshScheduled = true;
    window.setTimeout(() => {
      runtimeState.state.documentRefreshScheduled = false;

      if (runtimeState.hasLocationChanged()) {
        app.resetDocumentTranslationState();
      }

      clearObservedThreadRefreshQueue();
      app.injectButtons(document);
      threadDom.pruneDetachedThreadStates();
    }, 0);
  }

  function scheduleObservedThreadRefresh(threadRoots) {
    for (const threadRoot of threadRoots) {
      if (threadRoot instanceof globalThis.HTMLElement) {
        runtimeState.state.observedThreadRoots.add(threadRoot);
      }
    }

    if (runtimeState.state.observedThreadFlushTimer) {
      return;
    }

    runtimeState.state.observedThreadFlushTimer = window.setTimeout(() => {
      const roots = Array.from(runtimeState.state.observedThreadRoots);
      clearObservedThreadRefreshQueue();

      if (runtimeState.hasLocationChanged()) {
        scheduleDocumentRefresh();
        return;
      }

      threadDom.pruneDetachedThreadStates();

      for (const threadRoot of roots) {
        if (!(threadRoot instanceof globalThis.HTMLElement) || !threadRoot.isConnected) {
          continue;
        }

        app.injectButtons(threadRoot);

        const state = threadDom.getExistingThreadState(threadRoot);
        if (state?.active) {
          app.scheduleThreadRefresh(threadRoot, { immediate: true });
        }
      }
    }, 0);
  }

  function clearObservedThreadRefreshQueue() {
    if (runtimeState.state.observedThreadFlushTimer) {
      window.clearTimeout(runtimeState.state.observedThreadFlushTimer);
      runtimeState.state.observedThreadFlushTimer = 0;
    }

    runtimeState.state.observedThreadRoots.clear();
  }

  function collectAffectedThreadRoots(mutations) {
    const affectedThreadRoots = new Set();

    for (const mutation of mutations) {
      if (isInternalMutation(mutation)) {
        continue;
      }

      if (mutation.type === "attributes") {
        if (shouldReactToAttributeMutation(mutation.target)) {
          addAffectedThreadRootsFromNode(mutation.target, affectedThreadRoots);
        }
        continue;
      }

      addAffectedThreadRootsFromNode(mutation.target, affectedThreadRoots);

      for (const node of mutation.addedNodes || []) {
        addAffectedThreadRootsFromNode(node, affectedThreadRoots);
      }

      for (const node of mutation.removedNodes || []) {
        addAffectedThreadRootsFromNode(node, affectedThreadRoots);
      }
    }

    return affectedThreadRoots;
  }

  function addAffectedThreadRootsFromNode(node, affectedThreadRoots) {
    if (!(node instanceof globalThis.HTMLElement) || isInternalNode(node)) {
      return;
    }

    const directThreadRoot = node.matches(".v-Thread")
      ? node
      : node.closest(".v-Thread");

    if (directThreadRoot instanceof globalThis.HTMLElement) {
      affectedThreadRoots.add(directThreadRoot);
    }

    const shouldResolveRelatedThreadRoot = node.classList.contains(constants.BUTTON_CLASS)
      || node.closest?.(`.${constants.BUTTON_CLASS}`) !== null;
    const relatedThreadRoot = shouldResolveRelatedThreadRoot
      ? threadDom.findThreadRoot(node)
      : null;
    if (relatedThreadRoot instanceof globalThis.HTMLElement) {
      affectedThreadRoots.add(relatedThreadRoot);
    }

    node.querySelectorAll(".v-Thread").forEach((threadRoot) => {
      if (threadRoot instanceof globalThis.HTMLElement) {
        affectedThreadRoots.add(threadRoot);
      }
    });
  }

  function isInternalMutation(mutation) {
    const nodes = [
      ...Array.from(mutation.addedNodes || []),
      ...Array.from(mutation.removedNodes || [])
    ];

    if (mutation.type === "attributes") {
      return isInternalNode(mutation.target);
    }

    return nodes.length > 0 && nodes.every((node) => isInternalChildMutationNode(node));
  }

  function isInternalChildMutationNode(node) {
    if (!(node instanceof globalThis.HTMLElement)) {
      return false;
    }

    if (node.classList.contains(constants.BUTTON_CLASS) || node.closest?.(`.${constants.BUTTON_CLASS}`)) {
      return false;
    }

    return isInternalNode(node);
  }

  function isInternalNode(node) {
    if (!(node instanceof globalThis.HTMLElement)) {
      return false;
    }

    return (
      node.classList.contains(constants.BUTTON_CLASS) ||
      node.classList.contains(constants.INLINE_TRANSLATION_CLASS) ||
      node.classList.contains(constants.MESSAGE_STATUS_CLASS) ||
      node.classList.contains(constants.SEGMENT_ANCHOR_CLASS) ||
      node.classList.contains(constants.TITLE_TRANSLATION_CLASS) ||
      node.classList.contains(constants.TRANSLATION_WRAPPER_CLASS) ||
      node.classList.contains(constants.MODAL_OVERLAY_CLASS) ||
      node.closest?.(`.${constants.BUTTON_CLASS}`) !== null ||
      node.closest?.(`.${constants.INLINE_TRANSLATION_CLASS}`) !== null ||
      node.closest?.(`.${constants.MESSAGE_STATUS_CLASS}`) !== null ||
      node.closest?.(`.${constants.MODAL_OVERLAY_CLASS}`) !== null
    );
  }

  function shouldReactToAttributeMutation(target) {
    if (!(target instanceof globalThis.HTMLElement)) {
      return false;
    }

    if (
      target.closest(`.${constants.INLINE_TRANSLATION_CLASS}`) ||
      target.closest(`.${constants.TITLE_TRANSLATION_CLASS}`) ||
      target.closest(`.${constants.MESSAGE_STATUS_CLASS}`) ||
      target.classList.contains(constants.BUTTON_CLASS)
    ) {
      return false;
    }

    return Boolean(
      target.closest(".v-Message") ||
      target.closest(".v-MessageCard") ||
      target.closest(".v-Thread")
    );
  }

  return { initialize };
}

module.exports = { createLifecycle };
