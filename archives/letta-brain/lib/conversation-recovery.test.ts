import assert from "node:assert/strict";
import { test } from "node:test";

import { isMissingConversation } from "./conversation-recovery.ts";

test("recognizes the local backend's missing-conversation error", () => {
  assert.equal(isMissingConversation("", "Conversation con_QPvFAwS14xUBFIIb not found"), true);
  assert.equal(isMissingConversation("", "Conversation local-conv-999 not found\n"), true);
  assert.equal(isMissingConversation("Conversation con_abc not found", ""), true);
});

test("does not fire on unrelated failures or on result output", () => {
  assert.equal(isMissingConversation("", "Provider is not configured: openrouter"), false);
  assert.equal(isMissingConversation("", "timed out after 420000ms"), false);
  assert.equal(isMissingConversation("", "letta -> exit 1: no output"), false);
  assert.equal(isMissingConversation('{"result":"I could not find that file."}', ""), false);
  assert.equal(isMissingConversation("", "Conversation id was accepted"), false);
});
