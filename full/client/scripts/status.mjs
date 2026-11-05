#!/usr/bin/env node
import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// holding status: is the listener alive, realtime joined, last Jira event, last server heartbeat, what it is working on.
// holding notify on|off: macOS notifications for start/done/fail (default on; AH_NOTIFY=0 also turns them off).
import { homedir } from "node:os";
import * as L from "./lean.mjs";
import { readFileSync as readFileSync_AH } from "node:fs";
const AH_CLIENT_VERSION = (() => { try { return readFileSync_AH(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();
const [cmd, arg] = process.argv.slice(2), home = process.env.AH_HOME ?? homedir();
if (cmd === "notify") {
  if (arg === "on" || arg === "off") { L.setNotify(home, arg === "on"); console.log(`notifications ${arg} (the running listener picks it up on the next event)`); }
  else console.log(`notifications ${L.notifyOn(home) ? "on" : "off"}  (holding notify on|off)`);
} else {
  const st = L.readStatus(home); let alive = false;
  try { if (st?.pid) { process.kill(st.pid, 0); alive = true; } } catch {}
  { const { resolveCompany } = await import("./company.mjs"); const c = resolveCompany(); console.log(c.company ? `company: ${c.company} (from ${c.source})` : "company: none (holding company use <company>)"); }
  { const w = L.listenerWarning(home); if (w) console.log(w + "\n"); }
  console.log(L.formatStatus(st, alive));
  if (alive && st?.server?.state && st.server.state !== "ok") console.log(`\x1b[31m⚠️  SERVER ${String(st.server.state).toUpperCase()} since ${st.server.since}: ${st.server.msg}\x1b[0m\n   Work pauses; missed Jira changes are replayed automatically when it recovers.`);
  else if (st?.server?.recovered_at) console.log(`server: ok (recovered ${st.server.recovered_at})`);
  for (const [co, v] of Object.entries(st?.companies ?? {})) if (v.reconciled_at) console.log(`${co}: last replay of missed Jira changes ${v.reconciled_at} (${v.reconciled ?? 0})`);
  if (/^BLOCKED/.test(st?.last_run?.result ?? "")) console.log(`\x1b[31m⛔ ${st.last_run.issue}: ${st.last_run.result} (see the card comment for the fix)\x1b[0m`);
  for (const [co, v] of Object.entries(st?.companies ?? {})) { const n = Object.entries(v.needs ?? {}); if (!n.length) continue;
    const of = (l) => n.filter(([, x]) => x === l).map(([k]) => k);
    console.log(`${co}: needs-hire ${of("needs-hire").length} (${of("needs-hire").join(", ") || "-"}) · needs-decision ${of("needs-decision").length} (${of("needs-decision").join(", ") || "-"})`); }
  try { // pending CEO inbox items (all companies of this key); quiet when offline
    const { execFileSync } = await import("node:child_process");
    const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
    const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"), dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
    if (key) {
      const r = await (async () => { const u = process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", bd = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "inbox_list", arguments: {} } }); const { signFetch } = await import("./device-key.mjs").catch(() => ({ signFetch: () => ({}) }));
        return fetch(u, { method: "POST", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": AH_CLIENT_VERSION, "X-AH-Client": "ah-cli", ...(dev ? { "X-AH-Device": dev } : {}), ...signFetch(u, bd) },
        body: bd }); })();
      const j = await r.json(), d = JSON.parse(j.result?.content?.[0]?.text ?? "null");
      if (d && typeof d.count === "number") console.log(d.count ? `\x1b[1;31mCEO inbox: ${d.count} pending\x1b[0m (holding inbox list · reply <id> <answer> · dismiss <id>)` : "CEO inbox: nothing pending ✔");
    }
  } catch { /* offline: skip */ }
  console.log("server view (Jira listener + events as the server sees them): ask your agent /listener or /doctor");
}
