# FastTrMail Tampermonkey

[简体中文](README.md)

This is the standalone Tampermonkey repository for FastTrMail and runs only on Fastmail pages.

## Scope

- Matches `https://app.fastmail.com/*` only
- Keeps only the `edge-web` translation transport
- Preserves the subject/body “append below original text” translation pattern
- Preserves the second-click restore-original interaction
- Preserves the existing Fastmail toolbar button position
- Keeps only one setting: `targetLanguage`

## Settings Entry

- Tampermonkey menu command: `FastTrMail 设置`
- In-page modal: choose and save the target language

## Local Development

```bash
npm install
npm test
npm run build
```

Build outputs:

- `dist/fasttrmail.user.js`
- `dist/fasttrmail-tampermonkey-<version>.user.js`

## Installation

1. Install Tampermonkey in your browser.
2. Open `dist/fasttrmail.user.js`.
3. Import and enable the script.
4. Open a Fastmail message thread page and the `Translate` button will appear in the toolbar.

## Module Boundaries

- `src/fastmail/`: Fastmail DOM detection, thread/body targeting, message segmentation
- `src/translation/`: Edge auth, translation requests, cancellation control
- `src/ui/`: button, translation rendering, settings modal, styles
- `src/core/`: runtime state, page lifecycle, app orchestration
- `src/platform/`: wrappers around Tampermonkey `GM_*` APIs
