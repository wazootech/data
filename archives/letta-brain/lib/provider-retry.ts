/**
 * Detects the provider-capacity failure that used to become a 502.
 *
 * When the model provider rate-limits a turn, the Letta CLI exits non-zero and
 * prints the provider's error as JSON: `"retryable": true`, `"code": 429`,
 * `"status": "Too Many Requests"`. The turn never ran, so nothing was written to
 * memory or to the conversation, and running it again is safe — unlike a failure
 * that happens after work has already been committed.
 *
 * Google's free tier is the live case (wazootech/data#9): it accepts a turn one
 * minute and returns `429 ... retryDelay 48s` the next, which is capacity rather
 * than a broken service. The delay the provider names is honoured, bounded.
 *
 * Callers should consult this only when the turn did not produce a usable
 * result, so prose in a real answer cannot trigger a retry.
 */

/** Used when the provider does not name a delay, doubling per attempt. */
export const DEFAULT_RETRY_DELAY_MS = 5_000;

/** The longest a single wait may be, however long the provider asks for. */
export const MAX_RETRY_DELAY_MS = 60_000;

/** Provider errors arrive JSON-escaped inside another JSON string; compare flat. */
function flatten(stdout: string, stderr: string): string {
  return `${stderr}\n${stdout}`.replace(/\\+/gu, "");
}

export function isRetryableProviderFailure(stdout: string, stderr: string): boolean {
  const text = flatten(stdout, stderr);
  if (/"retryable"\s*:\s*true/.test(text)) return true;
  return /"code"\s*:\s*(?:429|503)\b/.test(text) && /\b(?:llm_error|Too Many Requests|rate-limited)\b/i.test(text);
}

/** The delay the provider asked for, when it named one. */
export function providerRetryDelayMs(stdout: string, stderr: string): number | undefined {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(flatten(stdout, stderr));
  if (match === null) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1_000);
}

/**
 * How long to wait before attempt `attempt` (0-based). The provider's own delay
 * wins when it named one, because it is the only side that knows the window.
 */
export function planRetryDelayMs(
  attempt: number,
  providerDelayMs: number | undefined,
  capMs: number = MAX_RETRY_DELAY_MS,
): number {
  const base = providerDelayMs ?? DEFAULT_RETRY_DELAY_MS * 2 ** attempt;
  return Math.max(0, Math.min(base, capMs));
}
