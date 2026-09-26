/**
 * Detects the local Letta backend's "conversation is gone" failure.
 *
 * The backend prints `Conversation <id> not found` on stderr and exits 1 with
 * no stdout when `--conversation <id>` names a conversation it does not have.
 * That happens after the backend's conversation store is replaced (a reset, a
 * re-created agent, or state written by a different backend), and the stored
 * id keeps being re-sent forever unless the caller drops it.
 *
 * Callers should consult this only when no result object was parsed from the
 * turn, so prose in a real answer cannot trigger a retry.
 */
export function isMissingConversation(stdout: string, stderr: string): boolean {
  return `${stderr}\n${stdout}`
    .split("\n")
    .some((line) => /conversation\b.*\bnot found\b/i.test(line));
}
