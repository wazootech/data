# Data repository guide

`wazootech/data` is Data's house: its prompt, its knowledge, its published artifacts,
and the tooling that deploys its live surface. Data's conversations and memory live in
the runtime, not in this checkout.

## Layout

- `agent/instructions.md` — Data's prompt. The source of truth; the live Zo persona is
  built from it. Change it here first.
- `channels/http/` — the `data-http` service: `GET /health`, `POST /ask`. Data's brain,
  reached over HTTP.
- `channels/discord/` — the `data-discord` service: a thin Gateway bridge that forwards an
  admitted mention to `channels/http/`, so both surfaces share one brain.
- `channels/discord/` — the `data-discord` service: a thin Gateway socket that forwards
  admitted mentions into `channels/http/`. It carries no prompt and calls no model; it is
  transport, so Data keeps one brain.
- `services/`, `automations/` — durable records of the processes and schedules that make
  Data operational. Records name environment variables, never their values.
- `knowledge/`, `skills/` — durable knowledge and procedures.
- `public/`, `demos/`, `notes/` — published artifacts and working material.
- `archives/` — superseded artifacts with the reason they were retired.
- `lib/`, `scripts/`, `.github/workflows/` — deploy tooling and CI.

## What does not belong here

- Anything that is not safe to publish. This repository is public: no credentials,
  tokens, internal channel identifiers, customer data, or unredacted logs.
- A second copy of Data's prompt. If the persona and `agent/instructions.md` disagree,
  that is a bug: the file is the source and the persona follows it.

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
- The service holds no write scope and no shell. Do not add one to the persona to work
  around a missing capability; bring the capability into this repository instead.

## Agent self-improvement (friction-gated)

File an issue only when real work surfaced a bug, a divergence from intended semantics,
or a genuine QoL gap that measurably cost time or trust. Never hunt for improvements.
Finish the current task first, check existing issues, then file one precise issue with a
recommended fix.
