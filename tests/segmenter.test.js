const test = require("node:test");
const assert = require("node:assert/strict");

const { DOM_CONSTANTS } = require("../src/config/defaults.js");
const textPolicies = require("../src/fastmail/text-policies.js");
const { createSegmenter, normalizeSegmentText } = require("../src/fastmail/segmenter.js");
const { createRuntimeState } = require("../src/core/runtime-state.js");
const pageLocator = require("../src/fastmail/page-locator.js");
const { installDom } = require("./helpers/dom.js");

test("segmenter normalizes line endings and surrounding whitespace before filtering", () => {
  assert.equal(normalizeSegmentText("\r\n  First line\r\n\r\nSecond line  \r\n"), "First line\n\nSecond line");
});

test("segmenter keeps visible text blocks and skips reply markers and url-only blocks", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Message-body">
          <article class="u-article">
            <p>Hello world</p>
            <p>https://example.com</p>
            <p>-- Reply above this line --</p>
            <p>Thanks again</p>
          </article>
        </div>
      </body>
    </html>
  `);

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const segmenter = createSegmenter({
      constants: DOM_CONSTANTS,
      policies: textPolicies,
      runtimeState
    });

    const body = document.querySelector(".v-Message-body");
    const segments = segmenter.collectTranslatableSegments(body);

    assert.deepEqual(
      segments.map((segment) => segment.text),
      ["Hello world", "Thanks again"]
    );
  } finally {
    cleanup();
  }
});

test("segmenter treats preformatted content as flow segments separated by blank lines", () => {
  const { cleanup } = installDom(`
    <!doctype html>
    <html>
      <body>
        <div class="v-Message-body">
          <pre>First line<br><br>Second block</pre>
        </div>
      </body>
    </html>
  `);

  try {
    const runtimeState = createRuntimeState({
      getLocationKey: () => pageLocator.getLocationKey(global.location)
    });
    const segmenter = createSegmenter({
      constants: DOM_CONSTANTS,
      policies: textPolicies,
      runtimeState
    });

    const body = document.querySelector(".v-Message-body");
    const segments = segmenter.collectTranslatableSegments(body);

    assert.deepEqual(
      segments.map((segment) => segment.text),
      ["First line", "Second block"]
    );
  } finally {
    cleanup();
  }
});
