# Data repository guide

`wazootech/data` is Data's house: its prompt, its published artifacts, and the tooling
that deploys its live surface. Data has no runtime of its own — it is one Zo persona and
one Discord bridge — so its conversations live in Zo and its durable output lives here.

## Layout

- `agent/instructions.md` — Data's prompt, and the single source of truth for who Data
  is. The Zo persona carries the live copy; change the prompt here first, then update the
  persona.
- `channels/discord/` — the `data-discord` service, and Data's only channel: a Gateway
  bridge that turns an admitted mention into a question for that persona.
- `services/`, `automations/` — durable records of the processes and schedules that make
  Data operational. Records name environment variables, never their values.
- `knowledge/`, `skills/` — durable knowledge and procedures.
- `public/`, `demos/`, `notes/` — published artifacts and working material.
- `archives/` — superseded artifacts with the reason they were retired.
- `lib/`, `scripts/`, `.github/workflows/` — deploy tooling and CI.

## What does not belong here

- Anything that is not safe to publish. This repository is public: no credentials,
  tokens, internal channel identifiers, customer data, or unredacted logs.
- A second copy of Data's prompt. The persona holds a copy; when the two disagree, this
  file is the source and the persona is what gets fixed.

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
- Data is read-only, and the runtime enforces it: the persona holds `files:read` plus
  read-only web, hosting, and settings scopes. It cannot write anywhere, so a missing
  capability is added to this repository, never worked around by widening the persona.

## Memory

- Data keeps no runtime memory. There is no per-session store to lose and nothing to
  re-seed: a question asked in Discord is answered from the repositories it can read.
- What an investigation settles and is worth keeping becomes a published artifact here —
  `knowledge/`, `public/guides/`, `public/field-notes/` — landed through a pull request
  like any other change.
- A published piece cites its source (repository, path, line numbers), separates what was
  verified from what was assumed, and is safe to publish. A claim that failed verification
  is recorded as failed rather than dropped.

## Agent self-improvement (friction-gated)

File an issue only when real work surfaced a bug, a divergence from intended semantics,
or a genuine QoL gap that measurably cost time or trust. Never hunt for improvements.
Finish the current task first, check existing issues, then file one precise issue with a
recommended fix.
