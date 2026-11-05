#!/usr/bin/env node
// holding staff sync: register local staff until the plan cap, then mark the rest inactive.
import { homedir } from "node:os";
import { resolveCompany } from "./company.mjs";
import { mcpCall } from "./mcp-client.mjs";
import { localStaff, reconcileStaff, rosterEntry, writeStaffStatus } from "./staff-roster.mjs";
const company = resolveCompany().company;
if (!company) { console.error("no company: run inside a company repo or pass --company"); process.exit(2); }
const home = process.env.HOME || homedir(), local = localStaff(process.cwd(), company, home);
const registered = [];
for (const r of local) {
  try { const out = await mcpCall("staff_register", { company, role: r.id ?? r.name }); registered.push({ ...r, server: out.data ?? out }); }
  catch (e) { registered.push({ ...r, server_error: e.message }); }
}
const roster = registered.flatMap((x) => x.server?.roster ?? []);
const limit = registered.find((x) => x.server?.limit != null)?.server?.limit ?? null;
const rows = reconcileStaff(local.map((r) => ({ ...r, id: r.id ?? r.name })), { roster, limit }, limit);
for (const r of rows) { const failure = registered.find((x) => x.name === r.name)?.server_error; if (failure) { r.error = failure; if (/over the plan limit/.test(failure)) r.status = "not active (over plan limit)"; } }
writeStaffStatus(home, company, rows);
let bad = 0;
for (const r of rows) {
  if (r.active) console.log(`${r.name}: active (server roster)`);
  else { bad++; console.error(`${r.name}: ${r.status}${r.error ? `\n${r.error}` : ""}`); }
}
if (!local.length) console.log("No local staff files found; the server roster remains authoritative.");
process.exitCode = bad ? 1 : 0;
