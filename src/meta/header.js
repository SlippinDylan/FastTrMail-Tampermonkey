module.exports = function createHeader({ version, author, iconUrl }) {
  return `// ==UserScript==
// @name         FastTrMail
// @namespace    https://github.com/dylanwang/FastTrMail-Tampermonkey
// @version      ${version}
// @author       ${author}
// @license      MIT
// @description  Translate Fastmail message views inline with built-in web translators.
// @icon         ${iconUrl}
// @match        https://app.fastmail.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      edge.microsoft.com
// @connect      api.cognitive.microsofttranslator.com
// @connect      translate.googleapis.com
// ==/UserScript==`;
};
