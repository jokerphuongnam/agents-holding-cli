// Keychain guard (import first). macOS `security` resolves the default keychain from $HOME; under a temporary/fake HOME it
// finds none and pops "keychain not found / restore keychain" dialogs. Every *-generic-password call is pinned to the REAL
// user's login keychain (from the passwd entry, not $HOME); AH_SKIP_KEYCHAIN=1 turns keychain access off (returns "not found").
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { userInfo } from "node:os";
import { existsSync } from "node:fs";
const real = (() => { try { return userInfo().homedir; } catch { return process.env.HOME; } })();
export const LOGIN_KC = [`${real}/Library/Keychains/login.keychain-db`, `${real}/Library/Keychains/login.keychain`].find((p) => existsSync(p)) ?? null;
const OPS = new Set(["find-generic-password", "add-generic-password", "delete-generic-password"]);
if (!cp.__ahKcGuard) {
  const orig = cp.execFileSync;
  cp.execFileSync = function (file, args, ...rest) {
    if (file === "security" && Array.isArray(args) && OPS.has(args[0])) {
      if (process.env.AH_SKIP_KEYCHAIN === "1" || !LOGIN_KC) { const e = new Error("keychain skipped (AH_SKIP_KEYCHAIN or no login keychain)"); e.status = 44; throw e; }
      args = [...args, LOGIN_KC];
    }
    return orig.call(this, file, args, ...rest);
  };
  cp.__ahKcGuard = true; syncBuiltinESMExports();
}
