function normalizeKeyText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function createThreadDom({
  constants,
  i18n,
  pageLocator,
  policies,
  runtimeState,
  segmenter,
  toolbarButtonApi,
  document = globalThis.document
}) {
  const TRANSLATE_CLICK_HANDLED = Symbol.for("fasttrmail.translateClickHandled");
  const toolbarButtonThreadRoots = new WeakMap();
  const toolbarButtonClickHandlers = new WeakMap();
  const MOUSEUP_CLICK_DEDUP_WINDOW_MS = 400;

  function normalizeIdentityValue(value, maxLength = 240) {
    return normalizeKeyText(value || "").slice(0, maxLength);
  }

  function buildIdentity(prefix, parts, fallback = "unknown") {
    const normalizedParts = parts
      .map((part) => normalizeIdentityValue(part))
      .filter(Boolean);

    if (normalizedParts.length > 0) {
      return `${prefix}::${normalizedParts.join("::")}`;
    }

    return `${prefix}::${fallback}`;
  }

  function findThreadRoot(element) {
    if (!(element instanceof globalThis.HTMLElement)) {
      return null;
    }

    if (element.classList.contains(constants.BUTTON_CLASS)) {
      const mappedThreadRoot = toolbarButtonThreadRoots.get(element);
      if (mappedThreadRoot instanceof globalThis.HTMLElement) {
        return mappedThreadRoot;
      }
    }

    const directThreadRoot = element.closest(".v-Thread");
    if (directThreadRoot instanceof globalThis.HTMLElement) {
      return directThreadRoot;
    }

    const pageRoot = pageLocator.findPageRoot(element);
    if (!(pageRoot instanceof globalThis.HTMLElement)) {
      return null;
    }

    return findPrimaryThreadRoot(pageRoot);
  }

  function findToolbarForPageRoot(pageRoot, threadRoot = null) {
    if (!(pageRoot instanceof globalThis.HTMLElement)) {
      return null;
    }

    const toolbar = pageRoot.querySelector(".v-Toolbar");
    return toolbar instanceof globalThis.HTMLElement ? toolbar : null;
  }

  function findPrimaryThreadRoot(pageRoot) {
    if (!(pageRoot instanceof globalThis.HTMLElement)) {
      return null;
    }

    const candidates = Array.from(pageRoot.querySelectorAll(".v-Page-content .v-Thread")).filter(
      (candidate) => candidate instanceof globalThis.HTMLElement
    );

    if (candidates.length === 0) {
      return null;
    }

    let bestCandidate = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate, index) => {
      const title = candidate.querySelector(".v-Thread-title h1");
      const titleText = normalizeIdentityValue(title?.textContent || "", 320);
      const messageCardCount = candidate.querySelectorAll(".v-MessageCard.app-contentCard").length;
      const rect = typeof candidate.getBoundingClientRect === "function"
        ? candidate.getBoundingClientRect()
        : { width: 1, height: 1 };
      const isVisible = rect.width > 0 || rect.height > 0;
      const score = (
        (titleText ? 1000 : 0) +
        (isVisible ? 100 : 0) +
        Math.min(messageCardCount, 20) * 10 +
        index
      );

      if (score >= bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });

    return bestCandidate instanceof globalThis.HTMLElement ? bestCandidate : null;
  }

  function findTitleElement(threadRoot) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return null;
    }

    const title = threadRoot.querySelector(".v-Thread-title h1");
    return title instanceof globalThis.HTMLElement ? title : null;
  }

  function getTitleText(threadRoot) {
    return normalizeIdentityValue(findTitleElement(threadRoot)?.textContent || "", 320);
  }

  function ensureThreadState(threadRoot) {
    let state = getExistingThreadState(threadRoot);

    if (state) {
      return state;
    }

    const staleState = getExistingThreadState(threadRoot, { includeStale: true });
    if (staleState) {
      runtimeState.deactivateThreadState(staleState);
    }

    state = runtimeState.createThreadState();
    state.root = threadRoot;
    runtimeState.state.threadStates.set(threadRoot, state);
    return state;
  }

  function getExistingThreadState(threadRoot, { includeStale = false } = {}) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return null;
    }

    const state = runtimeState.state.threadStates.get(threadRoot) || null;
    if (!includeStale && state && !runtimeState.isThreadStateCurrent(state)) {
      return null;
    }

    return state;
  }

  function resetThreadState(threadRoot) {
    const threadState = getExistingThreadState(threadRoot, { includeStale: true });
    if (threadState) {
      runtimeState.deactivateThreadState(threadState);
      runtimeState.state.threadStates.delete(threadRoot);
    }
  }

  function isThreadActive(threadRoot) {
    return getExistingThreadState(threadRoot)?.active === true;
  }

  function ensureTranslateDivider(toolbar) {
    const existingDivider = toolbar.querySelector(".fmt-translate-divider");
    if (existingDivider instanceof globalThis.HTMLElement) {
      return existingDivider;
    }

    const divider = document.createElement("span");
    divider.className = "v-Toolbar-divider fmt-translate-divider";
    return divider;
  }

  function ensureTranslateButton(toolbar, onTranslateClick) {
    const buttons = Array.from(toolbar.querySelectorAll(`.${constants.BUTTON_CLASS}`)).filter((candidate) => {
      return candidate instanceof globalThis.HTMLElement && candidate.closest(".v-Toolbar") === toolbar;
    });
    const [existingButton, ...duplicates] = buttons;

    duplicates.forEach((duplicate) => duplicate.remove());

    const button = existingButton instanceof globalThis.HTMLButtonElement
      ? existingButton
      : toolbarButtonApi.createToolbarButton({
        document,
        constants,
        i18n
      });
    const divider = ensureTranslateDivider(toolbar);

    bindTranslateButton(button, onTranslateClick);
    toolbarButtonApi.placeToolbarButton(toolbar, button, divider);
    return button;
  }

  function removeToolbarTranslateButtons(toolbar) {
    if (!(toolbar instanceof globalThis.HTMLElement)) {
      return;
    }

    toolbar.querySelectorAll(`.${constants.BUTTON_CLASS}`).forEach((button) => {
      if (!(button instanceof globalThis.HTMLElement)) {
        return;
      }

      unbindTranslateButton(button);
      toolbarButtonThreadRoots.delete(button);
      button.remove();
    });

    toolbar.querySelectorAll(".fmt-translate-divider").forEach((divider) => {
      if (divider instanceof globalThis.HTMLElement) {
        divider.remove();
      }
    });
  }

  function bindTranslateButton(button, onTranslateClick) {
    if (!(button instanceof globalThis.HTMLButtonElement) || typeof onTranslateClick !== "function") {
      return;
    }

    const binding = toolbarButtonClickHandlers.get(button) || null;
    if (binding?.onTranslateClick === onTranslateClick) {
      return;
    }

    if (typeof binding?.clickHandler === "function") {
      button.removeEventListener("click", binding.clickHandler);
    }
    if (typeof binding?.mouseUpHandler === "function") {
      button.removeEventListener("mouseup", binding.mouseUpHandler);
    }

    const activationState = {
      lastMouseUpTimeStamp: Number.NEGATIVE_INFINITY
    };

    const invokeTranslateClick = (event) => {
      if (event?.[TRANSLATE_CLICK_HANDLED]) {
        return;
      }

      event[TRANSLATE_CLICK_HANDLED] = true;
      void onTranslateClick({
        currentTarget: button,
        type: event?.type || "click",
        originalEvent: event
      });
    };

    const mouseUpHandler = (event) => {
      if (!isPrimaryMouseActivation(event)) {
        return;
      }

      activationState.lastMouseUpTimeStamp = getEventTimeStamp(event);
      invokeTranslateClick(event);
    };
    const clickHandler = (event) => {
      if (shouldSkipClickAfterMouseUp(event, activationState.lastMouseUpTimeStamp)) {
        event[TRANSLATE_CLICK_HANDLED] = true;
        return;
      }

      invokeTranslateClick(event);
    };

    button.addEventListener("mouseup", mouseUpHandler);
    button.addEventListener("click", clickHandler);
    toolbarButtonClickHandlers.set(button, {
      clickHandler,
      mouseUpHandler,
      onTranslateClick
    });
  }

  function unbindTranslateButton(button) {
    if (!(button instanceof globalThis.HTMLButtonElement)) {
      return;
    }

    const binding = toolbarButtonClickHandlers.get(button) || null;
    if (typeof binding?.clickHandler === "function") {
      button.removeEventListener("click", binding.clickHandler);
    }
    if (typeof binding?.mouseUpHandler === "function") {
      button.removeEventListener("mouseup", binding.mouseUpHandler);
    }

    toolbarButtonClickHandlers.delete(button);
  }

  function isManagedTranslateButton(button) {
    return button instanceof globalThis.HTMLButtonElement
      && toolbarButtonClickHandlers.has(button);
  }

  function isPrimaryMouseActivation(event) {
    if (!event) {
      return false;
    }

    return event.button === undefined || event.button === 0;
  }

  function getEventTimeStamp(event) {
    return typeof event?.timeStamp === "number" ? event.timeStamp : Number.NEGATIVE_INFINITY;
  }

  function shouldSkipClickAfterMouseUp(event, lastMouseUpTimeStamp) {
    if (!event || event.detail <= 0 || !Number.isFinite(lastMouseUpTimeStamp)) {
      return false;
    }

    const clickTimeStamp = getEventTimeStamp(event);
    return clickTimeStamp >= lastMouseUpTimeStamp
      && (clickTimeStamp - lastMouseUpTimeStamp) <= MOUSEUP_CLICK_DEDUP_WINDOW_MS;
  }

  function injectButtons(root, onTranslateClick) {
    runtimeState.withObserverMuted(() => {
      const pageRoots = pageLocator.collectPageRoots(root);

      for (const pageRoot of pageRoots) {
        if (!(pageRoot instanceof globalThis.HTMLElement)) {
          continue;
        }

        const threadRoot = findPrimaryThreadRoot(pageRoot);
        const toolbar = findToolbarForPageRoot(pageRoot, threadRoot);
        const threadTitle = threadRoot instanceof globalThis.HTMLElement
          ? threadRoot.querySelector(".v-Thread-title")
          : null;

        if (!(toolbar instanceof globalThis.HTMLElement) || !(threadTitle instanceof globalThis.HTMLElement)) {
          removeToolbarTranslateButtons(toolbar);
          continue;
        }

        const button = ensureTranslateButton(toolbar, onTranslateClick);
        toolbarButtonThreadRoots.set(button, threadRoot);
        updateButtonState(button, isThreadActive(threadRoot));
      }
    });
  }

  function getThreadMessageEntries(threadRoot) {
    const cards = Array.from(threadRoot.querySelectorAll(".v-MessageCard.app-contentCard")).filter(
      (card) => card instanceof globalThis.HTMLElement
    );

    return cards.map((card) => ({
      card,
      header: card.querySelector(".v-MessageCard-header"),
      messageNode: findMessageNodeForCard(card)
    }));
  }

  function findMessageNodeForCard(card) {
    if (!(card instanceof globalThis.HTMLElement)) {
      return null;
    }

    const nestedMessage = card.querySelector(".v-Message");
    if (nestedMessage instanceof globalThis.HTMLElement) {
      return nestedMessage;
    }

    for (let sibling = card.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      if (!(sibling instanceof globalThis.HTMLElement)) {
        continue;
      }

      if (sibling.matches(".v-MessageCard.app-contentCard")) {
        break;
      }

      if (sibling.matches(".v-Message")) {
        return sibling;
      }

      const nestedSiblingMessage = sibling.querySelector(".v-Message");
      if (nestedSiblingMessage instanceof globalThis.HTMLElement) {
        return nestedSiblingMessage;
      }
    }

    return null;
  }

  function getMessageDataId(entry) {
    return normalizeIdentityValue(
      entry.messageNode?.getAttribute("data-message-id")
      || entry.card?.getAttribute("data-message-id")
      || "",
      320
    );
  }

  function getMessageDetailsFingerprint(messageNode) {
    if (!(messageNode instanceof globalThis.HTMLElement)) {
      return "";
    }

    const detailsList = messageNode.querySelector(".v-Message-detailsList");
    if (detailsList instanceof globalThis.HTMLElement) {
      return normalizeIdentityValue(detailsList.textContent || "", 400);
    }

    return "";
  }

  function getMessageInstanceId(entry) {
    return normalizeIdentityValue(
      entry.card?.getAttribute(constants.MESSAGE_INSTANCE_ATTRIBUTE)
      || entry.messageNode?.getAttribute(constants.MESSAGE_INSTANCE_ATTRIBUTE)
      || "",
      320
    );
  }

  function getOrAssignMessageInstanceId(entry) {
    const existingId = getMessageInstanceId(entry);
    if (existingId) {
      return existingId;
    }

    const instanceId = runtimeState.nextMessageInstanceId();
    runtimeState.withObserverMuted(() => {
      if (entry.card instanceof globalThis.HTMLElement) {
        entry.card.setAttribute(constants.MESSAGE_INSTANCE_ATTRIBUTE, instanceId);
      }

      if (entry.messageNode instanceof globalThis.HTMLElement) {
        entry.messageNode.setAttribute(constants.MESSAGE_INSTANCE_ATTRIBUTE, instanceId);
      }
    });

    return instanceId;
  }

  function buildMessageIdentity(entry, bodyElement) {
    const dataMessageId = getMessageDataId(entry);
    const detailsFingerprint = getMessageDetailsFingerprint(entry.messageNode);
    const fromText = normalizeIdentityValue(
      entry.card?.querySelector(".v-MessageCard-from")?.getAttribute("title")
      || entry.card?.querySelector(".v-MessageCard-from")?.textContent
      || ""
    );
    const toText = normalizeIdentityValue(
      entry.card?.querySelector(".v-Message-toName")?.getAttribute("title")
      || entry.card?.querySelector(".v-Message-toName")?.textContent
      || ""
    );
    const exactDateText = normalizeIdentityValue(entry.card?.querySelector(".v-MessageCard-time")?.getAttribute("title") || "");
    const bodyTextSource = bodyElement instanceof globalThis.HTMLElement
      ? bodyElement
      : entry.messageNode instanceof globalThis.HTMLElement
        ? entry.messageNode
        : null;
    const bodyExcerpt = !dataMessageId && !detailsFingerprint && bodyTextSource
      ? normalizeIdentityValue(segmenter.extractBodyText(bodyTextSource).slice(0, 200), 200)
      : "";

    return buildIdentity("message", [
      dataMessageId,
      detailsFingerprint,
      fromText,
      toText,
      exactDateText,
      bodyExcerpt
    ], entry.card?.id || entry.messageNode?.id || "message");
  }

  function collectMessageDescriptors(threadRoot) {
    return getThreadMessageEntries(threadRoot).map((entry) => {
      const instanceId = getOrAssignMessageInstanceId(entry);
      const body = findBodyElement(entry.messageNode);
      const contentRoot = body instanceof globalThis.HTMLElement
        ? findPrimaryContentRoot(body) || body
        : null;
      const identity = buildMessageIdentity(entry, body);

      return {
        instanceId,
        identity,
        card: entry.card,
        header: entry.header,
        messageNode: entry.messageNode,
        body,
        contentRoot
      };
    });
  }

  function reconcileMessageStates(threadState, descriptors) {
    const liveKeys = new Set();

    for (const descriptor of descriptors) {
      descriptor.key = `${threadState.key}::${descriptor.instanceId}`;
      liveKeys.add(descriptor.key);
      let messageState = threadState.messages.get(descriptor.key);

      if (!messageState) {
        messageState = runtimeState.createMessageState({
          key: descriptor.key,
          identity: descriptor.identity,
          instanceId: descriptor.instanceId
        });
        threadState.messages.set(descriptor.key, messageState);
      }

      const identityChanged = messageState.identity && messageState.identity !== descriptor.identity;
      if (identityChanged) {
        messageState.status = "idle";
        messageState.segmentSignature = "";
        messageState.translatedSegments = null;
        messageState.error = "";
        messageState.requestSerial += 1;
      }

      messageState.identity = descriptor.identity;
      messageState.instanceId = descriptor.instanceId;
      descriptor.state = messageState;
    }

    for (const key of threadState.messages.keys()) {
      if (!liveKeys.has(key)) {
        threadState.messages.delete(key);
      }
    }
  }

  function findMessageEntryByInstanceId(threadRoot, instanceId) {
    if (!(threadRoot instanceof globalThis.HTMLElement) || !instanceId) {
      return null;
    }

    return getThreadMessageEntries(threadRoot).find((entry) => {
      return getMessageInstanceId(entry) === instanceId;
    }) || null;
  }

  function findLiveMessageElements(threadRoot, descriptor) {
    const directBody = findBodyElement(descriptor.messageNode);
    if (directBody instanceof globalThis.HTMLElement && directBody.isConnected) {
      return {
        body: directBody,
        contentRoot: findPrimaryContentRoot(directBody) || directBody
      };
    }

    const liveEntry = findMessageEntryByInstanceId(threadRoot, descriptor.state?.instanceId || descriptor.instanceId);
    if (!liveEntry) {
      return {
        body: null,
        contentRoot: null
      };
    }

    const liveBody = findBodyElement(liveEntry.messageNode);

    return {
      body: liveBody instanceof globalThis.HTMLElement ? liveBody : null,
      contentRoot: liveBody instanceof globalThis.HTMLElement
        ? findPrimaryContentRoot(liveBody) || liveBody
        : null
    };
  }

  function findBodyElement(messageNode) {
    if (!(messageNode instanceof globalThis.HTMLElement)) {
      return null;
    }

    const explicitSelectors = [
      ".v-Message-body",
      ".v-Message-bodyContents",
      ".v-MessageBody",
      ".u-containSelection.v-Message-body"
    ];

    for (const selector of explicitSelectors) {
      const found = messageNode.matches(selector)
        ? messageNode
        : messageNode.querySelector(selector);

      if (found instanceof globalThis.HTMLElement && policies.isExplicitBodyText(segmenter.extractBodyText(found))) {
        return found;
      }
    }

    let bestCandidate = null;
    let bestScore = 0;

    for (const candidate of messageNode.querySelectorAll(".u-article, article, section, pre, blockquote, div")) {
      if (!(candidate instanceof globalThis.HTMLElement)) {
        continue;
      }

      if (candidate.closest(`.${constants.INLINE_TRANSLATION_CLASS}`)) {
        continue;
      }

      const text = segmenter.extractBodyText(candidate);
      if (!policies.isCandidateBodyText(text)) {
        continue;
      }

      const rect = candidate.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }

      const score = text.length - candidate.querySelectorAll("button, input, svg").length * 20;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (!(bestCandidate instanceof globalThis.HTMLElement)) {
      return null;
    }

    return bestCandidate.closest(".v-Message-body, .v-Message-bodyContents, .v-MessageBody")
      || bestCandidate;
  }

  function isMessageBodyDeferred(descriptor) {
    const card = descriptor?.card;
    if (!(card instanceof globalThis.HTMLElement)) {
      return false;
    }

    if (card.classList.contains("is-collapsed")) {
      return true;
    }

    return Boolean(card.querySelector(".v-MessageCard-loadingBody"));
  }

  function findPrimaryContentRoot(container) {
    if (!(container instanceof globalThis.HTMLElement)) {
      return null;
    }

    const preferredSelectors = [".u-article", "article", "pre", "blockquote", "section", "div"];
    let bestCandidate = null;
    let bestScore = 0;

    for (const selector of preferredSelectors) {
      for (const candidate of container.querySelectorAll(selector)) {
        if (!(candidate instanceof globalThis.HTMLElement)) {
          continue;
        }

        if (candidate.closest(`.${constants.INLINE_TRANSLATION_CLASS}`)) {
          continue;
        }

        const text = segmenter.extractBodyText(candidate);
        if (text.length < 20) {
          continue;
        }

        if (text.length > bestScore) {
          bestScore = text.length;
          bestCandidate = candidate;
        }
      }
    }

    return bestCandidate;
  }

  function syncThreadButtons(threadRoot, isActive) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return;
    }

    threadRoot.querySelectorAll(`.${constants.BUTTON_CLASS}`).forEach((button) => {
      if (button instanceof globalThis.HTMLElement) {
        updateButtonState(button, isActive);
      }
    });

    const pageRoot = pageLocator.findPageRoot(threadRoot);
    const toolbar = findToolbarForPageRoot(pageRoot, threadRoot);
    if (!(toolbar instanceof globalThis.HTMLElement)) {
      return;
    }

    const candidates = toolbar.querySelectorAll(`.${constants.BUTTON_CLASS}`);
    for (const candidate of candidates) {
      if (!(candidate instanceof globalThis.HTMLElement)) {
        continue;
      }

      if (toolbarButtonThreadRoots.get(candidate) === threadRoot) {
        updateButtonState(candidate, isActive);
      }
    }
  }

  function updateButtonState(button, isActive) {
    runtimeState.withObserverMuted(() => {
      toolbarButtonApi.updateToolbarButtonState(button, isActive, { constants, i18n });
    });
  }

  function pruneDetachedThreadStates() {
    for (const threadState of Array.from(runtimeState.state.activeThreadStates)) {
      if (threadState.root instanceof globalThis.HTMLElement && threadState.root.isConnected) {
        continue;
      }

      runtimeState.deactivateThreadState(threadState);
      if (threadState.root instanceof globalThis.HTMLElement) {
        runtimeState.state.threadStates.delete(threadState.root);
      }
    }
  }

  function clearThreadDomState(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return;
    }

    runtimeState.withObserverMuted(() => {
      root.querySelectorAll(`[${constants.MESSAGE_INSTANCE_ATTRIBUTE}], [${constants.SEGMENT_ATTRIBUTE}]`).forEach((node) => {
        if (!(node instanceof globalThis.HTMLElement)) {
          return;
        }

        node.removeAttribute(constants.MESSAGE_INSTANCE_ATTRIBUTE);
        node.removeAttribute(constants.SEGMENT_ATTRIBUTE);
      });
    });
  }

  return {
    findThreadRoot,
    findPrimaryThreadRoot,
    findToolbarForPageRoot,
    findTitleElement,
    getTitleText,
    ensureThreadState,
    getExistingThreadState,
    resetThreadState,
    isThreadActive,
    injectButtons,
    getThreadMessageEntries,
    collectMessageDescriptors,
    reconcileMessageStates,
    findLiveMessageElements,
    findBodyElement,
    findPrimaryContentRoot,
    isMessageBodyDeferred,
    syncThreadButtons,
    updateButtonState,
    isManagedTranslateButton,
    pruneDetachedThreadStates,
    clearThreadDomState
  };
}

module.exports = { createThreadDom };
