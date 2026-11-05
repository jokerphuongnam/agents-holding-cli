// Staff policy core (one unified config per staff): rules (free text + machine-checkable git rules), server-action permissions,
// shell allow/deny, file deny list. Pure JS, no deps: the SAME file ships as the server's supabase/functions/_shared/policy-core.mjs
// and the client's scripts/policy-core.mjs (tests check they are byte-identical). Merge order: built-in base -> role defaults ->
// company defaults -> staff override. Deny lists only grow (a staff override can add, never remove, a company/base deny entry).
export const PERMISSIONS = ["jira_transition", "jira_assign", "jira_comment", "mark_done", "pr_merge", "push_protected", "call_staff", "spend_credits", "cross_company_read", "jira_attach", "figma_export", "confluence_write"];
export const DEFAULT_FILE_DENY = [".env", ".env.*", "**/.env", "**/.env.*", "*.pem", "**/*.pem", "*.key", "**/*.key", "secrets/**", "**/secrets/**",
  "id_rsa*", "**/id_rsa*", "~/.ssh/**", "~/.aws/credentials", "~/.config/gcloud/**", "**/credentials", "**/credentials.json", "~/.netrc", "~/.docker/config.json",
  "*.keychain", "*.keychain-db", "**/*.keychain-db", "~/Library/Keychains/**", "~/.config/agents-holding/**/key*", "~/.config/agents-holding/state/*/policy.json"];
export const DEFAULT_SHELL_DENY = ["rm -rf /", "rm -rf ~", "git push --force", "git push -f", "security find-generic-password", "security dump-keychain", "printenv", "env"];
export const GIT_DEFAULTS = {
  branch_pattern: "^(feature|fix|chore|hotfix|docs|refactor|test)/[A-Za-z0-9._-]+$",
  commit_format: "^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\\([^)]+\\))?!?: .{3,}",
  pr_title_pattern: "^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\\([^)]+\\))?!?: .{3,}",
  pr_required_sections: ["Summary", "Test plan"],
  pr_template: "## Summary\n\n## Test plan\n",
  protected_branches: ["main", "master", "develop", "release/*"],
  reviewers: [], labels: [],
};
const BASE_PERMS = { jira_transition: true, jira_assign: false, jira_comment: true, mark_done: false, pr_merge: false, push_protected: false,
  call_staff: false, spend_credits: true, cross_company_read: false, jira_attach: true, figma_export: true, confluence_write: false };
export const isGitRole = (role) => /(^|-)(git|dev|developer|engineer|eng|tech-lead|lead-dev|devops|qa|sre|mobile|frontend|backend|fullstack)(-|$)/i.test(String(role ?? ""));
/** Role-based defaults: everyone gets the file deny list; git roles get git rules; leads/CEO may call other staff; tech-lead may merge PRs. */
export function roleDefaults(role) {
  const r = String(role ?? "").toLowerCase(), lead = /(^|-)(ceo|lead|manager|pm)(-|$)/.test(r), git = isGitRole(r);
  const text = ["Never read, print or copy secrets (.env, keys, tokens). Ask the owner instead."];
  if (git) text.push("Follow the git conventions below: branch names, commit messages and PR title/body are checked and rejected on violation.");
  return { version: 1,
    rules: { text, git: git ? { ...GIT_DEFAULTS } : null },
    permissions: { ...BASE_PERMS, call_staff: lead, jira_assign: lead, pr_merge: /tech-lead|lead-dev/.test(r), confluence_write: lead },
    shell: { allow: [], deny: [...DEFAULT_SHELL_DENY] },
    files: { deny: [...DEFAULT_FILE_DENY], source: Object.fromEntries(DEFAULT_FILE_DENY.map((g) => [g, "default"])), replace: {} } };
}
/** What a staff sees when it reads a denied path: this warning stub. Never the real content. */
export const DENY_WARNING = "File này bị chặn bởi chính sách bảo mật của company. Không được đọc hay suy đoán nội dung; hãy làm tiếp mà không cần nó.\n(This file is blocked by the company security policy. Do not read or guess its content; continue without it.)";
const uniq = (a) => [...new Set((a ?? []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))];
/** layers: [company, staff] overrides (each may be partial). Deny lists union; allow lists replace; permissions/git fields override. */
export function mergePolicy(role, ...layers) {
  const p = roleDefaults(role);
  for (const L of layers) { if (!L || typeof L !== "object") continue;
    if (L.rules?.text) p.rules.text = uniq([...p.rules.text, ...L.rules.text]);
    if (L.rules && "git" in L.rules) p.rules.git = L.rules.git === null ? null : { ...(p.rules.git ?? GIT_DEFAULTS), ...L.rules.git };
    for (const k of PERMISSIONS) if (typeof L.permissions?.[k] === "boolean") p.permissions[k] = L.permissions[k];
    if (L.shell?.allow) p.shell.allow = uniq(L.shell.allow);
    if (L.shell?.deny) p.shell.deny = uniq([...p.shell.deny, ...L.shell.deny]);
    const scope = L.__company ? "company" : "staff";
    if (L.files?.deny) { for (const g of uniq(L.files.deny)) if (!p.files.source[g]) p.files.source[g] = scope; p.files.deny = uniq([...p.files.deny, ...L.files.deny]); }
    if (L.__company) p.files.allow_staff_replace = !!L.files?.allow_staff_replace;
    // replacement file per denied path: company's wins unless the company layer set allow_staff_replace
    for (const [g, f] of Object.entries(L.files?.replace ?? {})) if (typeof f === "string" && f && (L.__company || !p.files.replace[g] || p.files.allow_staff_replace)) p.files.replace[g] = { file: f, scope };
    // removing a base entry is an explicit company-level decision: files.undeny (company layer only, applied by the caller)
    if (L.files?.undeny && L.__company) p.files.deny = p.files.deny.filter((x) => !L.files.undeny.includes(x));
  }
  return p;
}
/** Validate a partial override written by an admin. Returns an error string or null. */
export function validateOverride(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return "policy must be an object";
  const ok = new Set(["version", "rules", "permissions", "shell", "files", "cross_team", "processes"]);
  for (const k of Object.keys(o)) if (!ok.has(k)) return `unknown field ${k}`;
  for (const k of Object.keys(o.permissions ?? {})) { if (!PERMISSIONS.includes(k)) return `unknown permission ${k} (known: ${PERMISSIONS.join(", ")})`; if (typeof o.permissions[k] !== "boolean") return `permission ${k} must be true/false`; }
  for (const f of ["branch_pattern", "commit_format", "pr_title_pattern"]) { const v = o.rules?.git?.[f]; if (v != null) { try { new RegExp(v); } catch { return `rules.git.${f} is not a valid regex`; } } }
  for (const [g, f] of Object.entries(o.files?.replace ?? {})) { if (typeof f !== "string" || !f || f.startsWith("/") || f.startsWith("~") || f.split("/").includes("..")) return `replacement for ${g} must be a project-relative file (no /, ~ or ..)`;
    if (fileDenied(mergePolicy("_", o.__company ? null : null, { files: { deny: o.files?.deny ?? [] } }), f) && !/\.example$|\.sample$|\.template$/.test(f)) return `replacement ${f} is itself denied`; }
  if (o.cross_team != null) { if (!Array.isArray(o.cross_team)) return "cross_team must be a list";
    for (const r of o.cross_team) { if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(r?.source ?? "")) return "cross_team.source must be a Jira project key";
      if (!Array.isArray(r.targets) || r.targets.some((t) => !/^[A-Z][A-Z0-9_]{0,19}$/.test(t))) return "cross_team.targets must be Jira project keys"; } }
  if (o.processes != null) { const e = validateProcesses(o.processes); if (e) return e; }
  const s = JSON.stringify(o); if (s.length > 20000) return "policy too large";
  return null;
}
/** Machine-checkable git rules. kind: branch|commit|pr|push. Returns list of violations (empty = ok). */
export function checkGit(policy, kind, v = {}) {
  const g = policy?.rules?.git, out = [];
  if (kind === "push") { const prot = (g?.protected_branches ?? GIT_DEFAULTS.protected_branches).some((b) => globMatch(b, v.branch ?? ""));
    if (prot && !policy?.permissions?.push_protected) out.push(`push to protected branch ${v.branch} is not allowed for this staff`);
    if (v.force) out.push("force push is not allowed"); }
  if (!g) return out;
  if ((kind === "branch" || kind === "push") && g.branch_pattern && v.branch && !(g.protected_branches ?? []).some((b) => globMatch(b, v.branch)) && !new RegExp(g.branch_pattern).test(v.branch))
    out.push(`branch "${v.branch}" does not match ${g.branch_pattern}`);
  if (kind === "commit" && g.commit_format) for (const m of [].concat(v.message ?? [])) { const first = String(m).split("\n")[0];
    if (!new RegExp(g.commit_format).test(first)) out.push(`commit "${first.slice(0, 60)}" does not match ${g.commit_format}`); }
  if (kind === "pr") {
    if (g.pr_title_pattern && !new RegExp(g.pr_title_pattern).test(v.title ?? "")) out.push(`PR title "${String(v.title ?? "").slice(0, 60)}" does not match ${g.pr_title_pattern}`);
    for (const s of g.pr_required_sections ?? []) if (!new RegExp(`^#{1,6}\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "mi").test(v.body ?? "")) out.push(`PR body is missing the "${s}" section`);
  }
  return out;
}
/** Minimal glob: ** any path, * any chars except /, ? one char. ~ expanded by caller. */
export function globMatch(glob, path) {
  const re = "^" + String(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*") + "$";
  return new RegExp(re).test(path);
}
/** The deny entry matching path (null = allowed). Entries: globs, or plain project paths (file or folder: "config/prod", "docs/private/"). */
export function denyMatch(policy, path, home = "") { const p = String(path), base = p.split("/").pop();
  return (policy?.files?.deny ?? []).find((g) => { const gg = g.startsWith("~/") ? home + g.slice(1) : g.replace(/\/$/, "");
    if (!gg.includes("/") && !/[*?]/.test(gg) && (p === gg || p.endsWith("/" + gg) || p.includes("/" + gg + "/") || p.startsWith(gg + "/"))) return true;
    return gg.includes("/") ? globMatch(gg, p) || globMatch("**/" + gg, p) || globMatch(gg + "/**", p) || globMatch("**/" + gg + "/**", p) : globMatch(gg, base); }) ?? null; }
export const fileDenied = (policy, path, home = "") => denyMatch(policy, path, home) !== null;
export const substituteHeader = (path, file) => `[holding] Nội dung dưới đây là FILE THAY THẾ (${file}) cho ${path}, không phải nội dung thật; giá trị là giả/placeholder.\n(Substitute file for a path blocked by the company security policy; values are placeholders.)\n`;
/** What a staff gets instead of a denied file (null = allowed): the replacement file (header + content) when one is set and readable,
 *  else the warning stub. readFile(relOrAbs) -> string|null is supplied by the caller (client side). Never the real content. */
export function denyStub(policy, path, home = "", readFile = null) { const g = denyMatch(policy, path, home); if (g === null) return null;
  const r = policy?.files?.replace?.[g]; if (r && readFile) { const c = readFile(r.file); if (typeof c === "string") return substituteHeader(path, r.file) + redact(c).text; }
  return DENY_WARNING; }
/** Deny list with the scope each entry comes from (default | company | staff) and its replacement. */
export const denyList = (policy) => (policy?.files?.deny ?? []).map((g) => ({ path: g, scope: policy.files.source?.[g] ?? "default", replace: policy.files.replace?.[g]?.file ?? null, replace_scope: policy.files.replace?.[g]?.scope ?? null }));
/** Redact key-like content before it goes to a model. */
const SECRET_RES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(ah_(?:live|test)_[A-Za-z0-9]{8,})\b/g, /\b(sk-[A-Za-z0-9_-]{16,})\b/g, /\b(xai-[A-Za-z0-9]{16,})\b/g, /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g,
  /\b(github_pat_[A-Za-z0-9_]{20,})\b/g, /\b(AKIA[0-9A-Z]{16})\b/g, /\b(xox[abprs]-[A-Za-z0-9-]{10,})\b/g, /\b(ATATT[A-Za-z0-9_=-]{20,})\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /((?:api[_-]?key|secret|token|password|passwd|private[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["']?)([^\s"']{8,})/gi,
];
export function redact(s) { let t = String(s ?? ""), n = 0;
  for (const re of SECRET_RES) t = t.replace(re, (m, a, b) => { n++; return b !== undefined && typeof b === "string" && /[:=]/.test(a ?? "") ? `${a}[REDACTED]` : "[REDACTED]"; });
  return { text: t, count: n }; }
/** Which permission a server tool call needs (null = none). */
export function permissionFor(tool, a = {}) {
  switch (tool) {
    case "advance": return String(a.to_stage ?? "") === "done" ? "mark_done" : "jira_transition";
    case "assign": case "set_task_assignee": return "jira_assign";
    case "record_artifact": return "jira_comment";
    case "pr_merged": return "pr_merge";
    case "staffing_check": case "subagent": return a.from_staff ? "call_staff" : null;
    case "report_usage": return "spend_credits";
    case "jira_attach": return "jira_attach";
    case "figma_export": return "figma_export";
    case "confluence_write": return "confluence_write";
    default: return null;
  }
}

// ---- Cross-team linked propagation (generic, per company, configured by the owner) ------------------------------------------------
// Rule: { source: "MAR", targets: ["NAIL", "KAN"], link_types: ["Blocks", "Relates"] (empty = any), statuses: ["Done"] (source statuses that
// propagate; default Done), target_status: "Done" }. One source issue may link to 0..N target issues on any number of boards.
export const crossRules = (companyLayer) => (companyLayer?.cross_team ?? []).map((r) => ({ source: r.source, targets: [...new Set(r.targets ?? [])],
  link_types: (r.link_types ?? []).map((x) => String(x).toLowerCase()), statuses: (r.statuses?.length ? r.statuses : ["Done"]).map((x) => String(x).toLowerCase()), target_status: r.target_status ?? "Done" }));
const projOf = (k) => String(k ?? "").split("-")[0].toUpperCase();
/** Real Jira issuelinks (issue.fields.issuelinks) -> [{ key, status, link }]. */
export const linkedIssues = (issue) => (issue?.fields?.issuelinks ?? []).map((l) => { const o = l.outwardIssue ?? l.inwardIssue; if (!o?.key) return null;
  const t = l.type ?? {}; return { key: o.key, status: o.fields?.status?.name ?? "", category: o.fields?.status?.statusCategory?.key ?? "", link: [t.name, l.outwardIssue ? t.outward : t.inward].filter(Boolean).map((x) => String(x).toLowerCase()) }; }).filter(Boolean);
/** Plan which linked targets move. chain = keys already in this propagation (loop guard). allowed(project) -> permission of target company. */
export function planPropagation(rules, source, { chain = [], allowed = () => true } = {}) {
  const key = source.key, status = String(source.fields?.status?.name ?? "").toLowerCase(), out = { move: [], skip: [] };
  const seen = new Set([...chain.map((x) => x.toUpperCase()), key.toUpperCase()]);
  const rs = rules.filter((r) => r.source === projOf(key) && r.statuses.includes(status)); if (!rs.length) return out;
  for (const t of linkedIssues(source)) {
    const r = rs.find((r) => r.targets.includes(projOf(t.key)) && (!r.link_types.length || t.link.some((n) => r.link_types.includes(n))));
    if (!r) { out.skip.push({ key: t.key, why: "no rule for this project/link type" }); continue; }
    if (seen.has(t.key.toUpperCase())) { out.skip.push({ key: t.key, why: "loop: already in this propagation chain" }); continue; }
    if (t.status.toLowerCase() === r.target_status.toLowerCase() || (r.target_status.toLowerCase() === "done" && t.category === "done")) { out.skip.push({ key: t.key, why: "already " + t.status }); continue; }
    if (!allowed(projOf(t.key))) { out.skip.push({ key: t.key, why: "target company policy denies jira_transition" }); continue; }
    seen.add(t.key.toUpperCase()); out.move.push({ key: t.key, to: r.target_status, chain: [...seen] });
  }
  return out;
}

// ---- Company processes (first-class, user-defined; the Jira Listener executes them) ---------------------------------------------
// { id, name, when: { project, statuses:[...] }, targets: { projects:[...] (empty = any), link_types:[...] (empty = any) },
//   actions: [ {type:"transition", to}, {type:"comment", text}, {type:"assign", to:"<accountId|source-assignee>"}, {type:"notify_ceo", text} ] }
// Texts may use {source} {target} {status}. cross_team rules are the transition-only special case.
export const ACTIONS = ["transition", "comment", "assign", "notify_ceo"];
const PK = /^[A-Z][A-Z0-9_]{0,19}$/;
export function validateProcesses(list) {
  if (!Array.isArray(list)) return "processes must be a list"; const ids = new Set();
  for (const p of list) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(p?.id ?? "")) return "process id must be kebab-case"; if (ids.has(p.id)) return `duplicate process id ${p.id}`; ids.add(p.id);
    if (!PK.test(p.when?.project ?? "")) return `${p.id}: when.project must be a Jira project key`;
    if ((p.targets?.projects ?? []).some((x) => !PK.test(x))) return `${p.id}: targets.projects must be Jira project keys`;
    if (!Array.isArray(p.actions) || !p.actions.length) return `${p.id}: at least one action`;
    for (const a of p.actions) { if (!ACTIONS.includes(a?.type)) return `${p.id}: unknown action ${a?.type} (${ACTIONS.join(", ")})`;
      if ((a.type === "transition" || a.type === "assign") && !a.to) return `${p.id}: ${a.type} needs "to"`;
      if ((a.type === "comment") && !a.text) return `${p.id}: comment needs "text"`; }
  }
  return null;
}
export const PROCESS_TEMPLATES = {
  "linked-done": { name: "Nguồn Done → task liên kết Done", when: { statuses: ["Done"] }, actions: [{ type: "transition", to: "Done" }, { type: "comment", text: "Tự động chuyển Done vì {source} đã Done." }] },
  "linked-comment": { name: "Nguồn đổi trạng thái → comment task liên kết", when: { statuses: ["Done"] }, actions: [{ type: "comment", text: "{source} đã chuyển sang {status}." }] },
  "notify-ceo": { name: "Báo CEO khi task đạt trạng thái", when: { statuses: ["Done"] }, targets: { projects: [] }, actions: [{ type: "notify_ceo", text: "{source} đã {status}." }] },
};
export function companyProcesses(layer) {
  const ps = (layer?.processes ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id, project: p.when.project, statuses: (p.when.statuses?.length ? p.when.statuses : ["Done"]).map((x) => String(x).toLowerCase()),
    targets: p.targets?.projects ?? [], link_types: (p.targets?.link_types ?? []).map((x) => String(x).toLowerCase()), actions: p.actions }));
  for (const r of crossRules(layer)) ps.push({ id: `link-${r.source.toLowerCase()}`, name: "cross-team link", project: r.source, statuses: r.statuses, targets: r.targets, link_types: r.link_types, actions: [{ type: "transition", to: r.target_status }] });
  return ps;
}
const fill = (t, v) => String(t ?? "").replace(/\{(source|target|status)\}/g, (_, k) => v[k] ?? "");
/** Plan actions for one source issue. done = Set of already-executed action ids (idempotency). chain = loop guard for transitions. */
export function planProcesses(procs, source, { chain = [], allowed = () => true, done = new Set() } = {}) {
  const key = source.key, st = String(source.fields?.status?.name ?? ""), out = { run: [], skip: [] }, seen = new Set([...chain.map((x) => x.toUpperCase()), key.toUpperCase()]);
  for (const p of procs.filter((p) => p.project === projOf(key) && p.statuses.includes(st.toLowerCase()))) {
    for (const a of p.actions.filter((a) => a.type === "notify_ceo")) { const id = `${p.id}:${key}:${st}:ceo`; if (!done.has(id)) out.run.push({ id, process: p.id, type: "notify_ceo", source: key, text: fill(a.text, { source: key, status: st }) }); }
    const acts = p.actions.filter((a) => a.type !== "notify_ceo"); if (!acts.length) continue;
    for (const t of linkedIssues(source)) {
      if (p.targets.length && !p.targets.includes(projOf(t.key))) { out.skip.push({ key: t.key, process: p.id, why: "project not in process targets" }); continue; }
      if (p.link_types.length && !t.link.some((n) => p.link_types.includes(n))) { out.skip.push({ key: t.key, process: p.id, why: "link type not configured" }); continue; }
      if (seen.has(t.key.toUpperCase())) { out.skip.push({ key: t.key, process: p.id, why: "loop: already in this propagation chain" }); continue; }
      if (!allowed(projOf(t.key))) { out.skip.push({ key: t.key, process: p.id, why: "target company policy denies it" }); continue; }
      acts.forEach((a, i) => { const id = `${p.id}:${key}:${st}:${t.key}:${i}`; const v = { source: key, target: t.key, status: st };
        if (a.type === "transition" && (t.status.toLowerCase() === a.to.toLowerCase() || (a.to.toLowerCase() === "done" && t.category === "done"))) return out.skip.push({ key: t.key, process: p.id, why: "already " + t.status });
        if (done.has(id)) return out.skip.push({ key: t.key, process: p.id, why: "already executed" });
        out.run.push({ id, process: p.id, type: a.type, source: key, target: t.key, to: a.to, text: fill(a.text, v), chain: [...seen, t.key.toUpperCase()] }); });
    }
  }
  return out;
}
