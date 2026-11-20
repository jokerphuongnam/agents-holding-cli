/** Keep network failures actionable without leaking request headers or payloads. */
export function describeDispatchError(error) {
  const details = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    const code = typeof current.code === "string" ? current.code : "";
    const message = typeof current.message === "string" ? current.message : String(current);
    const detail = [code, message].filter(Boolean).join(": ");
    if (detail && !details.includes(detail)) details.push(detail);
    current = current.cause;
  }
  return details.join(" <- ") || "Unknown dispatch error";
}

export function staffingRecovery(error) {
  const detail = describeDispatchError(error);
  return `[staffing check unavailable] ${detail}\nNo staff was dispatched because the company staffing gate could not be verified. Check connectivity with \`holding doctor --server\`; once the server is reachable, retry the same task once. The task remains unassigned until the staffing gate succeeds.`;
}
