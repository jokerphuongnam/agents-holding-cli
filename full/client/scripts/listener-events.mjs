// Jira comments created by Agents Holding are audit output, not a new user
// request. Replaying them would make the listener comment on the same issue
// forever. User comments and status transitions must continue through the flow.
export function isAutomationEcho(event) {
  return event === "agent_comment";
}
