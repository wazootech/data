import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  isRetryableProviderFailure,
  planRetryDelayMs,
  providerRetryDelayMs,
} from "./provider-retry.ts";

/** Captured from a live `data-http` turn on 2026-09-26 (wazootech/data#9). */
const LIVE_429 = [
  'letta -> exit 1: "type.googleapis.com/google.rpc.RetryInfo",\\n',
  '        "retryDelay": "48s"\\n      }\\n    ]\\n  }\\n}\\n",\\n',
  '      "code":429,\\n      "status":"Too Many Requests"\\n',
  '      "error_type": "llm_error",\\n      "retryable": true,\\n',
  '      "run_id": "local-run-4"',
].join("");

test("recognizes a live provider rate-limit failure", () => {
  assert.equal(isRetryableProviderFailure("", LIVE_429), true);
});

test("recognizes the failure when the provider error is doubly escaped", () => {
  const escaped = LIVE_429.replace(/"/gu, '\\"').replace(/\\+/gu, '\\\\');
  assert.equal(isRetryableProviderFailure(escaped, ""), true);
});

test("recognizes an explicit retryable flag on its own", () => {
  assert.equal(isRetryableProviderFailure('{"is_error":true,"retryable": true}', ""), true);
});

test("does not fire on a missing conversation", () => {
  assert.equal(isRetryableProviderFailure("", "Conversation local-conv-999 not found"), false);
  assert.equal(isRetryableProviderFailure("", "Conversation con_QPvFAwS14xUBFIIb not found\n"), false);
});

test("does not fire on unrelated failures or on a successful result", () => {
  assert.equal(isRetryableProviderFailure("", "Provider is not configured: openrouter"), false);
  assert.equal(isRetryableProviderFailure("", "timed out after 420000ms"), false);
  assert.equal(isRetryableProviderFailure('{"result":"I could not find that file."}', ""), false);
  assert.equal(isRetryableProviderFailure("", '"code":404,"status":"Not Found"'), false);
});

test("reads the delay the provider named", () => {
  assert.equal(providerRetryDelayMs("", LIVE_429), 48_000);
  assert.equal(providerRetryDelayMs('"retryDelay": "31s"', ""), 31_000);
  assert.equal(providerRetryDelayMs("", "no delay here"), undefined);
  assert.equal(providerRetryDelayMs('"retryDelay": "0s"', ""), undefined);
});

test("waits as long as the provider asked, and clamps it", () => {
  assert.equal(planRetryDelayMs(0, 48_000), 48_000);
  assert.equal(planRetryDelayMs(1, 48_000), 48_000);
  assert.equal(planRetryDelayMs(0, 999_000), MAX_RETRY_DELAY_MS);
});

test("backs off on its own when the provider named no delay", () => {
  assert.equal(planRetryDelayMs(0, undefined), DEFAULT_RETRY_DELAY_MS);
  assert.equal(planRetryDelayMs(1, undefined), DEFAULT_RETRY_DELAY_MS * 2);
  assert.equal(planRetryDelayMs(9, undefined), MAX_RETRY_DELAY_MS);
});
