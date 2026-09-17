const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const ciWorkflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const packageWorkflowPath = path.join(repoRoot, ".github", "workflows", "package.yml");

test("release packaging waits for successful main-branch CI", () => {
  const workflow = fs.readFileSync(packageWorkflowPath, "utf8");

  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*-\s*ci/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /TESTED_SHA:.*workflow_run\.head_sha/);
});

test("workflows pin every action to a full commit SHA", () => {
  const workflows = [
    fs.readFileSync(ciWorkflowPath, "utf8"),
    fs.readFileSync(packageWorkflowPath, "utf8")
  ];

  for (const workflow of workflows) {
    const actionRefs = Array.from(workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g));
    assert.ok(actionRefs.length > 0);
    for (const [, ref] of actionRefs) {
      assert.match(ref, /^[0-9a-f]{40}$/);
    }
  }
});
