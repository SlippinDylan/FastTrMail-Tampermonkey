const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const tmRoot = path.resolve(__dirname, "..");
const distPath = path.join(tmRoot, "dist", "fasttrmail.user.js");
const versionedDistPath = path.join(tmRoot, "dist", `fasttrmail-tampermonkey-${require(path.join(tmRoot, "package.json")).version}.user.js`);
const packageJson = require(path.join(tmRoot, "package.json"));

test("userscript build emits reproducible install artifacts sourced from package metadata", () => {
  childProcess.execFileSync("node", ["scripts/build.js"], { cwd: tmRoot });
  const output = fs.readFileSync(distPath, "utf8");
  const versionedOutput = fs.readFileSync(versionedDistPath, "utf8");

  assert.ok(packageJson.version, "package.json must define a version");
  assert.ok(output.startsWith("// ==UserScript==\n"));
  assert.match(output, /@match\s+https:\/\/app\.fastmail\.com\/\*/);
  assert.match(output, new RegExp(`@version\\s+${packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(output, new RegExp(`@author\\s+${packageJson.author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(output, /@icon\s+data:image\/png;base64,/);
  assert.match(output, /@grant\s+GM_xmlhttpRequest/);
  assert.match(output, /@grant\s+GM_getValue/);
  assert.match(output, /@grant\s+GM_setValue/);
  assert.match(output, /@grant\s+GM_registerMenuCommand/);
  assert.match(output, /@connect\s+edge\.microsoft\.com/);
  assert.match(output, /@connect\s+api\.cognitive\.microsofttranslator\.com/);
  assert.match(output, /@connect\s+translate\.googleapis\.com/);
  assert.match(output, /FastTrMail/);
  assert.equal(versionedOutput, output);

  childProcess.execFileSync("node", ["scripts/build.js"], { cwd: tmRoot });
  const rebuiltOutput = fs.readFileSync(distPath, "utf8");
  const rebuiltVersionedOutput = fs.readFileSync(versionedDistPath, "utf8");

  assert.equal(rebuiltOutput, output);
  assert.equal(rebuiltVersionedOutput, output);
});
