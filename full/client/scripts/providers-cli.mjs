#!/usr/bin/env node
// holding providers [--json]: every agent provider (built-in, agents.json, custom module) with a health check.
import { homedir } from "node:os";
import { listProviders } from "./providers/index.mjs";
const ps = await listProviders(homedir());
if (process.argv.includes("--json")) console.log(JSON.stringify(ps, null, 1));
else for (const p of ps) console.log(`${p.ok ? "✅" : "❌"} ${p.id.padEnd(18)} ${p.name} [${p.source}${p.effort ? ", effort" : ""}] ${p.detail}`);
