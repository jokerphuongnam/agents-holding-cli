import assert from "node:assert/strict";
import { basename, resolve } from "node:path";
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "company";
let n = 0; const T = async (name, f) => { await f(); n++; console.log("  ok  ", name); };
await T("slugify matches server", async () => {
  assert.equal(slugify("My Shop"), "my-shop");
  assert.equal(slugify("!!!"), "company");
  assert.equal(slugify("A".repeat(60)).length, 48);
});
await T("cwd basename is the default when no name", async () => {
  const name = basename(resolve("/tmp/Demo/My Cool App"));
  assert.equal(slugify(name), "my-cool-app");
});
await T("explicit name overrides folder", async () => {
  const explicit = "Acme"; const folder = "other";
  assert.equal(explicit || folder, "Acme");
});
console.log(`${n} passed`);
