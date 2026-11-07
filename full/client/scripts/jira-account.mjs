#!/usr/bin/env node
import * as O from "./oauth.mjs";
const cmd = process.argv[2] ?? "list";
if (cmd === "list") {
  const xs = O.accounts("atlassian");
  if (!xs.length) console.log("No Jira accounts in the local pool.");
  else for (const x of xs) console.log(`${x.active ? "*" : "-"} ${x.account}  sites=${x.resources.map((r) => r.url).join(", ") || "unknown"}`);
} else if (cmd === "status") console.log(await O.status("atlassian"));
else if (cmd === "logout") console.log(O.logout("atlassian"));
else { console.error("usage: holding jira account list|status|logout"); process.exit(2); }
