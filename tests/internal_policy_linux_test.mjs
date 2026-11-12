import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wrapLaunch } from "../full/client/scripts/policy.mjs";

const home = mkdtempSync(join(tmpdir(), "ah-bwrap-policy-"));
try {
  const state = join(home, ".config/agents-holding/state"), own = join(state, "acme/policy.json"), other = join(state, "other/policy.json"), cwd = join(home, "repo");
  mkdirSync(join(state, "acme"), { recursive: true }); mkdirSync(join(state, "other"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(own, JSON.stringify({ staff: { developer: { version: 1, permissions: {}, shell: { allow: [], deny: [] }, files: { deny: ["~/.config/agents-holding/state/*/policy.json"] }, rules: { text: [] } } } }));
  writeFileSync(other, "other-company-secret");
  const launch = wrapLaunch({ home, co: "acme", role: "developer", bin: "/bin/sh", args: ["-c", "cat \"$1\"", "sh", own], env: process.env, cwd, platform: "linux" });
  assert.equal(launch.sandbox, "bwrap", "Linux test requires bubblewrap");
  const readOwn = spawnSync(launch.bin, launch.args, { encoding: "utf8", env: launch.env });
  assert.equal(readOwn.status, 0, readOwn.stderr);
  assert(readOwn.stdout.includes('"developer"'), "staff must read its company's policy");
  const otherLaunch = wrapLaunch({ home, co: "acme", role: "developer", bin: "/bin/sh", args: ["-c", "cat \"$1\"", "sh", other], env: process.env, cwd, platform: "linux" });
  const readOther = spawnSync(otherLaunch.bin, otherLaunch.args, { encoding: "utf8", env: otherLaunch.env });
  assert.notEqual(readOther.stdout, "other-company-secret", "another company's policy must not be exposed");
  const writeLaunch = wrapLaunch({ home, co: "acme", role: "developer", bin: "/bin/sh", args: ["-c", "printf changed > \"$1\"", "sh", own], env: process.env, cwd, platform: "linux" });
  spawnSync(writeLaunch.bin, writeLaunch.args, { encoding: "utf8", env: writeLaunch.env });
  assert(readFileSync(own, "utf8").includes('"developer"'), "company policy must remain unchanged after write attempt");
  console.log("internal_policy_linux_test: pass (read own, deny other, deny write)");
} finally { rmSync(home, { recursive: true, force: true }); }
