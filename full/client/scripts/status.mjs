#!/usr/bin/env node
// holding status: is the listener alive, realtime joined, last Jira event, last server heartbeat, what it is working on.
// holding notify on|off: macOS notifications for start/done/fail (default on; AH_NOTIFY=0 also turns them off).
import { homedir } from "node:os";
import * as L from "./lean.mjs";
const [cmd, arg] = process.argv.slice(2), home = process.env.AH_HOME ?? homedir();
if (cmd === "notify") {
  if (arg === "on" || arg === "off") { L.setNotify(home, arg === "on"); console.log(`notifications ${arg} (the running listener picks it up on the next event)`); }
  else console.log(`notifications ${L.notifyOn(home) ? "on" : "off"}  (holding notify on|off)`);
} else {
  const st = L.readStatus(home); let alive = false;
  try { if (st?.pid) { process.kill(st.pid, 0); alive = true; } } catch {}
  { const { resolveCompany } = await import("./company.mjs"); const c = resolveCompany(); console.log(c.company ? `company: ${c.company} (from ${c.source})` : "company: none (holding use <company>)"); }
  { const w = L.listenerWarning(home); if (w) console.log(w + "\n"); }
  console.log(L.formatStatus(st, alive));
  for (const [co, v] of Object.entries(st?.companies ?? {})) { const n = Object.entries(v.needs ?? {}); if (!n.length) continue;
    const of = (l) => n.filter(([, x]) => x === l).map(([k]) => k);
    console.log(`${co}: needs-hire ${of("needs-hire").length} (${of("needs-hire").join(", ") || "-"}) · needs-decision ${of("needs-decision").length} (${of("needs-decision").join(", ") || "-"})`); }
  console.log("server view (Jira listener + events as the server sees them): ask your agent /listener or /doctor");
}
