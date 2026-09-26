#!/usr/bin/env node
/**
 * Seeds Data's prompt into its agent memory.
 *
 * `agent/instructions.md` is the source of truth for who Data is, but Data runs
 * as a self-hosted Letta agent that reads its prompt from `system/persona.md` in
 * its memory repository. This script renders the file into that memory and
 * commits it, so the two cannot disagree for long.
 *
 * Usage:
 *   node --experimental-strip-types scripts/sync-persona.ts
 *   node --experimental-strip-types scripts/sync-persona.ts --dry-run
 *
 * Flags: --agent, --memory-dir, --dry-run, --help.
 * Exit code 0 means the agent's memory matches the repository's prompt.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { memoryDirFor, PERSONA_PATH, personaDrifted, renderPersona } from "../lib/sync-persona.ts";

/** Data's self-hosted agent, created 2026-09-25; see wazootech/data#9. */
const DEFAULT_AGENT = "agent-local-777e7e52-1533-4d8a-ac04-d5646251edce";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTRUCTIONS_PATH = join(REPO_ROOT, "agent", "instructions.md");

type Flags = { agent: string; memoryDir: string | undefined; dryRun: boolean };

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { agent: DEFAULT_AGENT, memoryDir: undefined, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--agent") flags.agent = argv[++index] ?? flags.agent;
    else if (arg === "--memory-dir") flags.memoryDir = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]?.replace(/^#!.*\n/u, ""));
      process.exit(0);
    } else {
      console.error(`unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

function git(memoryDir: string, args: string[]): string {
  return execFileSync("git", ["-C", memoryDir, ...args], { encoding: "utf8" }).trim();
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  const memoryDir = flags.memoryDir ?? memoryDirFor(flags.agent, process.env.HOME ?? homedir());

  if (!existsSync(memoryDir)) {
    console.error(`no memory repository at ${memoryDir}`);
    console.error("create the agent first, or pass --memory-dir");
    return 1;
  }

  const rendered = renderPersona(readFileSync(INSTRUCTIONS_PATH, "utf8"));
  const personaPath = join(memoryDir, PERSONA_PATH);
  const current = existsSync(personaPath) ? readFileSync(personaPath, "utf8") : undefined;

  if (!personaDrifted(current, rendered)) {
    console.log(`${PERSONA_PATH} already matches agent/instructions.md`);
    return 0;
  }

  if (flags.dryRun) {
    console.log(`${PERSONA_PATH} differs from agent/instructions.md (${rendered.length} bytes rendered)`);
    return 0;
  }

  writeFileSync(personaPath, rendered);
  git(memoryDir, ["add", PERSONA_PATH]);
  git(memoryDir, ["commit", "-m", "chore(persona): re-seed from agent/instructions.md"]);
  console.log(`seeded ${PERSONA_PATH} and committed ${git(memoryDir, ["rev-parse", "--short", "HEAD"])}`);
  return 0;
}

process.exit(main());
