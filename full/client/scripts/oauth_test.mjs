import assert from "node:assert/strict";
import { accountOf, acquireRefreshLock, connectHint } from "./oauth.mjs";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
let n = 0; const T = async (name, f) => { await f(); n++; console.log("  ok  ", name); };
await T("accountOf prefers account then handle/email/site", async () => {
  assert.equal(accountOf(null), null);
  assert.equal(accountOf({ account: "alice" }), "alice");
  assert.equal(accountOf({ handle: "bob" }), "bob");
  assert.equal(accountOf({ email: "c@x.com" }), "c@x.com");
  assert.equal(accountOf({ site: "https://acme.atlassian.net" }), "acme.atlassian.net");
  assert.equal(accountOf({ access_token: "x" }), "connected");
});
await T("connectHint never mentions a token", async () => {
  assert.match(connectHint("figma"), /holding figma connect/);
  assert.doesNotMatch(connectHint("figma"), /token|secret|yaml/i);
});
await T("refresh lock reclaims a legacy orphaned directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "ah-oauth-lock-")), lock = join(root, "oauth-refresh-atlassian.lock");
  try {
    mkdirSync(lock);
    const old = new Date(Date.now() - 120000);
    utimesSync(lock, old, old);
    const held = await acquireRefreshLock(lock, { waitMs: 100, pollMs: 1 });
    assert.ok(held);
    assert.equal(JSON.parse((await import("node:fs")).readFileSync(join(lock, "owner.json"), "utf8")).pid, process.pid);
    held.release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
await T("refresh lock reclaims an owner whose process exited", async () => {
  const root = mkdtempSync(join(tmpdir(), "ah-oauth-lock-")), lock = join(root, "oauth-refresh-atlassian.lock");
  try {
    mkdirSync(lock);
    writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, nonce: "dead", at: new Date().toISOString() }));
    const held = await acquireRefreshLock(lock, { waitMs: 100, pollMs: 1, alive: () => false });
    assert.ok(held);
    held.release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
await T("refresh lock does not steal from a live owner", async () => {
  const root = mkdtempSync(join(tmpdir(), "ah-oauth-lock-")), lock = join(root, "oauth-refresh-atlassian.lock");
  try {
    const first = await acquireRefreshLock(lock);
    assert.ok(first);
    const second = await acquireRefreshLock(lock, { waitMs: 20, pollMs: 2 });
    assert.equal(second, null);
    first.release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
console.log(`${n} passed`);
