import { execFileSync } from "node:child_process";
import { hostname, homedir } from "node:os";

const base = (process.env.AH_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co").replace(/\/$/, "");
function kc(service) {
  try { return execFileSync("security", ["find-generic-password", "-s", service, "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}
export function license() { return process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license") || kc("agents-holding-test-license") || ""; }
export async function projectConfig(company) {
  const key = license(); if (!key) throw new Error("no Agents Holding license");
  const device = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}` };
  if (device) { headers["X-AH-Device"] = device; headers["X-AH-Device-Name"] = (process.env.AGENTS_HOLDING_DEVICE_NAME || hostname()).slice(0, 80); }
  const r = await fetch(`${base}/functions/v1/project-config`, { method: "POST", signal: AbortSignal.timeout(20000), headers, body: JSON.stringify({ company }) });
  const body = await r.text(); let j; try { j = JSON.parse(body); } catch { throw new Error(`project-config failed: HTTP ${r.status}`); }
  if (!r.ok) throw new Error(`project-config failed: ${j.error ?? r.status}`);
  return j;
}
