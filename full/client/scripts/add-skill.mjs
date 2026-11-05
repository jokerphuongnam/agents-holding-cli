#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// holding skill add <staff> <skill> [--company X]: attach a skill to a staff; pack skills resolve locally
// as <pack>/<skill> or unique name; catalog/custom skills go to the server add_skill tool.
import { execFileSync } from "node:child_process";
import { resolveCompany } from "./company.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
import { resolvePackSkill, attachPackSkill } from "./pack-skills.mjs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();
const a = process.argv.slice(2), pos = a.filter((x, i) => !x.startsWith("--") && a[i - 1] !== "--company");
const [staff, skill] = pos, company = resolveCompany().company;
if (!staff || !skill || !company) { console.error("usage: holding skill add <staff> <skill> [--company X]"); process.exit(1); }

// Pack skills are local (dependency packs) — never sent to the server catalog.
try {
  const hit = resolvePackSkill(company, skill);
  if (hit) {
    const r = attachPackSkill(company, staff, hit);
    console.log(r.already
      ? `already attached pack skill ${r.ref} to ${r.staff}`
      : `added pack skill ${r.ref} to ${r.staff}`);
    process.exit(0);
  }
} catch (e) {
  // Ambiguous pack match or explicit pack/skill miss — surface and stop (don't fall through to server).
  if (String(skill).includes("/") || /matches multiple packs|pack skill not found/.test(e.message || "")) {
    console.error(e.message || e);
    process.exit(1);
  }
  throw e;
}

const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"), dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
const r = await fetch(process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", { method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": AH_CLIENT_VERSION, ...(dev ? { "X-AH-Device": dev } : {}) },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "add_skill", arguments: { company, staff, skill } } }) });
const j = await r.json(), t = j.result?.content?.[0]?.text ?? j.error?.message ?? "";
if (j.error || j.result?.isError) { console.error(t); process.exit(1); }
const d = JSON.parse(t); console.log(`added skill ${skill} to ${staff}${d.resumed?.length ? `; resumed: ${d.resumed.join(", ")}` : ""}`);
