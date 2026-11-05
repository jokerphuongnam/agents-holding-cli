// holding jira attach | figma connect|export | confluence page create|update. Tokens stay in the Keychain and in memory; never printed.
import { readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { jiraToken } from "./lean.mjs";

const FIGMA_SVC = "agents-holding-figma";
const flag = (a, f) => { const i = a.indexOf(f); if (i < 0) return undefined; const v = a[i + 1]; a.splice(i, 2); return v; };
const flags = (a, f) => { const out = []; let v; while ((v = flag(a, f)) !== undefined) out.push(v); return out; };
export function atlassian(home = homedir()) { const cfg = JSON.parse(readFileSync(join(home, ".config/agents-holding/jira.json"), "utf8"));
  const auth = () => { const t = jiraToken(cfg); if (!t) throw new Error("no Atlassian token in the Keychain (holding jira connect)"); return "Basic " + Buffer.from(`${cfg.email}:${t}`).toString("base64"); };
  return { site: cfg.site.replace(/\/$/, ""), auth }; }
const ok = async (r, what) => { if (r.ok) return r.status === 204 ? null : r.json(); let d = ""; try { const j = await r.json(); d = (j.errorMessages ?? [j.message ?? ""]).join("; "); } catch {} throw new Error(`${what} -> ${r.status}${d ? `: ${d}` : ""}`); };
function form(files) { const fd = new FormData(); for (const f of files) { if (!existsSync(f) || !statSync(f).isFile()) throw new Error(`file not found: ${f}`); fd.append("file", new Blob([readFileSync(f)]), basename(f)); } return fd; }

/** Staff permission (server-side policy). No staff = the owner acting in a terminal: allowed. */
export async function permit(perm, { company, staff, mcp }) {
  if (!staff) return true;
  const r = await mcp("policy_check", { company, staff, kind: "permission", key: perm });
  const d = r?.data ?? r; if (d?.ok === false) throw new Error(d.message ?? `DENIED by staff policy: ${staff} lacks permission "${perm}"`); return true;
}
export async function jiraAttach(key, files, { fetchFn = fetch, A = atlassian(), dry = false } = {}) {
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key ?? "")) throw new Error("usage: holding jira attach <ISSUE-KEY> <file...>");
  if (!files.length) throw new Error("no files"); const fd = form(files);
  if (dry) return `DRY: would attach ${files.map((f) => basename(f)).join(", ")} to ${key}`;
  const j = await ok(await fetchFn(`${A.site}/rest/api/3/issue/${encodeURIComponent(key)}/attachments`, { method: "POST", headers: { Authorization: A.auth(), "X-Atlassian-Token": "no-check", Accept: "application/json" }, body: fd }), `Jira attach ${key}`);
  return `attached to ${key}: ${(j ?? []).map((x) => x.filename).join(", ")}`;
}
// ---- Figma
const kcGet = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; } };
export async function figmaConnect({ fetchFn = fetch, ask } = {}) {
  ask ??= async () => { process.stdout.write("Figma personal access token (hidden): "); execFileSync("stty", ["-echo"], { stdio: "inherit" });
    try { const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin }); const v = await rl.question(""); rl.close(); return v.trim(); } finally { execFileSync("stty", ["echo"], { stdio: "inherit" }); process.stdout.write("\n"); } };
  const tok = await ask(); if (!tok) throw new Error("no token entered");
  const me = await ok(await fetchFn("https://api.figma.com/v1/me", { headers: { "X-Figma-Token": tok } }), "Figma /v1/me");
  execFileSync("security", ["add-generic-password", "-U", "-s", FIGMA_SVC, "-a", process.env.USER, "-w", tok], { stdio: "ignore" });
  return `Figma connected as ${me.handle ?? me.email ?? "user"} (token saved in the Keychain)`;
}
export const parseFigma = (url) => { const m = String(url).match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)[^?]*\?(?:.*&)?node-id=([0-9]+[-:][0-9]+)/); if (!m) throw new Error("need a Figma URL with node-id"); return { file: m[1], node: m[2].replace("-", ":") }; };
export async function figmaExport(url, out, { fetchFn = fetch, token = kcGet(FIGMA_SVC) } = {}) {
  if (!token) throw new Error("no Figma token: run holding figma connect (or attach a local PNG with holding jira attach)");
  const { file, node } = parseFigma(url);
  const j = await ok(await fetchFn(`https://api.figma.com/v1/images/${file}?ids=${encodeURIComponent(node)}&format=png&scale=2`, { headers: { "X-Figma-Token": token } }), "Figma images");
  const src = j.images?.[node]; if (!src) throw new Error(`Figma returned no image for node ${node}`);
  const r = await fetchFn(src); if (!r.ok) throw new Error(`PNG download -> ${r.status}`);
  out = resolve(out ?? `figma-${node.replace(":", "-")}.png`); writeFileSync(out, Buffer.from(await r.arrayBuffer())); return out;
}
// ---- Confluence (storage format from simple Markdown)
export function mdToStorage(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const out = []; let list = null, code = null;
  for (const l of String(md).split("\n")) {
    if (code !== null) { if (/^```/.test(l)) { out.push(`<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${code.join("\n")}]]></ac:plain-text-body></ac:structured-macro>`); code = null; } else code.push(l); continue; }
    if (/^```/.test(l)) { if (list) { out.push(`</${list}>`); list = null; } code = []; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)/), li = l.match(/^\s*[-*]\s+(.*)/), ol = l.match(/^\s*\d+\.\s+(.*)/), img = l.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
    const want = li ? "ul" : ol ? "ol" : null; if (list && list !== want) { out.push(`</${list}>`); list = null; }
    if (want) { if (!list) { out.push(`<${want}>`); list = want; } out.push(`<li>${inl((li ?? ol)[1])}</li>`); continue; }
    if (h) out.push(`<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`);
    else if (img) out.push(`<ac:image><ri:attachment ri:filename="${esc(basename(img[1]))}" /></ac:image>`);
    else if (l.trim()) out.push(`<p>${inl(l)}</p>`);
  }
  if (list) out.push(`</${list}>`); return out.join("");
}
export async function confluencePage(action, space, title, file, attach = [], { fetchFn = fetch, A = atlassian(), dry = false } = {}) {
  if (!space || !title || !file) throw new Error('usage: holding confluence page create|update <SPACE> "<title>" --file page.md [--attach shot.png]');
  const body = mdToStorage(readFileSync(file, "utf8")) + attach.map((f) => `<p><ac:image><ri:attachment ri:filename="${basename(f)}" /></ac:image></p>`).join("");
  const W = `${A.site}/wiki/rest/api`, H = () => ({ Authorization: A.auth(), Accept: "application/json", "Content-Type": "application/json" });
  const found = (await ok(await fetchFn(`${W}/content?spaceKey=${encodeURIComponent(space)}&title=${encodeURIComponent(title)}&expand=version`, { headers: H() }), "Confluence find")).results?.[0];
  if (action === "create" && found) throw new Error(`page "${title}" already exists in ${space} (use: holding confluence page update)`);
  if (action === "update" && !found) throw new Error(`page "${title}" not found in ${space} (use: holding confluence page create)`);
  if (dry) return `DRY: would ${action} "${title}" in ${space} (${body.length} chars${attach.length ? `, ${attach.length} attachment(s)` : ""})`;
  const page = action === "create"
    ? await ok(await fetchFn(`${W}/content`, { method: "POST", headers: H(), body: JSON.stringify({ type: "page", title, space: { key: space }, body: { storage: { value: body, representation: "storage" } } }) }), "Confluence create")
    : await ok(await fetchFn(`${W}/content/${found.id}`, { method: "PUT", headers: H(), body: JSON.stringify({ type: "page", title, version: { number: found.version.number + 1 }, body: { storage: { value: body, representation: "storage" } } }) }), "Confluence update");
  if (attach.length) await ok(await fetchFn(`${W}/content/${page.id}/child/attachment`, { method: "PUT", headers: { Authorization: A.auth(), "X-Atlassian-Token": "no-check", Accept: "application/json" }, body: form(attach) }), "Confluence attach");
  return `${action === "create" ? "created" : "updated"} "${title}" in ${space}: ${A.site}/wiki${page._links?.webui ?? `/pages/${page.id}`}`;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const a = process.argv.slice(2), what = a.shift(), company = flag(a, "--company") ?? process.env.AH_COMPANY, staff = flag(a, "--staff") ?? process.env.AH_STAFF, dry = a.includes("--dry") && (a.splice(a.indexOf("--dry"), 1), true);
  const mcp = (await import("./policy.mjs")).mcpCall;
  try {
    if (what === "jira-attach") { await permit("jira_attach", { company, staff, mcp }); console.log(await jiraAttach(String(a.shift() ?? "").toUpperCase(), a, { dry })); }
    else if (what === "figma-connect") console.log(await figmaConnect());
    else if (what === "figma-export") { await permit("figma_export", { company, staff, mcp }); const out = flag(a, "--out"), att = flag(a, "--attach"); const f = await figmaExport(a[0], out); console.log(`exported ${f}`);
      if (att) { await permit("jira_attach", { company, staff, mcp }); console.log(await jiraAttach(att.toUpperCase(), [f], { dry })); } }
    else if (what === "confluence-page") { await permit("confluence_write", { company, staff, mcp }); const act = a.shift(), file = flag(a, "--file"), att = flags(a, "--attach"); console.log(await confluencePage(act, a[0], a[1], file, att, { dry })); }
    else throw new Error("unknown command");
  } catch (e) { console.error(e.message); process.exit(1); }
}
