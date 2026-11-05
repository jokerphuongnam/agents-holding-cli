// Small authenticated transport shared by staff execution and roster reconciliation.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
const VERSION = (() => { try { return readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "0"; } })();
const kc = (s) => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-a", process.env.USER ?? "", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
export async function mcpCall(name, args) {
  const key = process.env.AGENTS_HOLDING_KEY || kc("agents-holding-license");
  if (!key) throw new Error("no license key in the Keychain: run holding key import");
  const dev = process.env.AGENTS_HOLDING_DEVICE || kc("agents-holding-device");
  const url = process.env.AH_MCP_URL ?? "https://mznrffnvmhmiudvfuquk.supabase.co/functions/v1/mcp";
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const { signFetch } = await import("./device-key.mjs").catch(() => ({ signFetch: () => ({}) }));
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-AH-Version": VERSION, "X-AH-Client": "ah-cli", "X-AH-Device-Name": hostname().slice(0, 80), ...(dev ? { "X-AH-Device": dev } : {}), ...signFetch(url, body) }, body });
  const text = await r.text(); let j;
  try { j = JSON.parse(text); } catch { const data = text.split("\n").filter((x) => x.startsWith("data:")).at(-1)?.slice(5).trim(); j = JSON.parse(data || "{}"); }
  const out = j.result?.content?.[0]?.text ?? j.error?.message ?? "server returned no result";
  if (!r.ok || j.error || j.result?.isError) throw new Error(out);
  try { return JSON.parse(out); } catch { return out; }
}
