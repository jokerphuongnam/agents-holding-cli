import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seatbeltProfile } from "../full/client/scripts/policy.mjs";

const home = mkdtempSync(join(tmpdir(), "ah-seatbelt-policy-"));
try {
  const state = join(home, ".config/agents-holding/state"), own = join(state, "acme/policy.json"), other = join(state, "other/policy.json"), cwd = join(home, "repo");
  mkdirSync(join(state, "acme"), { recursive: true }); mkdirSync(join(state, "other"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(own, "own-policy"); writeFileSync(other, "other-policy");
  const profile = seatbeltProfile({ __companySlug: "acme", files: { deny: ["~/.config/agents-holding/state/*/policy.json"] } }, { home, cwd });
  const run = (bin, args) => spawnSync("/usr/bin/sandbox-exec", ["-p", profile, bin, ...args], { encoding: "utf8" });
  const readOwn = run("/bin/cat", [own]), readOther = run("/bin/cat", [other]);
  const writeOwn = run("/bin/sh", ["-c", "printf changed > \"$1\"", "sh", own]);
  assert.equal(readOwn.status, 0, readOwn.stderr);
  assert.equal(readOwn.stdout, "own-policy");
  assert.notEqual(readOther.status, 0, "another company's policy must be unreadable");
  assert.notEqual(writeOwn.status, 0, "company policy must be read-only");
  assert.equal(readFileSync(own, "utf8"), "own-policy", "write attempt must leave policy unchanged");
  console.log("internal_policy_macos_test: pass (read own, deny other, deny write)");
} finally { rmSync(home, { recursive: true, force: true }); }
