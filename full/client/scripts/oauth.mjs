import "./kc-guard.mjs"; // pin keychain calls to the real login keychain (never a dialog under a fake HOME)
// Browser OAuth for client tools (Figma, Atlassian). The token exchange runs on our server (client secrets never here);
// tokens are kept in the Keychain (service agents-holding-oauth-<provider>) and refreshed automatically. Never printed.
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
const BASE = () => (process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp").replace(/\/mcp$/, "/oauth-connect");
const svc = (p) => `agents-holding-oauth-${p}`;
const poolSvc = (p) => `agents-holding-oauth-${p}-pool`;
const activeSvc = (p) => `agents-holding-oauth-${p}-active`;
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; } };
const kcDel = (s) => { try { execFileSync("security", ["delete-generic-password", "-s", s, "-a", process.env.USER], { stdio: "ignore" }); } catch {} };
// For Atlassian, a site's name is not a user identity: multiple users can grant
// the same 3LO app access to the same cloud site. Prefer Jira's stable accountId
// (returned by /myself), then fall back to the legacy labels for old tokens.
const accountKey = (t) => String(t?.account_id || t?.accountId || t?.account || t?.cloud_id || t?.email || t?.site || "account").replace(/[^a-z0-9_.@:-]/gi, "_");
const internalAlias = () => `acct_${randomBytes(9).toString("hex")}`;
export const loadPool = (p) => { try { const v = JSON.parse(kc(poolSvc(p)) ?? "{}"); return Array.isArray(v) ? v : []; } catch { return []; } };
export const savePool = (p, xs) => execFileSync("security", ["add-generic-password", "-U", "-s", poolSvc(p), "-a", process.env.USER, "-w", JSON.stringify(xs)], { stdio: "ignore" });
export const load = (p, selector = {}) => {
  if (p === "atlassian") {
    const xs = loadPool(p);
    const site = String(selector.site ?? "").replace(/\/$/, "");
    const cloud = selector.cloud_id ?? selector.cloudId;
    const hit = xs.find((x) => selector.account && accountKey(x) === selector.account) ??
      xs.find((x) => cloud && (x.cloud_id === cloud || x.resources?.some((r) => r.id === cloud))) ??
      xs.find((x) => site && (x.site === site || x.resources?.some((r) => String(r.url).replace(/\/$/, "") === site))) ??
      xs.find((x) => accountKey(x) === kc(activeSvc(p))) ?? xs[0];
    if (hit) return hit;
  }
  try { return JSON.parse(kc(svc(p)) ?? "null"); } catch { return null; }
};
export const save = (p, t) => {
  if (p === "atlassian") { const xs = loadPool(p).filter((x) => accountKey(x) !== accountKey(t)); savePool(p, [...xs, t]); execFileSync("security", ["add-generic-password", "-U", "-s", activeSvc(p), "-a", process.env.USER, "-w", accountKey(t)], { stdio: "ignore" }); }
  else execFileSync("security", ["add-generic-password", "-U", "-s", svc(p), "-a", process.env.USER, "-w", JSON.stringify(t)], { stdio: "ignore" });
};
export const clear = (p) => { if (p === "atlassian") { kcDel(activeSvc(p)); return; } kcDel(svc(p)); };
export const accounts = (p = "atlassian") => loadPool(p).map((x) => ({ account: accountKey(x), resources: x.resources ?? [], active: accountKey(load(p)) === accountKey(x) }));
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
      const sites = await r.json();
      const resources = (Array.isArray(sites) ? sites : []).map((x) => ({ id: x.id, url: x.url, name: x.name, scopes: x.scopes ?? [] })).filter((x) => x.id && x.url);
      tok.resources = resources;
      const pick = resources[0]; if (pick) {
        tok.cloud_id = pick.id; tok.site = pick.url;
        // /accessible-resources identifies sites, not the Atlassian user.
        // Resolve the actual grant owner from Jira /myself.
        try {
          const me = await f(`https://api.atlassian.com/ex/jira/${encodeURIComponent(pick.id)}/rest/api/3/myself`, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" } });
          const mj = await me.json().catch(() => ({}));
          if (me.ok && (mj.accountId || mj.account_id)) {
            tok.account_id = mj.accountId || mj.account_id;
            tok.display_name = mj.displayName || mj.display_name || null;
            tok.email = mj.emailAddress || mj.email || null;
            tok.account = tok.account_id;
          }
        } catch {}
        tok.account = tok.account || pick.name || String(pick.url || "").replace(/^https?:\/\//, "");
      } }
  } catch {} return tok;
}
export async function connect(provider, { log = console.log, timeoutMs = 300000, switch: sw = false } = {}) {
  if (provider === "atlassian" && loadPool(provider).length) log(`${provider}: adding another account; existing accounts remain in the pool`);
  else if (sw && load(provider)) log(`${provider}: adding another account; existing account remains in the pool`);
  else if (!sw && load(provider)?.access_token && provider !== "atlassian") return `${provider}: already connected as ${accountOf(load(provider))}`;
  const verifier = randomBytes(32).toString("hex"), challenge = createHash("sha256").update(verifier).digest("hex");
  let done; const got = new Promise((r) => (done = r));
  const srv = createServer((q, s) => { const u = new URL(q.url, "http://x"); if (u.pathname === "/cb") { s.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); s.end("<!doctype html><html lang=vi><head><meta charset=utf-8><title>agents-holding</title></head><body style=font-family:system-ui;padding:3em><h3>Đã kết nối thành công.</h3><p>Bạn có thể đóng tab này và quay lại terminal.</p><script>setTimeout(()=>window.close(),800)</script></body></html>"); done(u.searchParams.get("state")); } else { s.statusCode = 404; s.end(); } });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const port = srv.address().port;
  try {
    const b = await post("/begin", { provider, loopback: `http://127.0.0.1:${port}/cb`, challenge });
    log(`Opening the browser to connect ${provider}...`); if (!openUrl(b.url)) log(`Open this link to approve: ${b.url}`); else log(`(If it did not open: ${b.url})`);
    const t0 = Date.now(); let tok = null;
    let timeoutHandle;
    await Promise.race([got, new Promise((r) => { timeoutHandle = setTimeout(r, timeoutMs); })]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    while (!tok && Date.now() - t0 < timeoutMs) { const j = await post("/claim", { provider, state: b.state, verifier }); if (!j.pending) tok = j; else await new Promise((r) => setTimeout(r, 2000)); }
    if (!tok) throw new Error("timed out waiting for approval");
    tok = await enrichAccount(provider, tok);
    if (provider === "atlassian") tok.internal_alias ??= internalAlias();
    save(provider, tok); return `${provider} connected as ${accountOf(tok)}`;
  } finally { srv.closeAllConnections?.(); srv.closeIdleConnections?.(); srv.close(); srv.unref?.(); }
}
/** Valid access token (refreshing through our server when expired), or null when not connected. */
export async function token(provider, selector = {}, f = fetch) {
  if (typeof selector === "function") { f = selector; selector = {}; }
  const t = load(provider, selector); if (!t?.access_token) return null;
  if (Date.now() < (t.expires_at ?? 0)) return t;
  if (!t.refresh_token) return null;
  try { const n = await post("/refresh", { provider, refresh_token: t.refresh_token }, f); const m = { ...t, ...n }; save(provider, m); return m; } catch { return null; }
}
/** Token, or start the browser connect flow (interactive terminal), or throw a clear hint (AI / non-interactive). */
export async function ensure(provider, selector = {}) {
  const t = await token(provider, selector); if (t) return t;
  if (process.stdin.isTTY && process.env.AH_NONINTERACTIVE !== "1") { console.log(await connect(provider)); return token(provider, selector); }
  throw new Error(connectHint(provider));
}
