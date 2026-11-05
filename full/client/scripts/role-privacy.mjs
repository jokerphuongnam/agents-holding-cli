// Role privacy: private roles NEVER leave the machine (name, prompt, skills).
// Synced process structure replaces their ownership with opaque ids: private-role-<12 hex>
// Stable per (companySalt, localRoleName); salt is per-company and never the role name.
// Hash = sha256(salt + "\0" + localRoleName), first 12 hex. Cannot reverse or correlate across companies.

export const PRIVATE_ROLE_RE = /^private-role-[a-f0-9]{12}$/;
export const isOpaquePrivateRole = (id) => PRIVATE_ROLE_RE.test(String(id ?? ""));

/** Sync-safe process/flow structure: replace private local role names with opaque ids; strip any prompt/skills. */
export function scrubProcessStructure(proc, { salt, isPrivateLocal }) {
  if (!proc || typeof proc !== "object") return proc;
  const mapRole = (r) => {
    const id = String(r ?? "");
    if (!id) return id;
    if (isOpaquePrivateRole(id)) return id;
    if (typeof isPrivateLocal === "function" ? isPrivateLocal(id) : false) return opaquePrivateRoleId(salt, id);
    return id;
  };
  const out = JSON.parse(JSON.stringify(proc));
  // common shapes: stages[].who / owner / staff / role; actions with staff
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const k of ["who", "who_moves", "staff", "role", "owner", "owner_role", "assigned_role"]) {
      if (typeof o[k] === "string") o[k] = mapRole(o[k]);
    }
    if (Array.isArray(o.roles)) o.roles = o.roles.map(mapRole);
    // never upload persona / skills / prompt for any role entry embedded in structure
    for (const bad of ["persona", "persona_md", "prompt", "skills", "skill_ids", "content", "files"]) delete o[bad];
    for (const v of Object.values(o)) walk(v);
  };
  walk(out);
  return out;
}

export function opaquePrivateRoleId(salt, localRoleName) {
  const s = String(salt ?? ""), n = String(localRoleName ?? "").trim().toLowerCase();
  if (!s || !n) throw new Error("opaquePrivateRoleId needs company salt and role name");
  // SubtleCrypto-free: use Web Crypto when available, else node crypto via globalThis.__ahSha256Hex
  return `private-role-${syncSha256Hex(s + "\0" + n).slice(0, 12)}`;
}

function syncSha256Hex(s) {
  if (typeof globalThis.__ahSha256Hex === "function") return globalThis.__ahSha256Hex(s);
  // Deno / browser
  throw new Error("sha256 not wired: set globalThis.__ahSha256Hex or use opaquePrivateRoleIdAsync");
}

export async function opaquePrivateRoleIdAsync(salt, localRoleName) {
  const s = String(salt ?? ""), n = String(localRoleName ?? "").trim().toLowerCase();
  if (!s || !n) throw new Error("opaquePrivateRoleId needs company salt and role name");
  const data = new TextEncoder().encode(s + "\0" + n);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `private-role-${hex.slice(0, 12)}`;
}

/** Server-side: reject payloads that try to upload private role content. */
export function rejectPrivateRoleLeak(payload) {
  const s = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  // explicit private markers with content
  if (/"visibility"\s*:\s*"private"/.test(s) && /persona|prompt|skills|SKILL\.md/i.test(s)) {
    return "Private role content must not be uploaded (name/prompt/skills stay on the client).";
  }
  // local role names that look like they were meant to stay private but weren't scrubbed
  if (/"__private_role__"|\"private_roles\"\s*:\s*\[/.test(s)) {
    return "Private roles must be scrubbed to private-role-<hash> before sync.";
  }
  return null;
}
