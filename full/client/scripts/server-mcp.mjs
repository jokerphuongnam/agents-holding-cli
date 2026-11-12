import { execFileSync } from "node:child_process";
import { hostname, homedir } from "node:os";

const base = (process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp").replace(/\/$/, "");
function kc(service) {
  try { return execFileSync("security", ["find-generic-password", "-s", service, "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}
export function license() { return process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license") || kc("agents-holding-test-license") || ""; }
export async function mcp(name, args = {}) {
  const key = license(); if (!key) throw new Error("no Agents Holding license");
  const device = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}` };
  if (device) { headers["X-AH-Device"] = device; headers["X-AH-Device-Name"] = (process.env.AGENTS_HOLDING_DEVICE_NAME || hostname()).slice(0, 80); }
  const r = await fetch(`${base}`, { method: "POST", signal: AbortSignal.timeout(Number(process.env.AH_MCP_TIMEOUT_MS ?? 60000)), headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }) });
  const body = await r.text(); let j; try { j = JSON.parse(body); } catch { throw new Error(`${name} failed: HTTP ${r.status}`); }
  const text = j.result?.content?.[0]?.text;
  if (!r.ok || j.result?.isError || !text) throw new Error(`${name} failed: ${text || body}`);
  return JSON.parse(text);
}
