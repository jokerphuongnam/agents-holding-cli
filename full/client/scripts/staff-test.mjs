#!/usr/bin/env node
// holding staff test <staff> [--company X]: dry-run the staff's launch command (no model call): argv, cwd, how prompt and context are passed.
import { homedir } from "node:os";
import * as A from "./agents.mjs";
import { resolveCompany, localCompanies } from "./company.mjs";
import { render } from "./providers/command.mjs";
const a = process.argv.slice(2), role = a.find((x, i) => !x.startsWith("--") && a[i - 1] !== "--company");
const company = resolveCompany(a).company;
if (!role || !company) { console.error("usage: holding staff test <staff> [--company X]"); process.exit(1); }
const r = A.resolveAgent({ cfg: A.loadAgentCfg(homedir(), company), text: true, role });
const repo = localCompanies().find((c) => c.company === company)?.repos?.[0] ?? process.cwd();
if (!r.command) { console.log(`${role} @ ${company}: no fixed command, built-in ${r.agent} adapter (${r.model ?? "default"} - ${r.effort ?? "default"}), cwd ${repo}`); process.exit(0); }
const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const x = render(r.command, { prompt: "[TEST] say OK", context: "# Staff context (sample)", cwd: repo, dir: "/tmp", b: r.binding });
const f = r.binding ?? {};
console.log(`${role} @ ${company}
  command  : ${r.command}
  fields   : model=${f.model ?? "-"} effort=${f.effort ?? "-"} max_turns=${f.max_turns ?? "-"} timeout=${f.timeout ? f.timeout + "s" : "default"} context=${f.context ?? "auto"} env=${Object.keys(f.env ?? {}).join(",") || "-"}
  runs     : ${[x.bin, ...x.args].map((s) => q(s.length > 80 ? s.slice(0, 77) + "..." : s)).join(" ")}
  cwd      : ${x.cwd}
  prompt   : ${x.stdin === null ? "via placeholder" : "via stdin"} (task only)
  context  : ${x.contextVia}
  parser   : ${x.kind}`);
