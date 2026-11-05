// node help_test.mjs: rendering, no-key list, per-key cache by hash (key never stored), offline fallbacks.
import assert from "node:assert/strict"; import { execFileSync } from "node:child_process"; import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join, dirname } from "node:path"; import { createHash } from "node:crypto"; import { fileURLToPath } from "node:url";
import { render, NOKEY } from "./help.mjs";
const here = dirname(fileURLToPath(import.meta.url)), T = mkdtempSync(join(tmpdir(), "ahhelp-")); mkdirSync(join(T, "bin")); writeFileSync(join(T, "bin/security"), "#!/bin/sh\nexit 44\n", { mode: 0o755 });
const run = (args, env = {}) => execFileSync("node", [join(here, "help.mjs"), ...args], { encoding: "utf8", env: { ...process.env, HOME: T, PATH: `${T}/bin:${process.env.PATH}`, AH_MCP_URL: "http://127.0.0.1:9/x", AGENTS_HOLDING_KEY: "", LANG: "en_US", ...env } });
let o = run([]); assert.match(o, /1\. Setup/); assert.match(o, /2\. License key/); assert.doesNotMatch(o, /key list|team|security/); assert.match(o, /no key on this Mac/);
assert.match(run([], { LANG: "vi_VN" }), /Cài đặt/);
o = run(["key"]); assert.match(o, /2\.1\s+holding key generate/);
o = run(["xyz"]); assert.match(o, /No command "xyz"/);
// valid-looking key, offline, no cache -> no-key list
const K = "ah_live_TESTONLY_not_a_real_key"; o = run([], { AGENTS_HOLDING_KEY: K }); assert.match(o, /no cached list for this key/); assert.doesNotMatch(o, /Companies/);
// cached list for this key is used offline, file named by hash, key never written
const h = { lang: "en", scope: "customer", groups: [...NOKEY.en.groups, { n: 3, id: "staff", title: "Staff", cmds: [{ n: "3.1", cmd: "staff list", text: "Your staff" }] }] };
const f = join(T, ".config/agents-holding/help", createHash("sha256").update(K).digest("hex").slice(0, 16) + ".en.json"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(h));
o = run([], { AGENTS_HOLDING_KEY: K }); assert.match(o, /3\. Staff/); assert.match(o, /cached list/);
o = run([], { AGENTS_HOLDING_KEY: "ah_live_OTHER" }); assert.doesNotMatch(o, /Staff/);  // another key never sees this key's cache
for (const n of readdirSync(dirname(f))) assert.ok(!readFileSync(join(dirname(f), n), "utf8").includes(K) && !n.includes(K));
// renderer never invents commands: it prints exactly what the server sent
assert.doesNotMatch(render({ lang: "en", groups: [] }), /holding key/);
console.log("help_test: all passed");
