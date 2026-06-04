module.exports = function createHeader(version) {
  return `// ==UserScript==
// @name         FastTrMail
// @namespace    https://github.com/dylanwang/FastTrMail-Tampermonkey
// @version      ${version}
// @description  Translate Fastmail message views inline with Microsoft Edge transport.
// @match        https://app.fastmail.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      edge.microsoft.com
// @connect      api.cognitive.microsofttranslator.com
// ==/UserScript==`;
};
