/**
 * Close-code vocabulary for Data's hand-rolled Discord gateway.
 *
 * Discord's documented gateway close codes all sit in the 4000-4999 range, and
 * `4002` is Discord's *decode error*. The bridge's own local closes used the same
 * range, so a log line reading `close 4002` could be either Discord rejecting
 * something we sent or our own reaction to an invalid session, and neither the
 * code nor the reason told them apart. wazootech/data#15 was diagnosed under that
 * ambiguity. Local closes now live in a private-use range and name themselves.
 */

/** Close codes this process raises itself. Discord never sends these. */
export const LOCAL_CLOSE = {
  heartbeatUnacknowledged: 4900,
  reconnectRequested: 4901,
  invalidSession: 4902,
} as const;

const LOCAL_CLOSE_NAMES: Record<number, string> = {
  4900: "heartbeat not acknowledged",
  4901: "local: the gateway asked for a reconnect",
  4902: "local: invalid session",
};

const DISCORD_CLOSE_NAMES: Record<number, string> = {
  4000: "unknown error",
  4001: "unknown opcode",
  4002: "decode error",
  4003: "not authenticated",
  4004: "authentication failed",
  4005: "already authenticated",
  4007: "invalid seq",
  4008: "rate limited",
  4009: "session timed out",
  4010: "invalid shard",
  4011: "sharding required",
  4012: "invalid API version",
  4013: "invalid intent(s)",
  4014: "disallowed intent(s)",
};

/**
 * One unambiguous phrase for a close event, naming which side raised it.
 *
 * `4002` is Discord's decode error, so it must never read like the local
 * invalid-session close: everything Discord sends is labelled `Discord close`.
 */
export function describeClose(code: number, reason: string): string {
  const local = LOCAL_CLOSE_NAMES[code];
  if (local !== undefined) return `local close ${String(code)} (${local})`;
  const detail = reason.length > 0 ? ` (${reason})` : "";
  const discord = DISCORD_CLOSE_NAMES[code];
  if (discord !== undefined) return `Discord close ${String(code)} (${discord})${detail}`;
  if (code === 1000) return `transport close 1000 (normal)${detail}`;
  if (code === 1006) return "transport close 1006 (no close frame: the connection ended)";
  return `close ${String(code)}${detail}`;
}

/** True when this process raised the close itself. */
export function isLocalClose(code: number): boolean {
  return LOCAL_CLOSE_NAMES[code] !== undefined;
}
