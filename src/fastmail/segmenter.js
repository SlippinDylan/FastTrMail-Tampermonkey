function normalizeKeyText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeSegmentText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shouldSkipSegmentText(text) {
  const compact = normalizeKeyText(text);
  if (!compact) {
    return true;
  }

  return /^--\s*reply above this line\s*--$/i.test(compact);
}

function createSegmenter({
  constants,
  policies,
  runtimeState,
  document = globalThis.document
}) {
  function createTextExtractionCache() {
    return new WeakMap();
  }

  function getTextExtractionCache(options) {
    if (options instanceof WeakMap) {
      return options;
    }

    return options?.textCache instanceof WeakMap ? options.textCache : null;
  }

  function createElementSegment(element, text) {
    const segmentId = getOrAssignSegmentId(element);

    return {
      id: segmentId,
      element,
      sourceElement: element,
      text
    };
  }

  function createAnchoredSegment(referenceNode, sourceElement, text) {
    const anchor = ensureSegmentAnchor(referenceNode);
    const segmentId = getOrAssignSegmentId(anchor);

    return {
      id: segmentId,
      referenceNode,
      sourceElement,
      text
    };
  }

  function getOrAssignSegmentId(node) {
    if (!(node instanceof globalThis.HTMLElement)) {
      return runtimeState.nextSegmentId();
    }

    const existingId = node.getAttribute(constants.SEGMENT_ATTRIBUTE);
    if (existingId) {
      return existingId;
    }

    const segmentId = runtimeState.nextSegmentId();
    node.setAttribute(constants.SEGMENT_ATTRIBUTE, segmentId);
    return segmentId;
  }

  function getExistingSegmentAnchor(referenceNode) {
    let sibling = referenceNode?.nextSibling || null;
    while (sibling) {
      if (sibling instanceof globalThis.HTMLElement && sibling.classList.contains(constants.SEGMENT_ANCHOR_CLASS)) {
        return sibling;
      }

      if (sibling.nodeType === globalThis.Node.TEXT_NODE && !(sibling.textContent || "").trim()) {
        sibling = sibling.nextSibling;
        continue;
      }

      break;
    }

    return null;
  }

  function ensureSegmentAnchor(referenceNode) {
    const existingAnchor = getExistingSegmentAnchor(referenceNode);
    if (existingAnchor) {
      return existingAnchor;
    }

    if (!referenceNode?.parentNode) {
      return null;
    }

    const anchor = document.createElement("span");
    anchor.className = constants.SEGMENT_ANCHOR_CLASS;
    anchor.setAttribute("aria-hidden", "true");

    runtimeState.withObserverMuted(() => {
      referenceNode.parentNode.insertBefore(anchor, referenceNode.nextSibling);
    });

    return anchor;
  }

  function extractBodyText(element, options = undefined) {
    const textCache = getTextExtractionCache(options);
    if (textCache && element instanceof globalThis.HTMLElement && textCache.has(element)) {
      return textCache.get(element);
    }

    const clone = element?.cloneNode?.(true);

    if (!(clone instanceof globalThis.HTMLElement)) {
      return "";
    }

    clone
      .querySelectorAll(`.${constants.INLINE_TRANSLATION_CLASS}, .${constants.SEGMENT_ANCHOR_CLASS}, .${constants.TRANSLATION_WRAPPER_CLASS}, script, style, noscript, button`)
      .forEach((node) => node.remove());

    const text = clone.innerText || clone.textContent || "";
    const normalizedText = text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();

    if (textCache && element instanceof globalThis.HTMLElement) {
      textCache.set(element, normalizedText);
    }

    return normalizedText;
  }

  function isVisible(element) {
    if (!(element instanceof globalThis.HTMLElement)) {
      return false;
    }

    const rect = typeof element.getBoundingClientRect === "function"
      ? element.getBoundingClientRect()
      : { width: 1, height: 1 };
    return rect.width > 0 || rect.height > 0;
  }

  function isBlockSegmentCandidate(element) {
    const tagName = element.tagName.toLowerCase();
    return ["p", "div", "li", "blockquote", "td", "th", "h1", "h2", "h3", "h4", "pre"].includes(tagName);
  }

  function isStandaloneBlock(element, options = undefined) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "div" && element.querySelector("p, li, blockquote, td, th, h1, h2, h3, h4, pre")) {
      return false;
    }

    if (element.querySelector("table")) {
      return false;
    }

    for (const child of element.children) {
      if (!(child instanceof globalThis.HTMLElement)) {
        continue;
      }

      if (child.closest(`.${constants.INLINE_TRANSLATION_CLASS}`)) {
        continue;
      }

      if (!isBlockSegmentCandidate(child)) {
        continue;
      }

      const childText = extractBodyText(child, options);
      if (isVisible(child) && childText.length > 0) {
        return false;
      }
    }

    return true;
  }

  function isTranslatableSegment(text, element) {
    if (!text || text.length < 2) {
      return false;
    }

    if (element?.querySelector?.("img, video, iframe")) {
      return false;
    }

    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length < 2) {
      return false;
    }

    if (/^https?:\/\/\S+$/i.test(compact)) {
      return false;
    }

    return policies.hasTranslatableText(compact);
  }

  function hasNestedTranslatableBlocks(element, options = undefined) {
    const descendants = element.querySelectorAll("p, div, li, blockquote, td, th, h1, h2, h3, h4, pre");

    for (const descendant of descendants) {
      if (!(descendant instanceof globalThis.HTMLElement) || descendant === element) {
        continue;
      }

      if (descendant.closest(`.${constants.INLINE_TRANSLATION_CLASS}`)) {
        continue;
      }

      if (!isVisible(descendant)) {
        continue;
      }

      const text = extractBodyText(descendant, options);
      if (isTranslatableSegment(text, descendant)) {
        return true;
      }
    }

    return false;
  }

  function collectFlowSegments(container, options = undefined) {
    if (!(container instanceof globalThis.HTMLElement)) {
      return [];
    }

    const segments = [];
    let textParts = [];
    let lastContentNode = null;
    let consecutiveBreaks = 0;

    const flushSegment = () => {
      const text = normalizeSegmentText(textParts.join(""));
      if (
        !text ||
        !lastContentNode ||
        shouldSkipSegmentText(text) ||
        !isTranslatableSegment(text, container)
      ) {
        textParts = [];
        lastContentNode = null;
        consecutiveBreaks = 0;
        return;
      }

      if (!(lastContentNode?.parentNode)) {
        textParts = [];
        lastContentNode = null;
        consecutiveBreaks = 0;
        return;
      }

      segments.push(createAnchoredSegment(lastContentNode, container, text));
      textParts = [];
      lastContentNode = null;
      consecutiveBreaks = 0;
    };

    for (const node of Array.from(container.childNodes)) {
      if (node instanceof globalThis.HTMLElement && node.classList.contains(constants.SEGMENT_ANCHOR_CLASS)) {
        continue;
      }

      if (node instanceof globalThis.HTMLElement && node.classList.contains(constants.INLINE_TRANSLATION_CLASS)) {
        continue;
      }

      if (node instanceof globalThis.HTMLBRElement) {
        consecutiveBreaks += 1;
        if (consecutiveBreaks >= 2) {
          flushSegment();
        } else {
          textParts.push("\n");
        }
        continue;
      }

      if (node instanceof globalThis.HTMLHRElement) {
        flushSegment();
        continue;
      }

      if (node.nodeType === globalThis.Node.TEXT_NODE) {
        const text = node.textContent || "";
        textParts.push(text);
        if (text.trim()) {
          lastContentNode = node;
        }
        consecutiveBreaks = 0;
        continue;
      }

      if (node instanceof globalThis.HTMLElement) {
        if (isBlockSegmentCandidate(node)) {
          flushSegment();

          if (!isVisible(node)) {
            consecutiveBreaks = 0;
            continue;
          }

          const text = extractBodyText(node, options);
          if (
            !text ||
            shouldSkipSegmentText(text) ||
            !isTranslatableSegment(text, node) ||
            hasNestedTranslatableBlocks(node, options)
          ) {
            consecutiveBreaks = 0;
            continue;
          }

          segments.push(createElementSegment(node, text));
          consecutiveBreaks = 0;
          continue;
        }

        const text = extractBodyText(node, options);
        textParts.push(text);
        if (text.trim()) {
          lastContentNode = node;
        }
        consecutiveBreaks = 0;
      }
    }

    flushSegment();
    return segments;
  }

  function collectBlockSegments(root, options = undefined) {
    if (!(root instanceof globalThis.HTMLElement)) {
      return [];
    }

    const candidates = Array.from(
      root.querySelectorAll("p, div, li, blockquote, td, th, h1, h2, h3, h4, pre")
    );
    const segments = [];

    for (const candidate of candidates) {
      if (!(candidate instanceof globalThis.HTMLElement)) {
        continue;
      }

      if (candidate.closest(`.${constants.INLINE_TRANSLATION_CLASS}`)) {
        continue;
      }

      if (candidate.tagName.toLowerCase() === "pre") {
        segments.push(...collectFlowSegments(candidate, options));
        continue;
      }

      if (!isVisible(candidate) || !isStandaloneBlock(candidate, options)) {
        continue;
      }

      const text = extractBodyText(candidate, options);
      if (
        shouldSkipSegmentText(text) ||
        !isTranslatableSegment(text, candidate) ||
        hasNestedTranslatableBlocks(candidate, options)
      ) {
        continue;
      }

      segments.push(createElementSegment(candidate, text));
    }

    return segments;
  }

  function findFlowSegmentRoot(bodyElement) {
    if (!(bodyElement instanceof globalThis.HTMLElement)) {
      return null;
    }

    const preferredRoot = bodyElement.querySelector(".u-article, article, pre");
    return preferredRoot instanceof globalThis.HTMLElement ? preferredRoot : bodyElement;
  }

  function shouldUseFlowSegmentation(container, options = undefined) {
    if (!(container instanceof globalThis.HTMLElement)) {
      return false;
    }

    if (container.tagName.toLowerCase() === "pre") {
      return true;
    }

    for (const node of Array.from(container.childNodes)) {
      if (node instanceof globalThis.HTMLElement && node.classList.contains(constants.SEGMENT_ANCHOR_CLASS)) {
        continue;
      }

      if (node instanceof globalThis.HTMLElement && node.classList.contains(constants.INLINE_TRANSLATION_CLASS)) {
        continue;
      }

      if (node.nodeType === globalThis.Node.TEXT_NODE && (node.textContent || "").trim()) {
        return true;
      }

      if (node instanceof globalThis.HTMLBRElement || node instanceof globalThis.HTMLHRElement) {
        return true;
      }

      if (node instanceof globalThis.HTMLElement && !isBlockSegmentCandidate(node)) {
        const text = extractBodyText(node, options);
        if (text.trim()) {
          return true;
        }
      }
    }

    return false;
  }

  function createWholeRootFallbackSegment(root, options = undefined) {
    if (!(root instanceof globalThis.HTMLElement)) {
      return null;
    }

    const text = extractBodyText(root, options);
    if (!text || shouldSkipSegmentText(text) || !policies.hasTranslatableText(text)) {
      return null;
    }

    const lastContentNode = findLastMeaningfulNode(root, options);
    if (lastContentNode?.parentNode) {
      return createAnchoredSegment(lastContentNode, root, text);
    }

    return createElementSegment(root, text);
  }

  function findLastMeaningfulNode(root, options = undefined) {
    const nodes = Array.from(root.childNodes).reverse();
    for (const node of nodes) {
      if (node instanceof globalThis.HTMLElement && node.classList.contains(constants.INLINE_TRANSLATION_CLASS)) {
        continue;
      }

      if (node.nodeType === globalThis.Node.TEXT_NODE && !(node.textContent || "").trim()) {
        continue;
      }

      if (node instanceof globalThis.HTMLElement) {
        const text = extractBodyText(node, options);
        if (!text) {
          continue;
        }
      }

      return node;
    }

    return null;
  }

  function collectFallbackSegments(bodyElement, flowRoot, options = undefined) {
    const roots = [flowRoot, bodyElement].filter((root, index, items) => {
      return root instanceof globalThis.HTMLElement && items.indexOf(root) === index;
    });

    for (const root of roots) {
      const segment = createWholeRootFallbackSegment(root, options);
      if (segment) {
        return [segment];
      }
    }

    return [];
  }

  function collectTranslatableSegments(bodyElement, options = undefined) {
    const flowRoot = findFlowSegmentRoot(bodyElement);

    if (flowRoot && shouldUseFlowSegmentation(flowRoot, options)) {
      const flowSegments = collectFlowSegments(flowRoot, options);
      if (flowSegments.length > 0) {
        return flowSegments;
      }
    }

    const blockSegments = collectBlockSegments(bodyElement, options);
    if (blockSegments.length > 0) {
      return blockSegments;
    }

    return collectFallbackSegments(bodyElement, flowRoot, options);
  }

  function getSegmentSignature(segments) {
    return segments.map((segment) => normalizeKeyText(segment.text)).join("\u0001");
  }

  return {
    collectTranslatableSegments,
    createTextExtractionCache,
    ensureSegmentAnchor,
    extractBodyText,
    getExistingSegmentAnchor,
    getSegmentSignature,
    normalizeSegmentText,
    shouldSkipSegmentText
  };
}

function collectSegmentsFromTextBlocks(blocks) {
  return blocks
    .map((block, index) => ({
      id: `segment-${index}`,
      text: normalizeSegmentText(block)
    }))
    .filter((segment) => !shouldSkipSegmentText(segment.text) && segment.text);
}

module.exports = {
  collectSegmentsFromTextBlocks,
  createSegmenter,
  normalizeSegmentText,
  shouldSkipSegmentText
};
