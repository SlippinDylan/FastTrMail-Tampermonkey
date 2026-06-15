function createStyles(constants) {
  return `
    .${constants.BUTTON_CLASS}.${constants.BUTTON_ACTIVE_CLASS} {
      color: #467dde;
      font-weight: 600;
    }

    .${constants.TITLE_TRANSLATION_CLASS},
    .${constants.INLINE_TRANSLATION_CLASS},
    .${constants.MESSAGE_STATUS_CLASS} {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .${constants.TITLE_TRANSLATION_CLASS}[data-state="done"],
    .${constants.INLINE_TRANSLATION_CLASS}[data-state="done"] {
      color: #467dde;
      background: rgba(70, 125, 222, 0.09);
    }

    .${constants.TITLE_TRANSLATION_CLASS}[data-state="loading"],
    .${constants.INLINE_TRANSLATION_CLASS}[data-state="loading"],
    .${constants.MESSAGE_STATUS_CLASS}[data-state="info"] {
      color: #76859c;
      background: rgba(170, 182, 200, 0.1);
    }

    .${constants.TITLE_TRANSLATION_CLASS}[data-state="error"],
    .${constants.INLINE_TRANSLATION_CLASS}[data-state="error"],
    .${constants.MESSAGE_STATUS_CLASS}[data-state="error"] {
      color: #c94b5b;
      background: rgba(255, 122, 122, 0.08);
    }

    .${constants.MODAL_OVERLAY_CLASS} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(17, 24, 39, 0.38);
      backdrop-filter: blur(6px);
    }

    .${constants.MODAL_CLASS} {
      width: min(420px, 100%);
      padding: 20px;
      border-radius: 16px;
      background: #ffffff;
      color: #1f2937;
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.22);
      font-family: "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    .${constants.MODAL_CLASS} h2 {
      margin: 0 0 16px;
      font-size: 18px;
      line-height: 1.3;
    }

    .${constants.MODAL_CLASS} label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #4b5563;
    }

    .${constants.MODAL_CLASS} select {
      width: 100%;
      height: 40px;
      padding: 0 12px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      background: #ffffff;
      color: #111827;
      font-size: 14px;
    }

    .${constants.MODAL_CLASS} .fmt-settings-modal-provider-notice {
      margin: 8px 0 0;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.45;
    }

    .${constants.MODAL_CLASS} .fmt-settings-modal-error {
      min-height: 20px;
      margin-top: 10px;
      color: #c94b5b;
      font-size: 13px;
      line-height: 1.4;
    }

    .${constants.MODAL_CLASS} footer {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 20px;
    }

    .${constants.MODAL_CLASS} button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 88px;
      height: 38px;
      padding: 0 14px;
      border: 0;
      border-radius: 10px;
      font-size: 14px;
      cursor: pointer;
    }

    .${constants.MODAL_CLASS} button[data-variant="secondary"] {
      background: #e5e7eb;
      color: #1f2937;
    }

    .${constants.MODAL_CLASS} button[data-variant="primary"] {
      background: #2563eb;
      color: #ffffff;
    }
  `;
}

module.exports = { createStyles };
