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
  console.log(`OAuth workflow setup: no "Pre Coding" status found for ${key}; nothing to rename.`);
  process.exit(0);
}
console.log(`OAuth workflow setup: renaming status ${old.id} "Pre Coding" -> "Pre Code"`);
await req("PUT", `/status/${old.id}`, { name: "Pre Code", description: old.description ?? "" });
console.log(`Done: ${key} now uses "Pre Code".`);
