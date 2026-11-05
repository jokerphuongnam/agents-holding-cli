#!/usr/bin/env node
// holding company migrate <local company folder|repo> [--parent <slug>] [--slug <slug>] [--jira KEY] [--dry-run]
// Brings ONE older local company (.agents/<x>-company) into holding. Backs up first (~/.config/agents-holding/backups),
// sends only names/counts (staff role ids, plan count, parent, creation time), never file contents. Originals stay on disk.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import * as R from "./registry.mjs";
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const pos = argv.filter((x, i) => !x.startsWith("--") && !["--parent", "--slug", "--jira", "--name"].includes(argv[i - 1]));
const vi = /^vi/.test(process.env.AH_LANG || process.env.LANG || ""), say = (en, v) => console.log(vi ? v : en);
if (!pos[0]) { console.error("usage: holding company migrate <local company folder> [--parent <company>] [--dry-run]"); process.exit(2); }
let dir = resolve(pos[0]);
if (!basename(dir).endsWith("-company")) { const a = join(dir, ".agents"); const c = existsSync(a) ? readdirSync(a).filter((d) => d.endsWith("-company")) : []; if (c.length !== 1) { console.error(vi ? "Không tìm thấy đúng 1 thư mục công ty (.agents/*-company)." : "Could not find exactly one .agents/*-company folder."); process.exit(1); } dir = join(a, c[0]); }
const repo = dirname(dirname(dir)), rd = (p) => { try { return readFileSync(join(dir, p), "utf8"); } catch { return ""; } };
const walk = (d) => { try { return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); } catch { return []; } };
export function parseLocal(dir) {
  const rdx = (p) => { try { return readFileSync(join(dir, p), "utf8"); } catch { return ""; } };
  const roles = walk(join(dir, "system/staffs")).filter((p) => p.endsWith(".md") && !/README/i.test(p)).map((p) => basename(p, ".md").toLowerCase());
  const plans = walk(join(dir, "plans")).filter((p) => p.endsWith(".md")).length || (existsSync(join(dir, "plans")) ? readdirSync(join(dir, "plans")).length : 0);
  const md = rdx("COMPANY.md"), parent = (rdx("PARENT.md").match(/parent[^a-z0-9]*([a-z0-9-]+-company)/i) || [])[1] || null;
  const tech = ((md.match(/Tech seed notes:\s*([^\n]+)/i) || [])[1] || "").replace(/[*`_]/g, " ").split(/[ ,]+/).filter((t) => /^[a-z0-9+#.-]+$/i.test(t));
  const name = basename(dir).replace(/-company$/, "");
  let created = null; try { created = statSync(dir).birthtime.toISOString(); } catch {}
  return { name, roles: [...new Set(roles)], plans, parentLocal: parent, tech, created_at: created };
}
const L = parseLocal(dir); if (opt("--name")) L.name = opt("--name"); const slug = opt("--slug") || L.name, parent = opt("--parent") || (L.parentLocal ? L.parentLocal.replace(/-company$/, "") : null);
say(`Local company ${L.name}: ${L.roles.length} staff files, ${L.plans} plans${parent ? `, parent ${parent}` : ""}`, `Công ty cục bộ ${L.name}: ${L.roles.length} file nhân sự, ${L.plans} kế hoạch${parent ? `, công ty mẹ ${parent}` : ""}`);
if (argv.includes("--dry-run")) process.exit(0);
const bk = join(homedir(), ".config/agents-holding/backups"); mkdirSync(bk, { recursive: true, mode: 0o700 });
const tgz = join(bk, `${L.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.tgz`);
execFileSync("tar", ["czf", tgz, "--exclude", "cache", "-C", dirname(dir), basename(dir)]); say(`Backup: ${tgz}`, `Đã sao lưu: ${tgz}`);
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
async function mcp(name, args) {
  const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license"), dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const r = await fetch(process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Client": "ah-cli", ...(dev ? { "X-AH-Device": dev } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json(), t = j.result?.content?.[0]?.text ?? j.error?.message ?? "";
  if (j.error || j.result?.isError) { console.error(t); process.exit(1); } try { return JSON.parse(t); } catch { return t; }
}
const out = await mcp("company_import", { name: L.name, slug, roles: L.roles, plans: L.plans, tech: L.tech, ...(L.created_at ? { created_at: L.created_at } : {}), ...(parent ? { parent } : {}), ...(opt("--jira") ? { jira_project_key: opt("--jira") } : {}) });
const d = out.data ?? out;
const cj = join(repo, ".agents/company.json"); if (existsSync(cj)) writeFileSync(cj + ".bak", readFileSync(cj));
writeFileSync(cj, JSON.stringify({ company: d.company }, null, 1) + "\n");
const reg = R.load(homedir()); if (!reg.projects.some((p) => p.path === repo)) { reg.projects.push({ path: repo, name: basename(repo), boards: [] }); R.save(homedir(), reg); }
say(`Migrated -> ${d.company}${d.parent ? ` (under ${d.parent})` : ""}: ${d.roster.length} staff connected, ${d.local_only_roles} custom roles kept locally, ${d.skipped_over_limit} over plan limit.`,
    `Đã chuyển -> ${d.company}${d.parent ? ` (thuộc ${d.parent})` : ""}: ${d.roster.length} nhân sự đã kết nối, ${d.local_only_roles} vai trò riêng giữ ở máy, ${d.skipped_over_limit} vượt giới hạn gói.`);
say("Originals kept on disk. Check: holding company show " + d.company, "Bản gốc vẫn giữ nguyên trên máy. Kiểm tra: holding company show " + d.company);
