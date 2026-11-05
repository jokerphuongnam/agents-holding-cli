import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncJiraConfig } from "./attach.mjs";
let n = 0; const T = async (name, f) => { await f(); n++; console.log("  ok  ", name); };
const home = mkdtempSync(join(tmpdir(), "ah-jira-"));
await T("syncJiraConfig writes site+oauth, never a token", async () => {
  syncJiraConfig({ site: "https://acme.atlassian.net", account: "Acme", access_token: "SECRET", cloud_id: "cid" }, home);
  const j = JSON.parse(readFileSync(join(home, ".config/agents-holding/jira.json"), "utf8"));
  assert.equal(j.site, "https://acme.atlassian.net");
  assert.equal(j.oauth, true);
  assert.equal(j.account, "Acme");
  assert.doesNotMatch(JSON.stringify(j), /SECRET|access_token|refresh/i);
});
await T("company create / install paths must not import ensure", async () => {
  const src = readFileSync(new URL("./company-create.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /ensure\(|jira connect|atlassian\(/);
});
rmSync(home, { recursive: true, force: true });
console.log(`${n} passed`);
