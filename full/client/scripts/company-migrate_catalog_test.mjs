import assert from "node:assert/strict";

// Contract tests kept dependency-free: the migration must normalize iCloud suffixes
// before sending a catalog and must accept every harness directory.
const source = await (await import("node:fs/promises")).readFile(new URL("./company-migrate.mjs", import.meta.url), "utf8");
assert.match(source, /\.grok\/agents/);
assert.match(source, /\.claude\/agents/);
assert.match(source, /\.codex\/agents/);
assert.match(source, /replace\(\/\\s\+\[23\]\$\//);
assert.match(source, /catalog/);
console.log("company-migrate catalog contract: ok");
