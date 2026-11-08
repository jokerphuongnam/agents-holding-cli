#!/usr/bin/env node
// OAuth path for workflow setup. The legacy shell script uses Basic/API-token
// auth; installed users normally have Atlassian 3LO instead.
import { atlassianToken } from "./attach.mjs";
import { client } from "./jira.mjs";
import { homedir } from "node:os";

const [site, , key] = process.argv.slice(2);
if (!site || !key || process.argv.includes("--dry-run")) process.exit(2);
const A = await atlassianToken(homedir());
if (!A?.auth) process.exit(2); // let the legacy API-token path handle it
const req = client(A);
const statuses = await req("GET", `/project/${encodeURIComponent(key)}/statuses`);
const rows = (statuses ?? []).flatMap((x) => x.statuses ?? []);
const old = rows.find((x) => String(x.name).toLowerCase() === "pre coding");
if (!old) {
  // Let the Basic-auth fallback run the full workflow reconciliation. A
  // missing legacy status is not a successful setup: Pre Code may still need
  // to be created and duplicate statuses removed.
  console.log(`OAuth workflow setup: no "Pre Coding" status found for ${key}; falling back to full setup.`);
  process.exit(2);
}
console.log(`OAuth workflow setup: renaming status ${old.id} "Pre Coding" -> "Pre Code"`);
await req("PUT", `/status/${old.id}`, { name: "Pre Code", description: old.description ?? "" });
console.log(`Done: ${key} now uses "Pre Code".`);
