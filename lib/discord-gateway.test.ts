import assert from "node:assert/strict";
import { test } from "node:test";

import { LOCAL_CLOSE, describeClose, isLocalClose } from "./discord-gateway.ts";

test("names a Discord close as Discord's, never as the local one", () => {
  // 4002 is Discord's decode error. It used to be indistinguishable in the log
  // from this bridge's own invalid-session close, which is what #15 hit.
  assert.equal(describeClose(4002, ""), "Discord close 4002 (decode error)");
  assert.equal(describeClose(4002, "bad frame"), "Discord close 4002 (decode error) (bad frame)");
  assert.equal(describeClose(4014, ""), "Discord close 4014 (disallowed intent(s))");
  assert.equal(describeClose(4004, ""), "Discord close 4004 (authentication failed)");
  assert.equal(describeClose(4007, ""), "Discord close 4007 (invalid seq)");
});

test("names a local close as local, and never collides with Discord's range", () => {
  assert.equal(describeClose(LOCAL_CLOSE.invalidSession, "local: invalid session"), "local close 4902 (local: invalid session)");
  assert.equal(isLocalClose(LOCAL_CLOSE.invalidSession), true);
  assert.equal(isLocalClose(LOCAL_CLOSE.heartbeatUnacknowledged), true);
  assert.equal(isLocalClose(LOCAL_CLOSE.reconnectRequested), true);
  for (const code of Object.values(LOCAL_CLOSE)) {
    assert.ok(code >= 4900, `local close ${String(code)} must not collide with Discord's 4xxx codes`);
  }
});

test("a Discord code is never mistaken for a local one", () => {
  for (const code of [4000, 4001, 4002, 4003, 4004, 4005, 4007, 4008, 4009, 4010, 4011, 4012, 4013, 4014]) {
    assert.equal(isLocalClose(code), false, `${String(code)} is Discord's, not ours`);
  }
});

test("describes transport closes and anything unrecognized", () => {
  assert.equal(describeClose(1006, ""), "transport close 1006 (no close frame: the connection ended)");
  assert.equal(describeClose(1000, ""), "transport close 1000 (normal)");
  assert.equal(describeClose(1005, ""), "close 1005");
  assert.equal(describeClose(1005, "nope"), "close 1005 (nope)");
});
