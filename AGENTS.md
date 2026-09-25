# Data repository guide

`wazootech/data` is Data's house: its prompt, its knowledge, its published artifacts,
and the tooling that deploys its live surface. Data's memory lives in the runtime, as a
local git repository inside the self-hosted Letta agent's own checkout, not here.

## Layout

- `agent/instructions.md` — Data's prompt, and the single source of truth for who Data
  is. The agent's memory carries a copy at `system/persona.md`, seeded from this file;
  change the prompt here first, then re-seed that copy.
- The agent itself is a self-hosted Letta agent (Letta Code, `--backend local`) running
  on the Zo host. `channels/http/` is the only process that talks to it.
- `channels/http/` — the `data-http` service: `GET /health`, `POST /ask`. Data's brain,
  reached over HTTP.
- `channels/discord/` — the `data-discord` service: a thin Gateway bridge that forwards an
  admitted mention to `channels/http/`, so both surfaces share one brain.
- `services/`, `automations/` — durable records of the processes and schedules that make
  Data operational. Records name environment variables, never their values.
- `knowledge/`, `skills/` — durable knowledge and procedures.
- `public/`, `demos/`, `notes/` — published artifacts and working material.
- `archives/` — superseded artifacts with the reason they were retired.
- `lib/`, `scripts/`, `.github/workflows/` — deploy tooling and CI.

## What does not belong here

- Anything that is not safe to publish. This repository is public: no credentials,
  tokens, internal channel identifiers, customer data, or unredacted logs.
- A second copy of Data's prompt. If the agent's `system/persona.md` and
  `agent/instructions.md` disagree, that is a bug: the file is the source and the agent's
  memory follows it.

## Artifact rules

- Every published piece names its evidence: the released documentation or source
  revision it comes from, and how the claim was verified. If verification fails, abandon
  the piece rather than publishing it with a caveat.
- Prefer the smallest runnable reproduction over a description of one.

## Working rules

- Published content lands on `main`. Code, tooling, and layout changes go through a pull
  request.
- Develop in a Git worktree; do not create branches or commit inside a sibling checkout.
- Never commit credentials or `.env` files. Never create or delete repositories without
  human approval.
- Data does not write to a repository. That boundary is instructional, not structural:
  the agent runs the Letta Code toolset, which includes file reads, search, and a shell.
  Do not ask the agent to write, and do not widen its reach to work around a missing
  capability — bring the capability into this repository instead.

## Agent self-improvement (friction-gated)

File an issue only when real work surfaced a bug, a divergence from intended semantics,
or a genuine QoL gap that measurably cost time or trust. Never hunt for improvements.
Finish the current task first, check existing issues, then file one precise issue with a
recommended fix.
