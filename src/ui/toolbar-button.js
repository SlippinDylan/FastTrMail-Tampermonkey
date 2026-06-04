function createToolbarButton({ document, constants, i18n }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `v-Button v-Button--subtleStandard v-Button--sizeM ${constants.BUTTON_CLASS}`;
  button.innerHTML = "<span class=\"label\"></span>";
  updateToolbarButtonState(button, false, { constants, i18n });
  return button;
}

function normalizeActionLabel(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isMoreActionLabel(text) {
  const normalized = normalizeActionLabel(text);
  return normalized === "more" || normalized === "更多";
}

function getButtonLabel(button) {
  if (!button) {
    return "";
  }

  if (typeof button.textContent === "string" && button.classList?.contains("label")) {
    return button.textContent;
  }

  if (typeof button.querySelector === "function") {
    return button.querySelector(".label")?.textContent || button.textContent || "";
  }

  return button.textContent || "";
}

function placeToolbarButton(toolbar, button, divider) {
  const actionButtons = Array.from(toolbar.querySelectorAll(":scope > button"));
  const anchorButton = actionButtons.find((candidate) => {
    return candidate !== button && isMoreActionLabel(getButtonLabel(candidate));
  });
  const spacer = toolbar.querySelector(".v-Toolbar-flex");

  if (anchorButton?.nextElementSibling) {
    toolbar.insertBefore(divider, anchorButton.nextElementSibling);
    toolbar.insertBefore(button, divider.nextElementSibling);
    return;
  }

  if (spacer instanceof HTMLElement) {
    toolbar.insertBefore(divider, spacer);
    toolbar.insertBefore(button, spacer);
    return;
  }

  toolbar.appendChild(divider);
  toolbar.appendChild(button);
}

function updateToolbarButtonState(button, isActive, { constants, i18n }) {
  const label = i18n.t(isActive ? "content.restoreOriginal" : "content.translate");
  button.setAttribute("title", label);
  button.setAttribute("aria-label", label);
  button.classList.toggle(constants.BUTTON_ACTIVE_CLASS, isActive);

  const labelNode = button.querySelector(".label");
  if (labelNode) {
    labelNode.textContent = label;
  }
}

module.exports = {
  createToolbarButton,
  getButtonLabel,
  isMoreActionLabel,
  placeToolbarButton,
  updateToolbarButtonState
};
