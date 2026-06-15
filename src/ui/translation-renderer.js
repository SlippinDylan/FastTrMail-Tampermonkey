function createTranslationRenderer({
  constants,
  i18n,
  runtimeState,
  segmenter,
  document = globalThis.document
}) {
  function removeInlineTranslations(bodyElement) {
    if (!(bodyElement instanceof globalThis.HTMLElement)) {
      return;
    }

    runtimeState.withObserverMuted(() => {
      bodyElement
        .querySelectorAll(`.${constants.INLINE_TRANSLATION_CLASS}, .${constants.SEGMENT_ANCHOR_CLASS}, .${constants.TRANSLATION_WRAPPER_CLASS}`)
        .forEach((node) => node.remove());
    });
  }

  function clearThreadRenderArtifacts(threadRoot) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return;
    }

    runtimeState.withObserverMuted(() => {
      threadRoot
        .querySelectorAll(`.${constants.INLINE_TRANSLATION_CLASS}, .${constants.SEGMENT_ANCHOR_CLASS}, .${constants.MESSAGE_STATUS_CLASS}, .${constants.TITLE_TRANSLATION_CLASS}, .${constants.TRANSLATION_WRAPPER_CLASS}`)
        .forEach((node) => node.remove());
    });
  }

  function hasThreadRenderArtifacts(threadRoot) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return false;
    }

    return threadRoot.querySelector(
      `.${constants.INLINE_TRANSLATION_CLASS}, .${constants.SEGMENT_ANCHOR_CLASS}, .${constants.MESSAGE_STATUS_CLASS}, .${constants.TITLE_TRANSLATION_CLASS}, .${constants.TRANSLATION_WRAPPER_CLASS}`
    ) !== null;
  }

  function getThreadRenderArtifactCounts(threadRoot) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return {
        inlineTranslations: 0,
        titleTranslations: 0,
        messageStatuses: 0,
        segmentAnchors: 0,
        translationWrappers: 0
      };
    }

    return {
      inlineTranslations: threadRoot.querySelectorAll(`.${constants.INLINE_TRANSLATION_CLASS}`).length,
      titleTranslations: threadRoot.querySelectorAll(`.${constants.TITLE_TRANSLATION_CLASS}`).length,
      messageStatuses: threadRoot.querySelectorAll(`.${constants.MESSAGE_STATUS_CLASS}`).length,
      segmentAnchors: threadRoot.querySelectorAll(`.${constants.SEGMENT_ANCHOR_CLASS}`).length,
      translationWrappers: threadRoot.querySelectorAll(`.${constants.TRANSLATION_WRAPPER_CLASS}`).length
    };
  }

  function clearTitleTranslation(threadRoot) {
    const titleNode = findTitleTranslationNode(threadRoot);
    if (!titleNode) {
      return;
    }

    runtimeState.withObserverMuted(() => {
      titleNode.remove();
    });
  }

  function renderTitleTranslation(threadRoot, sourceElement, content, state = "done") {
    if (!(threadRoot instanceof globalThis.HTMLElement) || !(sourceElement instanceof globalThis.HTMLElement)) {
      return false;
    }

    const normalizedContent = normalizeTranslationText(content);
    const existingNode = findTitleTranslationNode(threadRoot);
    if (existingNode) {
      return setTitleTranslationState(existingNode, { state, content: normalizedContent });
    }

    const node = document.createElement("div");
    node.className = constants.TITLE_TRANSLATION_CLASS;
    node.dataset.state = state;
    node.innerHTML = '<div class="fmt-title-translation-content"></div>';
    if (!setTitleTranslationState(node, { state, content: normalizedContent })) {
      return false;
    }

    runtimeState.withObserverMuted(() => {
      sourceElement.insertAdjacentElement("afterend", node);
    });

    return node.isConnected;
  }

  function clearMessageStatus(descriptor) {
    const statusNode = findMessageStatusNode(descriptor);
    if (statusNode) {
      runtimeState.withObserverMuted(() => {
        statusNode.remove();
      });
    }
  }

  function renderMessageStatus(descriptor, message, state = "info") {
    clearMessageStatus(descriptor);

    const mountTarget = getMessageStatusMountTarget(descriptor);
    if (!(mountTarget instanceof globalThis.HTMLElement)) {
      return false;
    }

    const node = document.createElement("div");
    node.className = constants.MESSAGE_STATUS_CLASS;
    node.dataset.state = state;
    node.dataset.messageKey = descriptor.key || "";
    node.textContent = normalizeTranslationText(message);

    runtimeState.withObserverMuted(() => {
      if (mountTarget.matches(".v-Message-body, .u-containSelection, .u-article, article, pre")) {
        mountTarget.insertAdjacentElement("afterbegin", node);
      } else {
        mountTarget.insertAdjacentElement("afterend", node);
      }
    });

    return node.isConnected;
  }

  function createRenderResult(expectedCount) {
    return {
      ok: true,
      expectedCount,
      renderedCount: 0,
      failedSegments: []
    };
  }

  function renderLoadingTranslations(segments) {
    return renderSegmentNodes(segments, segments.map(() => i18n.t("content.loading")), "loading");
  }

  function renderTranslatedSegments(segments, translatedSegments) {
    return renderSegmentNodes(segments, translatedSegments, "done");
  }

  function renderSegmentError(segments, message) {
    return renderSegmentNodes(segments, segments.map(() => message), "error");
  }

  function renderSegmentNodes(segments, contents, state) {
    const result = createRenderResult(segments.length);

    segments.forEach((segment, index) => {
      let translationNode = findInlineTranslationNode(segment);
      if (!translationNode) {
        translationNode = insertTranslationNode(segment, {
          state,
          content: contents[index]
        });
      }

      if (!translationNode) {
        result.ok = false;
        result.failedSegments.push({
          segmentId: segment.id,
          reason: "insert-failed"
        });
        return;
      }

      const didUpdate = setInlineTranslationState(translationNode, {
        state,
        content: contents[index]
      });

      if (!didUpdate) {
        result.ok = false;
        result.failedSegments.push({
          segmentId: segment.id,
          reason: "update-failed"
        });
        return;
      }

      result.renderedCount += 1;
    });

    return result;
  }

  function insertTranslationNode(segment, { state, content }) {
    const node = document.createElement("div");
    node.className = constants.INLINE_TRANSLATION_CLASS;
    node.dataset.state = state;
    node.setAttribute(constants.SEGMENT_ATTRIBUTE, segment.id || "");
    node.innerHTML = '<div class="fmt-inline-translation-content"></div>';
    setInlineTranslationState(node, { state, content });

    const inserted = runtimeState.withObserverMuted(() => insertTranslationAtValidPosition(segment, node));
    return inserted ? node : null;
  }

  function setInlineTranslationState(node, { state, content }) {
    if (!(node instanceof globalThis.HTMLElement)) {
      return false;
    }

    const normalizedContent = normalizeTranslationText(content);
    const contentNode = node.querySelector(".fmt-inline-translation-content");
    if (!(contentNode instanceof globalThis.HTMLElement)) {
      return false;
    }

    return runtimeState.withObserverMuted(() => {
      node.dataset.state = state;
      contentNode.textContent = normalizedContent;
      return true;
    });
  }

  function setTitleTranslationState(node, { state, content }) {
    if (!(node instanceof globalThis.HTMLElement)) {
      return false;
    }

    const normalizedContent = normalizeTranslationText(content);
    const contentNode = node.querySelector(".fmt-title-translation-content");
    if (!(contentNode instanceof globalThis.HTMLElement)) {
      return false;
    }

    return runtimeState.withObserverMuted(() => {
      node.dataset.state = state;
      contentNode.textContent = normalizedContent;
      return true;
    });
  }

  function findInlineTranslationNode(segmentOrId) {
    const segmentId = typeof segmentOrId === "string" ? segmentOrId : segmentOrId?.id;
    if (!segmentId) {
      return null;
    }

    if (segmentOrId && typeof segmentOrId === "object") {
      const localNode = findInlineTranslationNodeNearSegment(segmentOrId, segmentId);
      if (localNode) {
        return localNode;
      }
    }

    return document.querySelector(`.${constants.INLINE_TRANSLATION_CLASS}[${constants.SEGMENT_ATTRIBUTE}="${segmentId}"]`);
  }

  function findInlineTranslationNodeNearSegment(segment, segmentId) {
    if (segment.referenceNode) {
      const anchor = segmenter.getExistingSegmentAnchor(segment.referenceNode);
      const sibling = anchor?.nextElementSibling || null;
      if (matchesInlineTranslationNode(sibling, segmentId)) {
        return sibling;
      }
    }

    const element = segment.element;
    if (!(element instanceof globalThis.HTMLElement)) {
      return null;
    }

    if (matchesInlineTranslationNode(element.lastElementChild, segmentId)) {
      return element.lastElementChild;
    }

    if (matchesInlineTranslationNode(element.nextElementSibling, segmentId)) {
      return element.nextElementSibling;
    }

    const rowSibling = element.parentElement?.nextElementSibling;
    if (rowSibling instanceof globalThis.HTMLElement) {
      const rowNode = rowSibling.querySelector(`.${constants.INLINE_TRANSLATION_CLASS}[${constants.SEGMENT_ATTRIBUTE}="${segmentId}"]`);
      if (rowNode instanceof globalThis.HTMLElement) {
        return rowNode;
      }
    }

    return null;
  }

  function matchesInlineTranslationNode(node, segmentId) {
    return node instanceof globalThis.HTMLElement
      && node.classList.contains(constants.INLINE_TRANSLATION_CLASS)
      && node.getAttribute(constants.SEGMENT_ATTRIBUTE) === segmentId;
  }

  function insertTranslationAtValidPosition(segment, node) {
    if (segment.referenceNode) {
      const anchor = segmenter.ensureSegmentAnchor(segment.referenceNode);
      if (!(anchor instanceof globalThis.HTMLElement) || !anchor.isConnected) {
        return false;
      }
      anchor.insertAdjacentElement("afterend", node);
      return node.isConnected;
    }

    const element = segment.element;
    if (!(element instanceof globalThis.HTMLElement)) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();

    if (tagName === "td" || tagName === "th") {
      element.appendChild(node);
      return true;
    }

    const parentTag = element.parentElement?.tagName?.toLowerCase();
    if (parentTag === "tr") {
      const wrapper = document.createElement("td");
      wrapper.className = constants.TRANSLATION_WRAPPER_CLASS;
      const colSpan = element.parentElement.children.length;
      if (colSpan > 1) {
        wrapper.colSpan = colSpan;
      }
      wrapper.appendChild(node);

      const row = document.createElement("tr");
      row.className = constants.TRANSLATION_WRAPPER_CLASS;
      row.appendChild(wrapper);
      element.parentElement.insertAdjacentElement("afterend", row);
      return true;
    }

    element.insertAdjacentElement("afterend", node);
    return true;
  }

  function getMessageStatusMountTarget(descriptor) {
    if (descriptor?.body instanceof globalThis.HTMLElement && descriptor.body.isConnected) {
      return descriptor.body;
    }

    if (descriptor?.messageNode instanceof globalThis.HTMLElement && descriptor.messageNode.isConnected) {
      return descriptor.messageNode;
    }

    if (descriptor?.card instanceof globalThis.HTMLElement && descriptor.card.isConnected) {
      return descriptor.card;
    }

    return null;
  }

  function findMessageStatusNode(descriptor) {
    const key = descriptor?.key;
    if (!key) {
      return null;
    }

    return document.querySelector(`.${constants.MESSAGE_STATUS_CLASS}[data-message-key="${key}"]`);
  }

  function findTitleTranslationNode(threadRoot) {
    if (!(threadRoot instanceof globalThis.HTMLElement)) {
      return null;
    }

    return threadRoot.querySelector(`.${constants.TITLE_TRANSLATION_CLASS}`);
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

  return {
    clearMessageStatus,
    clearThreadRenderArtifacts,
    clearTitleTranslation,
    findInlineTranslationNode,
    findTitleTranslationNode,
    getMessageStatusMountTarget,
    getThreadRenderArtifactCounts,
    hasThreadRenderArtifacts,
    removeInlineTranslations,
    renderLoadingTranslations,
    renderMessageStatus,
    renderSegmentError,
    renderTitleTranslation,
    renderTranslatedSegments
  };
}

module.exports = { createTranslationRenderer };
