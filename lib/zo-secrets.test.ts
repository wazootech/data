import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingSecrets, parseZoSecrets } from "./zo-secrets.ts";

const FILE = [
  "# a comment",
  "",
  "export OPENROUTER_UNRELATED=ignore-me",
  'export DATA_OPENROUTER_API_KEY="sk-or-v1-abc"',
  "export DEEPSEEK_API_KEY='quoted'",
  "not an export line",
  "export =empty-key",
].join("\n");

describe("parseZoSecrets", () => {
  it("reads export lines and unquotes values", () => {
    const secrets = parseZoSecrets(FILE);
    assert.equal(secrets.get("DATA_OPENROUTER_API_KEY"), "sk-or-v1-abc");
    assert.equal(secrets.get("DEEPSEEK_API_KEY"), "quoted");
    assert.equal(secrets.has("not an export line"), false);
    assert.equal(secrets.size, 3);
  });
});

describe("missingSecrets", () => {
  it("never clobbers a value the process already has", () => {
    const missing = missingSecrets(parseZoSecrets(FILE), { DATA_OPENROUTER_API_KEY: "injected" });
    assert.equal(missing.DATA_OPENROUTER_API_KEY, undefined);
    assert.equal(missing.DEEPSEEK_API_KEY, "quoted");
  });

  it("selects a named key even when the process already carries the Zo token", () => {
    const env = { ZO_CLIENT_IDENTITY_TOKEN: "token" };
    assert.equal(Object.keys(missingSecrets(parseZoSecrets(FILE), env)).length, 3);
    assert.deepEqual(missingSecrets(parseZoSecrets(FILE), env, ["DATA_OPENROUTER_API_KEY"]), {
      DATA_OPENROUTER_API_KEY: "sk-or-v1-abc",
    });
  });

  it("returns nothing when the named key is already set", () => {
    const env = { ZO_CLIENT_IDENTITY_TOKEN: "token", DATA_OPENROUTER_API_KEY: "injected" };
    assert.deepEqual(missingSecrets(parseZoSecrets(FILE), env, ["DATA_OPENROUTER_API_KEY"]), {});
  });
});
