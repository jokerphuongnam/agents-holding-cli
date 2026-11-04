#!/usr/bin/env node
// holding status: is the listener alive, realtime joined, last webhook event, last server heartbeat, what it is working on.
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
  console.log(L.formatStatus(st, alive));
  console.log("server view (webhook + heartbeat as the server sees them): ask your agent /listener or /doctor");
}
