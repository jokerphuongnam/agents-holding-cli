import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookDecision, nativeConfigs, seatbeltProfile } from "../full/client/scripts/policy.mjs";

const home = mkdtempSync(join(tmpdir(), "ah-internal-policy-"));
try {
  const state = join(home, ".config/agents-holding/state");
  const own = join(state, "acme", "policy.json"), other = join(state, "other", "policy.json");
  mkdirSync(join(state, "acme"), { recursive: true }); mkdirSync(join(state, "other"), { recursive: true });
  writeFileSync(own, '{"staff":{}}'); writeFileSync(other, '{"staff":{"secret":true}}');
  const policy = { __companySlug: "acme", files: { deny: ["~/.config/agents-holding/state/*/policy.json"] }, shell: { allow: [], deny: [] } };
  const profile = seatbeltProfile(policy, { home, cwd: join(home, "repo") });
  assert(profile.includes("(allow file-read* (regex #"));
  assert(profile.includes("(deny file-write* (regex #"));
  assert(profile.includes("/private)?"));
  assert(profile.indexOf("(allow default)") > profile.indexOf("(deny file-write*"));
  const native = nativeConfigs(policy, { home, co: "acme", role: "developer", hookCmd: "hook" });
  assert(native.claude.permissions.deny.includes(`Read(${other})`));
  assert(!native.claude.permissions.deny.includes(`Read(${own})`));
  const env = { AH_COMPANY: "acme", AH_STAFF: "developer", AH_POLICY_CWD: home };
  assert.equal(hookDecision({ tool_name: "Read", tool_input: { file_path: own } }, { home, env }), null);
  assert.equal(hookDecision({ tool_name: "Write", tool_input: { file_path: own } }, { home, env }).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(hookDecision({ tool_name: "Read", tool_input: { file_path: other } }, { home, env }).hookSpecificOutput.permissionDecision, "deny");
  console.log("internal_policy_access_test: pass");
} finally { rmSync(home, { recursive: true, force: true }); }
