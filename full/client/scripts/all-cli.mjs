#!/usr/bin/env node
// holding <status | task list | task history | jira board | jira list | billing usage | staff list> --all : one view over EVERY local company and board,
// so a single AI session / terminal can watch all companies. jira-* run once per board (--project KEY).
import * as L0 from "./lean.mjs";
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as C from "./company.mjs";
const here = new URL(".", import.meta.url).pathname, home = process.env.HOME;
const [noun, verb, ...rest] = process.argv.slice(2).filter((x) => x !== "--all"), cmd = noun;
const cs = C.localCompanies(home), act = C.getActive(home);
if (!cs.length) { console.log("no local companies (holding project add)"); process.exit(0); }
const holding = (args) => spawnSync("bash", [join(here, "holding"), ...args], { encoding: "utf8", env: { ...process.env, AH_COMPANY: "" } });
const show = (r) => process.stdout.write((r.stdout || "") + (r.status ? r.stderr || "" : ""));
if (cmd === "status") { { const w = L0.listenerWarning(); if (w) console.log(w + "\n"); } // listener once (it serves every board), then per company: open local runs, working, stuck
  const r = spawnSync("node", [join(here, "status.mjs"), "status"], { encoding: "utf8" }); console.log((r.stdout || "").split("\n").filter((l) => !l.startsWith("company:")).join("\n").trim());
  const stuckMin = Number(process.env.AH_RUN_TIMEOUT_MIN ?? 15) * 2;
  for (const c of cs) {
    let tasks = []; try { tasks = readdirSync(join(home, ".config/agents-holding/state", c.company)).filter((f) => /^[A-Z][A-Z0-9_]*-\d+\.json$/.test(f)).map((f) => ({ key: f.slice(0, -5), age: (Date.now() - statSync(join(home, ".config/agents-holding/state", c.company, f)).mtimeMs) / 60000 })); } catch {}
    const working = tasks.filter((t) => t.age < stuckMin), stuck = tasks.filter((t) => t.age >= stuckMin);
    console.log(`\n${c.company === act ? "* " : ""}${c.company}  boards: ${c.boards.join(",") || "-"}  staff bound: ${c.staff}  repos: ${c.repos.join(", ") || "-"}`);
    console.log(`  in flight: ${tasks.length}  working (<${stuckMin}m): ${working.map((t) => t.key).join(" ") || "-"}  idle/stuck (≥${stuckMin}m): ${stuck.map((t) => `${t.key}(${Math.round(t.age / 60)}h)`).join(" ") || "-"}`);
  }
  console.log(`\nlistener covers boards: ${cs.flatMap((c) => c.boards).join(", ") || "none"} (one listener, all companies)`);
  process.exit(0);
}
for (const c of cs) {
  if (noun === "jira") { for (const b of c.boards) { console.log(`\n═══ ${c.company} · ${b} ═══`); show(holding([noun, verb, ...rest, "--project", b, "--company", c.company])); } }
  else { console.log(`\n═══ ${c.company} ═══`); show(holding([noun, verb, ...rest, "--company", c.company])); }
}
