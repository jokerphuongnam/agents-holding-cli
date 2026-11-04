#!/usr/bin/env node
// CEO inbox from the terminal (no chat needs to stay open; notifications are the trigger):
//   holding inbox list [--all] [KEY]         pending items (staff questions, 1/2/3 decisions, hires, blocks, gates), pending first
//   holding inbox reply <KEY|item> <answer...>      quick answer without a session (e.g. holding inbox reply KAN-12 2); the staff resumes from its checkpoint
//   holding ceo [--item <id>|KEY]             open a CEO session focused on that item (agent CLI in a new Terminal window when not in one)
//   holding company set communication [jira+chat|chat]    per company: jira+chat (default) or chat only (no question/decision/progress comments on cards)
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCompany, localCompanies } from "./company.mjs";
import * as R from "./registry.mjs";
import { homedir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), cmd = argv.shift();
const all = argv.includes("--all"), co = (() => { const i = argv.indexOf("--company"); return i >= 0 ? argv[i + 1] : null; })();
const pos = argv.filter((x, i) => !x.startsWith("--") && argv[i - 1] !== "--company" && argv[i - 1] !== "--item");
const item = (() => { const i = argv.indexOf("--item"); return i >= 0 ? argv[i + 1] : null; })();
const company = co ?? (all ? null : resolveCompany().company);
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
async function mcp(name, args) {
  const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"), dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const r = await fetch(process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Client": "ah-cli", ...(dev ? { "X-AH-Device": dev } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json(), t = j.result?.content?.[0]?.text ?? j.error?.message ?? "";
  if (j.error || j.result?.isError) { console.error(t); process.exit(1); } return JSON.parse(t);
}
const red = (s) => (process.stdout.isTTY ? `\x1b[1;31m${s}\x1b[0m` : s);
const repoOf = (c) => { try { const reg = R.load(homedir()); return reg.projects.find((p) => p.boards.some((b) => b.company === c))?.path ?? null; } catch { return null; } };
export function formatInbox(d) {
  if (!d.count) return "CEO inbox: nothing pending ✔";
  const out = [red(`CEO inbox: ${d.count} pending`)]; let n = 0;
  for (const g of d.by_company) { out.push(`\n${g.company}`); for (const i of g.items) out.push(`  ${++n}. [${i.short_id}] ${i.issue ?? "-"} ${i.kind}: ${i.need}${i.detail ? `\n       ${i.detail.split("\n").slice(0, 4).join("\n       ")}` : ""}\n       ${i.how}`); }
  return out.join("\n");
}
if (cmd === "list") {
  console.log(formatInbox(await mcp("inbox_list", { ...(company ? { company } : {}), ...(pos[0] ? { issue: pos[0] } : {}) })));
} else if (cmd === "reply") {
  const [ref, ...ans] = pos; if (!ref || !ans.length) { console.error("usage: holding inbox reply <KEY|item id> <answer...>   e.g. holding inbox reply KAN-12 2"); process.exit(2); }
  const d = await mcp("inbox_reply", { ...(company ? { company } : {}), item: ref, answer: ans.join(" ") }); console.log(d.tell_user);
} else if (cmd === "communication") {
  if (!company) { console.error("which company? run inside a company repo or pass --company X"); process.exit(2); }
  const m = pos[0];
  if (m && !["jira+chat", "chat"].includes(m)) { console.error("usage: holding company set communication [jira+chat|chat]"); process.exit(2); }
  if (m) { await mcp("set_company_options", { company, communication: m }); console.log(`communication for ${company}: ${m}${m === "chat" ? " (no question/decision/progress comments on Jira cards; answer with /ceo or holding inbox reply; labels, status and assignee still update)" : " (Jira comments + CEO inbox)"}\nThe Jira Listener picks it up within 60s.`); }
  else { const d = await mcp("list_companies", {}); const c = (d.data ?? d.companies ?? d ?? []).find?.((x) => x.slug === company); console.log(`communication for ${company}: ${c?.communication ?? "jira+chat"}   (holding company set communication jira+chat|chat)`); }
} else if (cmd === "ceo") {
  const focus = item ?? pos[0] ?? null;
  const prompt = `/ceo ${focus ? `resolve pending inbox item ${focus}` : "show pending items and progress"}`;
  const cwd = (company && repoOf(company)) || process.cwd();
  const grok = process.env.GROK_BIN ?? join(homedir(), ".grok/bin/grok");
  if (process.stdout.isTTY && !argv.includes("--new-window")) { const r = spawnSync(grok, ["--cwd", cwd, prompt], { stdio: "inherit" }); process.exit(r.status ?? 0); }
  const sh = `cd ${JSON.stringify(cwd)} && ${JSON.stringify(grok)} --cwd ${JSON.stringify(cwd)} ${JSON.stringify(prompt)}`;
  execFileSync("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(sh)}`, "-e", 'tell application "Terminal" to activate']);
  console.log(`opened a CEO session in Terminal (${cwd}): ${prompt}`);
} else { console.error("usage: holding inbox list [--all] [KEY] | holding inbox reply <KEY|item> <answer>"); process.exit(2); }
