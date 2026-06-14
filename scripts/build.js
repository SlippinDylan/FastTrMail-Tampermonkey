const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const packageJson = require(path.join(root, "package.json"));
const iconBuffer = fs.readFileSync(path.join(root, "assets", "app.png"));
const header = require(path.join(root, "src", "meta", "header.js"))({
  version: packageJson.version,
  author: packageJson.author,
  iconDataUrl: `data:image/png;base64,${iconBuffer.toString("base64")}`
});
const outputPath = path.join(distDir, "fasttrmail.user.js");
const versionedOutputPath = path.join(distDir, `fasttrmail-tampermonkey-${packageJson.version}.user.js`);

fs.mkdirSync(distDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, "src", "entry", "main.js")],
  outfile: outputPath,
  bundle: true,
  format: "iife",
  platform: "browser",
  charset: "utf8",
  banner: {
    js: header
  }
});

fs.copyFileSync(outputPath, versionedOutputPath);
