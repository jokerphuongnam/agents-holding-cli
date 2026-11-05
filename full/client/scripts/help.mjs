#!/usr/bin/env node
// holding help [group|command]  (aliases: document, docs). The server decides which commands this key may run
// (POST <mcp>/help, plan/role/owner verified server-side); this file only renders. Cache: ~/.config/agents-holding/help/<sha256(key)[0:16]>.json
// (the key itself is never stored). Offline: that key's cached list, else the built-in no-key list.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { join } from "node:path";
const home = process.env.HOME || homedir(), dir = join(home, ".config/agents-holding/help");
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"), dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
const lang = /^vi/i.test(process.env.AH_LANG || process.env.LANG || "") ? "vi" : "en";
const url = (process.env.AH_MCP_URL || "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp").replace(/\/$/, "") + "/help";
const cacheFile = (k) => join(dir, (k ? createHash("sha256").update(k).digest("hex").slice(0, 16) : "nokey") + `.${lang}.json`);
export const NOKEY = { en: { lang: "en", scope: "nokey", groups: [
  { n: 1, id: "setup", title: "Setup", cmds: [["setup sync [--claude]", "Install slash commands into your agent"], ["setup open '<setup_url>'", "Open a setup link"], ["doctor [--server]", "Check every setup step"], ["help [group|command]", "This help (aliases: document, docs)"]] },
  { n: 2, id: "key", title: "License key", cmds: [["key generate", "Create a Free key for this machine"], ["key import", "Use an existing key on this machine (hidden prompt)"], ["key show", "Your key id, plan, credits, devices"]] }] },
  vi: { lang: "vi", scope: "nokey", groups: [
  { n: 1, id: "setup", title: "Cài đặt", cmds: [["setup sync [--claude]", "Cài lệnh / vào agent của bạn"], ["setup open '<setup_url>'", "Mở link cài đặt"], ["doctor [--server]", "Kiểm tra từng bước cài đặt"], ["help [group|command]", "Trợ giúp này (alias: document, docs)"]] },
  { n: 2, id: "key", title: "Key bản quyền", cmds: [["key generate", "Tạo key Free cho máy này"], ["key import", "Dùng key có sẵn trên máy này (nhập ẩn)"], ["key show", "Mã key, gói, credit, thiết bị của bạn"]] }] } };
const norm = (h) => ({ ...h, groups: h.groups.map((g, i) => ({ ...g, cmds: g.cmds.map((c, j) => Array.isArray(c) ? { n: `${g.n ?? i + 1}.${j + 1}`, cmd: c[0], text: c[1] } : c) })) });
async function load() {
  let note = "";
  if (key && !process.env.AH_HELP_OFFLINE) {
    try {
      const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${key}`, "X-AH-Lang": lang, "X-AH-Client": "ah-cli", ...(dev ? { "X-AH-Device": dev } : {}) }, body: "{}" });
      if (r.ok) { const h = await r.json(); if (Array.isArray(h?.groups)) { try { mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(cacheFile(key), JSON.stringify(h), { mode: 0o600 }); } catch {} return { h, note }; } }
    } catch {}
    try { return { h: JSON.parse(readFileSync(cacheFile(key), "utf8")), note: lang === "vi" ? "(ngoại tuyến: danh sách đã lưu của key này)" : "(offline: this key's cached list)" }; } catch {}
    note = lang === "vi" ? "(ngoại tuyến, chưa có danh sách cho key này: chỉ lệnh cài đặt)" : "(offline and no cached list for this key: setup commands only)";
  } else if (!key) note = lang === "vi" ? "(chưa có key: chạy holding key generate hoặc holding key import để thấy mọi lệnh)" : "(no key on this Mac: run holding key generate or holding key import to see every command)";
  return { h: NOKEY[lang], note };
}
export function render(h0, q = "") {
  const h = norm(h0), out = [], ql = q.toLowerCase().trim();
  if (ql) {
    const g = h.groups.find((x) => x.id === ql || String(x.n) === ql || x.title.toLowerCase() === ql);
    if (g) return [`${g.n}. ${g.title}`, ...g.cmds.map((c) => `  ${c.n}  holding ${c.cmd}\n        ${c.text}`)].join("\n");
    const hits = h.groups.flatMap((x) => x.cmds).filter((c) => c.n === ql || c.cmd.toLowerCase().startsWith(ql) || c.cmd.toLowerCase().split(/[\s|]+/).includes(ql));
    if (hits.length) return hits.map((c) => `${c.n}  holding ${c.cmd}\n    ${c.text}`).join("\n");
    return (h.lang === "vi" ? `Không có lệnh "${q}" cho key này. ` : `No command "${q}" for this key. `) + "holding help";
  }
  out.push(h.lang === "vi" ? "Lệnh holding (theo key của bạn):" : "holding commands (for your key):");
  for (const g of h.groups) { out.push(`\n${g.n}. ${g.title}`); for (const c of g.cmds) out.push(`  ${c.n.padEnd(5)} holding ${c.cmd.padEnd(44)} ${c.text}`); }
  out.push("\n" + (h.lang === "vi" ? "Chi tiết: holding help <nhóm|lệnh>" : "Details: holding help <group|command>"));
  return out.join("\n");
}
const isMain = (() => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return false; } })();
if (isMain) {
  const { h, note } = await load(); console.log(render(h, process.argv.slice(2).join(" "))); if (note) console.log(note);
}
