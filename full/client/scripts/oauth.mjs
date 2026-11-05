// Browser OAuth for client tools (Figma, Atlassian). The token exchange runs on our server (client secrets never here);
// tokens are kept in the Keychain (service agents-holding-oauth-<provider>) and refreshed automatically. Never printed.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
const BASE = () => (process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp").replace(/\/mcp$/, "/oauth-connect");
const svc = (p) => `agents-holding-oauth-${p}`;
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; } };
const kcDel = (s) => { try { execFileSync("security", ["delete-generic-password", "-s", s, "-a", process.env.USER], { stdio: "ignore" }); } catch {} };
export const load = (p) => { try { return JSON.parse(kc(svc(p)) ?? "null"); } catch { return null; } };
export const save = (p, t) => execFileSync("security", ["add-generic-password", "-U", "-s", svc(p), "-a", process.env.USER, "-w", JSON.stringify(t)], { stdio: "ignore" });
export const clear = (p) => kcDel(svc(p));
const key = () => process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license");
async function post(path, body, f = fetch) { const k = key(); if (!k) throw new Error("no agents-holding key (run setup first)");
  const r = await f(BASE() + path, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (r.status === 202) return { pending: true }; if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`); return j; }
export const connectHint = (p) => `Not connected to ${p}. Run: holding ${p} connect  (opens the browser to approve; no key to copy)`;
const openUrl = (u) => { try { spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", process.platform === "win32" ? ["/c", "start", "", u] : [u], { stdio: "ignore", detached: true }).unref(); return true; } catch { return false; } };
/** Account label only (never the token). Prefers stored account, then site host. */
export function accountOf(t) { if (!t) return null; return t.account || t.handle || t.email || (t.site ? String(t.site).replace(/^https?:\/\//, "") : null) || "connected"; }
export async function status(provider) {
  const t = load(provider); if (!t?.access_token) return `${provider}: not connected`;
  return `${provider}: connected as ${accountOf(t)}`;
}
export function logout(provider) {
  const t = load(provider); if (!t) return `${provider}: not connected`;
  const who = accountOf(t); clear(provider); return `${provider}: logged out (${who})`;
}
async function enrichAccount(provider, tok, f = fetch) {
  try {
    if (provider === "figma") { const r = await f("https://api.figma.com/v1/me", { headers: { Authorization: `Bearer ${tok.access_token}` } }); const j = await r.json(); tok.account = j.handle || j.email || j.id || "figma"; tok.handle = j.handle; tok.email = j.email; }
    else if (provider === "atlassian") { const r = await f("https://api.atlassian.com/oauth/token/accessible-resources", { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" } });
      const sites = await r.json(); const pick = (Array.isArray(sites) ? sites : [])[0]; if (pick) { tok.cloud_id = pick.id; tok.site = pick.url; tok.account = pick.name || String(pick.url || "").replace(/^https?:\/\//, ""); } }
  } catch {} return tok;
}
export async function connect(provider, { log = console.log, timeoutMs = 300000, switch: sw = false } = {}) {
  if (sw && load(provider)) { log(logout(provider)); }
  else if (!sw && load(provider)?.access_token) return `${provider}: already connected as ${accountOf(load(provider))} (use: holding ${provider} connect --switch)`;
  const verifier = randomBytes(32).toString("hex"), challenge = createHash("sha256").update(verifier).digest("hex");
  let done; const got = new Promise((r) => (done = r));
  const srv = createServer((q, s) => { const u = new URL(q.url, "http://x"); if (u.pathname === "/cb") { s.end("<meta charset=utf-8><h3>Đã kết nối. Quay lại terminal.</h3>"); done(u.searchParams.get("state")); } else { s.statusCode = 404; s.end(); } });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
  try {
    const b = await post("/begin", { provider, loopback: `http://127.0.0.1:${port}/cb`, challenge });
    log(`Opening the browser to connect ${provider}...`); if (!openUrl(b.url)) log(`Open this link to approve: ${b.url}`); else log(`(If it did not open: ${b.url})`);
    const t0 = Date.now(); let tok = null;
    await Promise.race([got, new Promise((r) => setTimeout(r, timeoutMs))]);
    while (!tok && Date.now() - t0 < timeoutMs) { const j = await post("/claim", { state: b.state, verifier }); if (!j.pending) tok = j; else await new Promise((r) => setTimeout(r, 2000)); }
    if (!tok) throw new Error("timed out waiting for approval");
    tok = await enrichAccount(provider, tok); save(provider, tok); return `${provider} connected as ${accountOf(tok)}`;
  } finally { srv.close(); }
}
/** Valid access token (refreshing through our server when expired), or null when not connected. */
export async function token(provider, f = fetch) {
  const t = load(provider); if (!t?.access_token) return null;
  if (Date.now() < (t.expires_at ?? 0)) return t;
  if (!t.refresh_token) return null;
  try { const n = await post("/refresh", { provider, refresh_token: t.refresh_token }, f); const m = { ...t, ...n }; save(provider, m); return m; } catch { return null; }
}
/** Token, or start the browser connect flow (interactive terminal), or throw a clear hint (AI / non-interactive). */
export async function ensure(provider) {
  const t = await token(provider); if (t) return t;
  if (process.stdin.isTTY && process.env.AH_NONINTERACTIVE !== "1") { console.log(await connect(provider)); return token(provider); }
  throw new Error(connectHint(provider));
}
