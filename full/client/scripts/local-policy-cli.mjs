#!/usr/bin/env node
import { homedir } from "node:os";
import * as P from "./policy.mjs";
import * as C from "./policy-core.mjs";

const a = process.argv.slice(2), cmd = a.shift(), role = a.shift() ?? "*", company = process.env.AH_COMPANY;
if (!company) { console.error("no company: run inside a company repo or pass AH_COMPANY"); process.exit(2); }
const target = role === "*" ? "*" : role;
const read = (r = target) => P.loadPolicy(homedir(), company, r === "*" ? "company" : r);
const save = (r, p) => P.savePolicy(homedir(), company, r === "*" ? "*" : r, p, { company: { local_only: true } });
const show = (r) => console.log(P.rulesText(read(r)));
if (cmd === "show") { show(target); process.exit(0); }
if (cmd === "sync") { console.log(`permission policy is local-only for ${company}/${target}; no server sync performed`); process.exit(0); }
if (cmd === "set") { const key = a.shift(), value = ["on", "true", "allow"].includes(String(a.shift()).toLowerCase()); const p = read(target); p.permissions ??= {}; if (!C.PERMISSIONS.includes(key)) throw new Error(`unknown permission ${key}`); p.permissions[key] = value; save(target, p); console.log(`${target}: ${key} ${value ? "allowed" : "denied"}`); process.exit(0); }
if (cmd === "rule") { const op = a.shift(), text = a.join(" "), p = read(target); p.rules ??= {}; p.rules.text ??= []; if (op === "add") p.rules.text.push(text); else if (op === "remove") p.rules.text = p.rules.text.filter((x) => x !== text); else throw new Error("rule add|remove"); save(target, p); console.log("saved locally"); process.exit(0); }
if (cmd === "deny") { const op = a.shift(), path = a.join(" "), p = read(target); p.files ??= {}; p.files.deny ??= []; if (op === "add") p.files.deny.push(path); else if (op === "remove") p.files.deny = p.files.deny.filter((x) => x !== path); else throw new Error("deny add|remove"); p.files.deny = [...new Set(p.files.deny)]; save(target, p); console.log("saved locally"); process.exit(0); }
if (cmd === "shell") { const op = a.shift(), pat = a.join(" "), p = read(target); p.shell ??= { allow: [], deny: [] }; const k = op === "allow" ? "allow" : op === "deny" ? "deny" : null; if (!k) throw new Error("shell allow|deny"); p.shell[k].push(pat); p.shell[k] = [...new Set(p.shell[k])]; save(target, p); console.log("saved locally"); process.exit(0); }
console.error("usage: local-policy-cli show|sync|set|rule|deny|shell <staff>"); process.exit(2);
