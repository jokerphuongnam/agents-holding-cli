import assert from "node:assert/strict";
import { describeDispatchError, staffingRecovery } from "../full/client/scripts/dispatch-errors.mjs";

const error = new TypeError("fetch failed", {
  cause: Object.assign(new Error("getaddrinfo ENOTFOUND mznrffnvmhmiudvfuquk.supabase.co"), { code: "ENOTFOUND" }),
});
assert.match(describeDispatchError(error), /ENOTFOUND/);
assert.match(staffingRecovery(error), /No staff was dispatched/);
assert.match(staffingRecovery(error), /holding doctor --server/);
assert.match(staffingRecovery(error), /retry the same task once/);
assert.doesNotMatch(staffingRecovery(error), /Authorization|Bearer|token/i);
console.log("dispatch_errors_test: pass");
