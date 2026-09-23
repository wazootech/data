import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findZoService,
  parseZoCommandResult,
  parseZoServiceList,
  parseZoServiceStatus,
} from "./zo-deploy.ts";

const COMMAND_RESULT = "CmdResult(stdout='ok\\n', stderr='', returncode=0)";

const SERVICE_LIST = [
  "Services (2):",
  "  - service_id='svc_yXEtQ1BclNg' label='obsidian-web' mode='http' entrypoint='node index.js'",
  "    workdir='/home/workspace/obsidian-web/src/server' http_url='https://obsidian-web-etok.zocomputer.io' public=True",
  "  - service_id='svc_datahttp123' label='data-http' mode='process' entrypoint='bun run ./index.ts'",
  "    workdir='/home/workspace/users/etok/workspaces/wazootech/repos/computer' protocol='tcp'",
].join("\n");

const SERVICE_DOCTOR = [
  "Host status: OK",
  "",
  "Services: 1",
  "  data-http: RUNNING, uptime 00:00:17, pid 4812",
  "",
  "Logs (last 10 lines):",
  "  {\"level\":\"info\",\"event\":\"data-http starting\"}",
  "  {\"level\":\"info\",\"event\":\"ready: data-http\",\"botId\":\"1551139973359476756\"}",
].join("\n");

describe("parseZoCommandResult", () => {
  it("reads stdout, stderr, and the exit code", () => {
    assert.deepEqual(parseZoCommandResult(COMMAND_RESULT), { stdout: "ok\n", stderr: "", returncode: 0 });
  });

  it("restores escaped newlines so git output stays readable", () => {
    const text = "CmdResult(stdout='abc123\\ndef456\\n', stderr='', returncode=0)";
    assert.deepEqual(parseZoCommandResult(text)?.stdout, "abc123\ndef456\n");
  });

  it("keeps a failing command's stderr and non-zero code", () => {
    const text = "CmdResult(stdout='', stderr='fatal: not a git repository\\n', returncode=128)";
    const result = parseZoCommandResult(text);
    assert.equal(result?.returncode, 128);
    assert.equal(result?.stderr, "fatal: not a git repository\n");
  });

  it("returns null when the text is not a command result", () => {
    assert.equal(parseZoCommandResult("tool failed"), null);
  });
});

describe("parseZoServiceList", () => {
  it("reads every service entry and ignores non-entry lines", () => {
    const entries = parseZoServiceList(SERVICE_LIST);
    assert.equal(entries.length, 2);
    assert.equal(entries[1].serviceId, "svc_datahttp123");
    assert.equal(entries[1].mode, "process");
    assert.equal(entries[1].label, "data-http");
    assert.equal(entries[1].workdir, "/home/workspace/users/etok/workspaces/wazootech/repos/computer");
    assert.equal(entries[1].entrypoint, "bun run ./index.ts");
  });

  it("picks the single label match and refuses ambiguity", () => {
    const entries = parseZoServiceList(SERVICE_LIST);
    assert.equal(findZoService(entries, "data-http")?.serviceId, "svc_datahttp123");
    assert.equal(findZoService(entries, "missing"), null);
    assert.equal(findZoService([...entries, ...entries], "obsidian-web"), null);
  });
});

describe("parseZoServiceStatus", () => {
  it("reads the running state, uptime, and log tail", () => {
    const status = parseZoServiceStatus(SERVICE_DOCTOR, "data-http");
    assert.equal(status?.state, "RUNNING");
    assert.equal(status?.uptimeSeconds, 17);
    assert.match(status?.logs ?? "", /ready: data-http/u);
  });

  it("reads a fatal service without an uptime", () => {
    const status = parseZoServiceStatus("  wazoo-discord-zo-bridge: FATAL, retries 3", "wazoo-discord-zo-bridge");
    assert.equal(status?.state, "FATAL");
    assert.equal(status?.uptimeSeconds, null);
    assert.equal(status?.logs, "");
  });

  it("returns null for an unknown label", () => {
    assert.equal(parseZoServiceStatus(SERVICE_DOCTOR, "ghost"), null);
  });
});
