#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// holding jira <verb> : Jira working commands, deterministic (no model). Auth is lazy: OAuth 3LO in the Keychain
// (holding jira connect -- opens the browser only when a Jira command needs it), with legacy API-token fallback.
// Moves/comments are real user actions. Install / company create never require Jira auth.
//   jira connect [--switch] | status | logout
//   jira list [column] | show KEY | board | add "title" [desc] | move KEY <column> | comment KEY "text"
//   --project KEY picks the board when this repo (or the registry) has several.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { adfText, jiraToken, WORK_LABEL, isAgentText } from "./lean.mjs";
import { load as loadReg } from "./registry.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();

const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
export const ago = (iso, now = Date.now()) => { const m = Math.round((now - Date.parse(iso)) / 60000); return !iso || isNaN(m) ? "-" : m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
export const adf = (text) => ({ type: "doc", version: 1, content: String(text).split("\n").map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] })) });
export const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Board for this run: --project KEY, else the registry project whose path contains cwd, else the only board. */
export function pickBoard(reg, cwd, project, company = null) {
  const all = (reg.projects ?? []).flatMap((p) => (p.boards ?? []).map((b) => ({ ...b, path: p.path, name: p.name })));
  if (project) return all.find((b) => b.project_key === project.toUpperCase()) ?? { project_key: project.toUpperCase() };
  const mine = company ? all.filter((b) => b.company === company) : [];
  const here = mine.length ? mine : all.filter((b) => b.path && (resolve(cwd) + "/").startsWith(resolve(b.path) + "/"));
  const pool = here.length ? here : all;
  if (pool.length === 1) return pool[0];
  if (!pool.length) throw new Error("no Jira board registered: holding project add, or pass --project KEY");
  throw new Error(`several boards (${[...new Set(pool.map((b) => b.project_key))].join(", ")}): pass --project KEY`);
}

/** HTTP client from resolved auth (OAuth Bearer or API-token Basic). A from attach.atlassian(). */
export function client(A, fetchFn = fetch) {
  if (typeof A === "function" || A?.email && !A?.auth) {
    // legacy test shim: client(cfg, fetch, tokenFn)
    const cfg = A, tokenFn = arguments.length >= 3 ? arguments[2] : () => jiraToken(cfg);
    const site = String(cfg?.site ?? "").replace(/\/$/, "");
    return async (m, path, body) => {
      const t = typeof tokenFn === "function" ? tokenFn() : tokenFn; if (!t) throw new Error("no Jira token in the Keychain (holding jira connect)");
      const r = await fetchFn(path.startsWith("@agile") ? `${site}/rest/agile/1.0${path.slice(6)}` : `${site}/rest/api/3${path}`, { method: m, headers: { Authorization: "Basic " + Buffer.from(`${cfg.email}:${t}`).toString("base64"), "Content-Type": "application/json", Accept: "application/json" }, body: body && JSON.stringify(body) });
      if (!r.ok) { let d = ""; try { const j = await r.json(); d = (j.errorMessages ?? []).concat(Object.values(j.errors ?? {})).join("; "); } catch {} throw new Error(`Jira ${m} ${path.split("?")[0]} -> ${r.status}${d ? `: ${d}` : ""}`); }
      return r.status === 204 ? null : r.json();
    };
  }
  return async (m, path, body) => {
    if (!A?.auth) throw new Error("no Jira token (holding jira connect)");
    const url = path.startsWith("@agile") ? `${A.agile || (A.site.replace(/\/$/, "") + "/rest/agile/1.0")}${path.slice(6)}` : `${A.jira}${path}`;
    const r = await fetchFn(url, { method: m, headers: { Authorization: A.auth(), "Content-Type": "application/json", Accept: "application/json" }, body: body && JSON.stringify(body) });
    if (!r.ok) { let d = ""; try { const j = await r.json(); d = (j.errorMessages ?? []).concat(Object.values(j.errors ?? {})).join("; "); } catch {} throw new Error(`Jira ${m} ${path.split("?")[0]} -> ${r.status}${d ? `: ${d}` : ""}`); }
    return r.status === 204 ? null : r.json();
  };
}
const F = "summary,status,assignee,labels,updated,issuetype,parent";
async function search(req, jql, fields = F) {
  const out = []; let tok;
  do { const j = await req("POST", "/search/jql", { jql, fields: fields.split(","), maxResults: 100, ...(tok ? { nextPageToken: tok } : {}) });
    out.push(...(j.issues ?? [])); tok = j.nextPageToken; } while (tok && out.length < 500);
  return out;
}
const row = (i) => { const f = i.fields ?? {}; return { key: i.key, title: f.summary ?? "", column: f.status?.name ?? "?", cat: f.status?.statusCategory?.key, who: f.assignee?.displayName ?? "-", working: (f.labels ?? []).includes(WORK_LABEL), needsHire: (f.labels ?? []).includes("needs-hire"), needsDecision: (f.labels ?? []).includes("needs-decision"), staff: ((f.labels ?? []).find((l) => /^staff:/.test(l)) ?? "").slice(6) || null, updated: f.updated }; };
export async function columnsOf(req, key) { // board column order (agile API), else the project's statuses
  try { const b = await req("GET", `@agile/board?projectKeyOrId=${key}`); const id = b.values?.[0]?.id;
    if (id) { const c = await req("GET", `@agile/board/${id}/configuration`); const cols = (c.columnConfig?.columns ?? []).map((x) => x.name); if (cols.length) return cols; } } catch {}
  try { const st = await req("GET", `/project/${key}/statuses`); const seen = []; for (const t of st ?? []) for (const s of t.statuses ?? []) if (!seen.includes(s.name)) seen.push(s.name); return seen; } catch { return []; }
}
const stageTimeoutMin = (env = process.env) => Number(env.AH_RUN_TIMEOUT_MIN ?? 15);
export const isStuck = (r, now = Date.now(), env = process.env) => /fail/i.test(r.column) || (r.working && now - Date.parse(r.updated) > stageTimeoutMin(env) * 60000);

export async function tasks(req, key, column, now = Date.now()) {
  const jql = `project = ${key} AND (statusCategory != Done OR updated >= -7d) ORDER BY updated DESC`;
  const rows = (await search(req, jql)).map(row).filter((r) => !column || norm(r.column) === norm(column));
  const order = await columnsOf(req, key);
  const groups = {}; for (const r of rows) (groups[r.column] ??= []).push(r);
  const cols = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  if (!cols.length) return `${key}: no tasks${column ? ` in "${column}"` : ""} (open, or done in the last 7 days)`;
  const w = Math.min(60, Math.max(...rows.map((r) => r.title.length)));
  return [`${key} tasks${column ? ` in ${column}` : ""} (open + done last 7d)`, ...cols.flatMap((c) => [`\n${c} (${groups[c].length})`,
    ...groups[c].map((r) => `  ${r.key.padEnd(9)} ${clip(r.title, 60).padEnd(w)}  ${clip(r.who, 18).padEnd(18)} ${clip(r.staff ? `👤 ${r.staff}` : "", 22).padEnd(22)} ${r.working ? "⚙ agent-working " : "                "}${ago(r.updated, now)}`)])].join("\n");
}
export async function board(req, key, now = Date.now(), env = process.env) {
  const rows = (await search(req, `project = ${key} AND (statusCategory != Done OR updated >= -7d)`)).map(row);
  const order = await columnsOf(req, key); const n = {}; for (const r of rows) n[r.column] = (n[r.column] ?? 0) + 1;
  const cols = [...new Set([...order, ...Object.keys(n)])];
  const stuck = rows.filter((r) => isStuck(r, now, env));
  return [`${key} board (open + done last 7d)`, ...cols.map((c) => `  ${c.padEnd(16)} ${String(n[c] ?? 0).padStart(3)}`),
    `\nworking now: ${rows.filter((r) => r.working).map((r) => r.key).join(", ") || "none"}`,
    `stuck (${stuck.length}; agent-working > ${stageTimeoutMin(env)} min or Failed): ${stuck.map((r) => `${r.key} [${r.column}, ${ago(r.updated, now)}]`).join(", ") || "none"}`,
    ...(() => { const h = rows.filter((r) => r.needsHire), d = rows.filter((r) => r.needsDecision);
      return [`needs-hire (${h.length}): ${h.map((r) => r.key).join(", ") || "none"}${h.length ? "  -> /staff add <role>, then it resumes" : ""}`,
        `needs-decision (${d.length}): ${d.map((r) => r.key).join(", ") || "none"}${d.length ? "  -> reply 1/2/3 on the card" : ""}`]; })()].join("\n");
}
export async function task(req, key, { state = {}, usage = null } = {}) {
  const j = await req("GET", `/issue/${encodeURIComponent(key)}?fields=${F},description,comment`); const f = j.fields ?? {}; const r = row(j);
  const cm = (f.comment?.comments ?? []).slice(-5).map((c) => `  ${ago(c.created)}  ${clip(c.author?.displayName ?? "?", 18)}${isAgentText(adfText(c.body)) ? " (agent)" : ""}: ${clip(adfText(c.body), 220)}`);
  const tk = usage ?? state.tokens;
  return [`${key}  ${r.title}`, `column: ${r.column}${r.working ? "  ⚙ agent-working" : ""}   assignee: ${r.who}   updated: ${ago(r.updated)}`,
    `branch: ${state.branch ?? "-"}${state.commit ? ` @ ${state.commit}` : ""}`,
    `tokens: ${tk ? (typeof tk === "object" ? `${tk.input ?? 0} in / ${tk.output ?? 0} out / ${tk.cached ?? 0} cached (${tk.runs ?? "?"} runs)` : tk) : "-"}`,
    `\ndescription:\n  ${clip(adfText(f.description), 600) || "-"}`, `\nrecent comments:`, ...(cm.length ? cm : ["  (none)"])].join("\n");
}
export async function create(req, key, title, desc) {
  if (!title) throw new Error('usage: holding jira add "title" [description]');
  let type = "Task";
  try { const p = await req("GET", `/project/${key}`); const ts = (p.issueTypes ?? []).filter((t) => !t.subtask); type = (ts.find((t) => t.name === "Task") ?? ts[0])?.name ?? "Task"; } catch {}
  const j = await req("POST", "/issue", { fields: { project: { key }, summary: title, issuetype: { name: type }, ...(desc ? { description: adf(desc) } : {}) } });
  return `created ${j.key} in To Do: ${title}`;
}
export async function move(req, key, column) {
  if (!key || !column) throw new Error("usage: holding jira move KEY <column>");
  const t = (await req("GET", `/issue/${encodeURIComponent(key)}/transitions`)).transitions ?? [];
  const hit = t.find((x) => norm(x.to?.name) === norm(column)) ?? t.find((x) => norm(x.name) === norm(column));
  if (!hit) throw new Error(`no transition from here to "${column}". Possible: ${t.map((x) => x.to?.name ?? x.name).join(", ") || "none"}`);
  await req("POST", `/issue/${encodeURIComponent(key)}/transitions`, { transition: { id: hit.id } });
  return `moved ${key} -> ${hit.to?.name ?? hit.name} (as you; the listener reacts like to a drag)`;
}
export async function comment(req, key, text) {
  if (!key || !text) throw new Error('usage: holding jira comment KEY "text"');
  if (isAgentText(text)) throw new Error("comment starts with the agent tag; it would not count as user feedback");
  await req("POST", `/issue/${encodeURIComponent(key)}/comment`, { body: adf(text) });
  return `commented on ${key} as you (counts as user feedback)`;
}
export async function edit(req, key, opts = {}) {
  if (!key) throw new Error("usage: holding jira edit KEY [--description-file FILE|--description TEXT] [--label-add L] [--label-remove L] [--assignee ACCOUNT_ID] [--fields-json JSON]");
  const old = await req("GET", `/issue/${encodeURIComponent(key)}?fields=summary,description,labels,assignee`), f = old.fields ?? {};
  const fields = {}, add = opts.labelAdd ?? [], remove = new Set(opts.labelRemove ?? []);
  if (opts.description != null) fields.description = adf(opts.description);
  if (opts.summary != null) fields.summary = opts.summary;
  if (opts.assignee != null) fields.assignee = opts.assignee === "" || opts.assignee === "null" ? null : { accountId: opts.assignee };
  const labels = [...new Set([...(f.labels ?? []), ...add])].filter((x) => !remove.has(x));
  if (JSON.stringify(labels) !== JSON.stringify(f.labels ?? [])) fields.labels = labels;
  if (opts.fieldsJson) Object.assign(fields, JSON.parse(opts.fieldsJson));
  if (!Object.keys(fields).length) return `unchanged ${key}`;
  await req("PUT", `/issue/${encodeURIComponent(key)}`, { fields });
  return `updated ${key}: ${Object.keys(fields).join(", ")}`;
}

async function serverUsage(company, issue) { // tokens per task from the server (/billing usage), best effort
  try {
    const { execFileSync } = await import("node:child_process"); const kc = (s) => execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"); let dev = process.env.AGENTS_HOLDING_DEVICE; try { dev ||= kc("agents-holding-device"); } catch {}
    const r = await fetch(process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": AH_CLIENT_VERSION, ...(dev ? { "X-AH-Device": dev } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "usage", arguments: { days: 365 } } }) });
    const d = JSON.parse((await r.json()).result.content[0].text); const t = d.tokens?.per_task?.[issue];
    return t ? { input: t.input, output: t.output, cached: t.cached, runs: t.runs } : null;
  } catch (e) { if (process.env.AH_DEBUG) console.error(e); return null; }
}

export async function main(argv, { home = homedir(), cwd = process.cwd(), fetchFn = fetch, token, out = console.log, auth } = {}) {
  const a = [...argv]; let project = null; const i = a.indexOf("--project"); if (i >= 0) { project = a[i + 1]; a.splice(i, 2); }
  const cmd = a.shift();
  const keyOf = (k) => String(k ?? "").toUpperCase();
  const b = () => pickBoard(loadReg(home), cwd, project, (() => { const i = process.argv.indexOf("--company"); return i >= 0 ? process.argv[i + 1] : null; })());
  let req;
  if (token) {
    // Unit-test / injected token path (Basic against site in jira.json or placeholder).
    let cfg; try { cfg = JSON.parse(readFileSync(join(home, ".config/agents-holding/jira.json"), "utf8")); }
    catch { cfg = { site: "https://example.atlassian.net", email: "t@example.com", keychain_service: "test" }; }
    req = client(cfg, fetchFn, token);
  } else {
    // Lazy: OAuth (or API-token fallback). Opens the browser only when nothing is stored yet.
    const board = b();
    const A = auth ?? await (await import("./attach.mjs")).atlassian(home, { site: board.site });
    req = client(A, fetchFn);
  }
  switch (cmd) {
    case "list": return out(await tasks(req, b().project_key, a.join(" ")));
    case "board": { const { listenerWarning } = await import("./lean.mjs"); const w = listenerWarning(); if (w) console.log(w + "\n"); return out(await board(req, b().project_key)); }
    case "show": { const k = keyOf(a[0]); if (!k) throw new Error("usage: holding jira show KEY"); let st = {}, bd = {};
      try { bd = pickBoard(loadReg(home), cwd, k.split("-")[0]); st = JSON.parse(readFileSync(join(home, ".config/agents-holding/state", bd.company ?? "-", `${k}.json`), "utf8")); } catch {}
      return out(await task(req, k, { state: st, usage: fetchFn === fetch && bd.company ? await serverUsage(bd.company, k) : null })); }
    case "add": return out(await create(req, b().project_key, a[0], a.slice(1).join(" ")));
    case "move": return out(await move(req, keyOf(a[0]), a.slice(1).join(" ")));
    case "comment": return out(await comment(req, keyOf(a[0]), a.slice(1).join(" ")));
    case "edit": case "update": { const k = keyOf(a.shift()); if (!k) throw new Error("usage: holding jira edit KEY ..."); const o = { labelAdd: [], labelRemove: [] };
      for (let i = 0; i < a.length; i++) { const x = a[i]; if (x === "--description-file") { const p = a[++i]; if (!p || !existsSync(p)) throw new Error(`description file not found: ${p}`); o.description = readFileSync(p, "utf8"); }
        else if (x === "--description") o.description = a[++i] ?? "";
        else if (x === "--summary") o.summary = a[++i] ?? "";
        else if (x === "--assignee") o.assignee = a[++i] ?? "";
        else if (x === "--label-add") o.labelAdd.push(a[++i]);
        else if (x === "--label-remove") o.labelRemove.push(a[++i]);
        else if (x === "--fields-json") o.fieldsJson = a[++i];
        else throw new Error(`unknown jira edit option: ${x}`); }
      return out(await edit(req, k, o)); }
  }
  throw new Error('usage: holding jira list [column] | show KEY | board | add "title" [desc] | move KEY <column> | comment KEY "text" | edit KEY [options]  [--project KEY]');
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
