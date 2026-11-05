#!/usr/bin/env node
// Hardware-bound device key: Secure Enclave (macOS) > TPM (Windows / Linux) > file key (lower trust, flagged "file").
// Prints request signing headers for agents-holding.
//   node device-key.mjs info                         -> {"trust":"secure_enclave","pubkey":"<b64 SPKI>"}
//   node device-key.mjs headers <METHOD> <path> [bodyFile|-]  -> JSON of X-AH-* headers (signs ts/nonce/method/path/sha256(body))
import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, randomBytes, sign as nsign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.AH_DEVICE_KEY_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "agents-holding", "device-key");
const run = (cmd, args, input) => execFileSync(cmd, args, { input, stdio: [input ? "pipe" : "ignore", "pipe", "ignore"] }).toString().trim();
const ok = (f) => { try { f(); return true; } catch { return false; } };
function seBinary() { // compile the Swift helper once per source version, cached in DIR
  const src = join(HERE, "device-key", "AHDeviceKey.swift"), h = createHash("sha256").update(readFileSync(src)).digest("hex").slice(0, 12);
  const bin = join(DIR, `ah-device-key-${h}`);
  if (!existsSync(bin)) { mkdirSync(DIR, { recursive: true, mode: 0o700 }); run("swiftc", ["-O", "-o", bin, src]); }
  return bin;
}
const backends = {
  secure_enclave: { can: () => process.env.AH_DEVICE_KEY !== "file" && platform() === "darwin" && ok(() => run(seBinary(), ["available"])),
    pub: () => run(seBinary(), ["pubkey"]), sign: (d) => run(seBinary(), ["sign", "-"], d) },
  tpm: { can: () => process.env.AH_DEVICE_KEY !== "file" && (platform() === "win32" ? ok(() => run("powershell", ["-NoProfile", "-File", join(HERE, "device-key", "windows-tpm.ps1"), "available"]))
      : platform() === "linux" && ok(() => run(join(HERE, "device-key", "tpm2.sh"), ["available"]))),
    pub: () => platform() === "win32" ? run("powershell", ["-NoProfile", "-File", join(HERE, "device-key", "windows-tpm.ps1"), "pubkey"]) : run(join(HERE, "device-key", "tpm2.sh"), ["pubkey"]),
    sign: (d) => platform() === "win32" ? run("powershell", ["-NoProfile", "-File", join(HERE, "device-key", "windows-tpm.ps1"), "sign", "-"], d) : run(join(HERE, "device-key", "tpm2.sh"), ["sign", "-"], d) },
  file: { can: () => true,
    key() { const f = join(DIR, "file.pem");
      if (!existsSync(f)) { mkdirSync(DIR, { recursive: true, mode: 0o700 }); const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
        writeFileSync(f, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 }); }
      return createPrivateKey(readFileSync(f)); },
    pub() { return createPublicKey(this.key()).export({ type: "spki", format: "der" }).toString("base64"); },
    sign(d) { return nsign("sha256", d, this.key()).toString("base64"); } },
};
export function backend() { // remember the choice so a machine never silently downgrades from hardware to file
  const memo = join(DIR, "backend");
  if (existsSync(memo)) { const b = readFileSync(memo, "utf8").trim(); if (backends[b]) return b; }
  const b = ["secure_enclave", "tpm", "file"].find((n) => backends[n].can());
  mkdirSync(DIR, { recursive: true, mode: 0o700 }); writeFileSync(memo, b + "\n", { mode: 0o600 }); return b;
}
export const canonical = (ts, nonce, method, path, bodyHash) => `ah-v1\n${ts}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
export function headers(method, path, body = Buffer.alloc(0), now = Date.now()) {
  const b = backend(), be = backends[b], ts = String(Math.floor(now / 1000)), nonce = randomBytes(18).toString("base64url");
  const msg = Buffer.from(canonical(ts, nonce, method, path, createHash("sha256").update(body).digest("hex")));
  return { "X-AH-Ts": ts, "X-AH-Nonce": nonce, "X-AH-Sig": be.sign(msg), "X-AH-Pubkey": be.pub(), "X-AH-Key-Trust": b };
}
const isMain = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const [cmd, m, p, f] = process.argv.slice(2);
  try {
    if (cmd === "info") { const b = backend(); console.log(JSON.stringify({ trust: b, pubkey: backends[b].pub() })); }
    else if (cmd === "headers" && m && p) console.log(JSON.stringify(headers(m, p, !f ? Buffer.alloc(0) : f === "-" ? readFileSync(0) : readFileSync(f))));
    else { console.error("usage: device-key.mjs info | headers <METHOD> <path> [bodyFile|-]"); process.exit(64); }
  } catch (e) { console.error("device key error: " + (e?.message ?? e)); process.exit(1); }
}
