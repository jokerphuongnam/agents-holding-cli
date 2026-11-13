import assert from "node:assert/strict";
import { implementationEvidence, terminalSessionEvidence, validatePtyExecutionEvidence, qcChecklist, workChecklist } from "../full/client/scripts/lean.mjs";
import { flattenStaffs, resolveAgent, staffRuntime } from "../full/client/scripts/agents.mjs";
import { render } from "../full/client/scripts/providers/command.mjs";

const good = { summary: "Changed canonical cache routing", tests: "build: ok; install: ok; smoke: ok" };
assert.equal(implementationEvidence(good, "abc123", "feature/MARLIN-1 @ abc123").ok, true, "success advances");
for (const [name, r, sha, where] of [
  ["exit 1 output is not evidence", { ...good, tests: "exit 1\nstderr: failed" }, "abc123", "feature/X"],
  ["no-op has no commit", good, null, "Branch feature/X (no changes)"],
  ["missing output", {}, "abc123", "feature/X"],
  ["missing evidence", { summary: "changed" }, "abc123", ""],
]) assert.equal(implementationEvidence(r, sha, where, { require_tests: true }).ok, false, name);
assert.equal(implementationEvidence(good, "abc123", "feature/X", { allow_no_commit: true }).ok, true, "explicit custom policy can alter commit requirement");

const env = { HOME: "/tmp/agents-holding-provider-test", AH_AGENT: "" };
const global = { default: { provider: "grok", model: "grok-default" }, staff: { "comm-objc-engineer": { provider: "grok", model: "grok-stale" } } };
const company = { agent: "grok", staff: { "comm-objc-engineer": { provider: "codex", model: "gpt-5.6-luna", effort: "low" } } };
const resolved = resolveAgent({ env, cfg: company, role: "comm-objc-engineer", global });
assert.deepEqual({ agent: resolved.agent, model: resolved.model, effort: resolved.effort }, { agent: "codex", model: "gpt-5.6-luna", effort: "low" }, "company staff provider wins over stale default");
const inherited = resolveAgent({ env, cfg: { staff: { "comm-objc-engineer": company.staff["comm-objc-engineer"] } }, role: "comm-objc-engineer", global });
assert.equal(inherited.agent, "codex", "parent/child effective staff mapping remains explicit");
const localStaff = flattenStaffs({ ceo: {
  agent: { command: 'codex exec --sandbox danger-full-access "{prompt}"', model: "gpt-6-luna", effort: "low" },
  members: { "content-writer": { responsibilities: ["write content"], agent: { command: 'codex exec --sandbox danger-full-access "{prompt}"', model: "gpt-6-luna", effort: "low" } } },
} });
const localResolved = resolveAgent({ env, cfg: { agent: "grok", staff: localStaff }, role: "content-writer", global: {} });
assert.equal(localResolved.command, 'codex exec --sandbox danger-full-access "{prompt}"', "singular agent object command is flattened for staff dispatch");
assert.deepEqual({ model: localResolved.binding.model, effort: localResolved.binding.effort }, { model: "gpt-6-luna", effort: "low" }, "per-staff model and effort survive flattening");
const commandRun = render(localResolved.command, { prompt: "task", dir: "/tmp", b: localResolved.binding });
assert.ok(commandRun.args.includes("-m") && commandRun.args.includes("gpt-6-luna"), "fixed Codex command receives the staff model");
assert.ok(commandRun.args.includes("-c") && commandRun.args.includes('model_reasoning_effort="low"'), "fixed Codex command receives the staff effort");
assert.match(staffRuntime({ env, cfg: { staff: localStaff }, role: "content-writer" }), /gpt-6-luna - low\)$/);
const explicitRun = render('codex exec -m {model} -c model_reasoning_effort="{effort}" "{prompt}"', { prompt: "task", dir: "/tmp", b: localResolved.binding });
assert.equal(explicitRun.args.filter((x) => x === "-m").length, 1, "explicit model placeholder is not duplicated");
assert.equal(explicitRun.args.filter((x) => x.includes("model_reasoning_effort")).length, 1, "explicit effort placeholder is not duplicated");
const session = { session_id: "term-1", user_id: "user-1", device_id: "mac-1", cwd: "/repo", status: "connected" };
const terminal = { session_id: "term-1", command: "make test", status: "completed", started_at: "2026-01-01T00:00:00Z", ended_at: "2026-01-01T00:00:01Z", exit_code: 0, stdout_digest: "sha256:out", stderr_digest: "sha256:err", toolchain_fingerprint: "sha256:tool", artifact_digest: "sha256:art", commit: "abc", tree: "tree" };
assert.equal(terminalSessionEvidence({ session, result: terminal, command: "make test", repo: "/repo" }).ok, true, "bound terminal completion passes");
assert.equal(terminalSessionEvidence({ session, result: { ...terminal, exit_code: 1 }, command: "make test", repo: "/repo" }).ok, false, "terminal exit failure fails");
assert.equal(terminalSessionEvidence({ session: { ...session, status: "disconnected" }, result: terminal, command: "make test", repo: "/repo" }).ok, false, "disconnect cannot pass");
assert.equal(terminalSessionEvidence({ session, result: { ...terminal, status: "running" }, command: "make test", repo: "/repo" }).ok, false, "no completion cannot pass");
const ptySession = { ...session, transport: "pty", authenticated: true };
const pty = { ...terminal, cwd: "/repo", repo: "/repo", ended_at: new Date().toISOString(), transcript_digest: "sig", transcript_signature: "sig" };
assert.equal(validatePtyExecutionEvidence({ session: ptySession, result: pty, command: "make test", repo: "/repo", actual: { commit: "abc", tree: "tree", artifact_digest: "sha256:art" } }).ok, true, "authenticated PTY evidence passes");
assert.equal(validatePtyExecutionEvidence({ session: null, result: pty, command: "make test", repo: "/repo" }).state, "waiting", "missing PTY transport waits");
assert.equal(validatePtyExecutionEvidence({ session: ptySession, result: { ...pty, command: "fake success" }, command: "make test", repo: "/repo" }).ok, false, "fake claimed command fails");
assert.equal(validatePtyExecutionEvidence({ session: ptySession, result: { ...pty, cwd: "/wrong" }, command: "make test", repo: "/repo" }).ok, false, "wrong cwd fails");
assert.equal(validatePtyExecutionEvidence({ session: ptySession, result: { ...pty, ended_at: "2020-01-01T00:00:00Z" }, command: "make test", repo: "/repo" }).ok, false, "stale transcript fails");
assert.equal(validatePtyExecutionEvidence({ session: ptySession, result: { ...pty, exit_code: 0, transcript_signature: "forged" }, command: "make test", repo: "/repo" }).ok, false, "forged transcript/exit evidence fails");
const checklist = qcChecklist({ owner: "qc-lead", retry_stage: "coding", checks: [{ id: "static-check", required: true, tool: "lint" }, { id: "terminal-build", runner: "registered_terminal", command: "make test", required: true, evidence: "exit_code=0", failure_target: "reopened" }] }, { issue: "X-1" });
assert.match(checklist, /qc-checklist:X-1/);
assert.match(checklist, /terminal: make test/);
assert.match(checklist, /recovery=reopened/);
assert.equal((checklist.match(/QC CHECKLIST/g) ?? []).length, 1, "stable checklist marker avoids duplicate content");
const work = workChecklist({ stage: "product_work", owner_role: "ba-lead", steps: ["draft plan", "post handoff"] }, { issue: "X-2", stage: "product_work", plan: "scope" });
assert.match(work, /work-checklist:X-2:product_work/);
assert.match(work, /draft plan/);
assert.match(work, /owner=ba-lead/);
assert.match(work, /failure\/blocker/);
assert.equal((work.match(/WORK CHECKLIST/g) ?? []).length, 1, "one stable work checklist marker");
console.log("workflow_invariant_test: pass");
