# Data

Data is Wazoo's developer-support agent. It answers questions about Wazoo's own
tooling from repository source and documentation, verifies what it can, cites what
it used, and hands verified engineering findings to Computer instead of writing to a
repository itself.

This repository is Data's house. Its prompt lives here, its published artifacts live
here, and the tooling that deploys its live surface lives here. Data has no runtime of
its own: it is one Zo persona plus one thin Discord bridge, and its conversations live
in Zo.

## What lives here

| Path | Contents |
| --- | --- |
| `agent/instructions.md` | Data's prompt. The source of truth for who Data is; the Zo persona carries the live copy. |
| `channels/discord/` | Data's only channel: a Gateway bridge that turns an admitted mention into a question for that persona, deployed as the `data-discord` Zo service. |
| `services/` | Durable records of the long-running processes that make Data reachable. |
| `knowledge/` | Durable, verified knowledge: how a subsystem behaves, what a reproduction showed. |
| `skills/` | Procedures Data follows for a recurring kind of investigation. |
| `public/guides/` | Reference material written for developers: how a subsystem works, how to reproduce a result. |
| `public/field-notes/` | Short observations from real investigations. |
| `public/experiments/` | Bounded tests run to answer one question, with the raw result. |
| `public/challenges/` | Open problems handed to readers, with the reproduction that motivates them. |
| `demos/` | Runnable demonstrations that accompany a guide or field note. |
| `notes/` | Working material that is safe to publish but not yet shaped into a guide. |
| `archives/` | Superseded artifacts, kept with the reason they were retired. |
| `lib/`, `scripts/` | The deploy tooling, shared by the workflows in `.github/workflows/`. |

A category directory is created when the first piece in that category lands.

## How Data runs

- **Identity is a Zo persona.** Data is the persona `64e4d78b-cf2a-43e9-839f-33b7e48af8e5`
  in Ethan's Zo account. `agent/instructions.md` is the source of truth for that prompt;
  changing who Data is means editing that file and updating the persona.
- **One channel.** `channels/discord/` holds the Gateway socket as the Data application.
  An admitted mention becomes `POST https://api.zo.computer/zo/ask` with `persona_id` set,
  and the returned `conversation_id` is remembered per Discord channel, so a thread keeps
  its context. The `data-discord` Zo service runs it; it holds no model credential of its
  own, because the persona carries the model.
- **Read-only by scope, not by instruction.** The persona holds `files:read` plus
  read-only web, hosting, and settings scopes, so its boundary against repositories is
  what the runtime grants, not what the prompt asks for. It answers questions; it does
  not file, edit, merge, deploy, or change settings.
- **No runtime memory.** What an investigation settles and is worth keeping becomes a
  published artifact here through a pull request — the one thing its read-only scope
  leaves open. There is no per-session memory to lose, because there is no session to
  keep.
- **Deploy.** Pushing to `main` runs `.github/workflows/deploy.yml`, which fast-forwards
  the live checkout on the Zo host and restarts the service through Zo's MCP endpoint,
  then waits for its readiness line. This is the same shape as Goop's deploy, and it
  needs the repository secret `ZO_API_KEY`.

## Retired: the Letta brain

Data ran as a self-hosted Letta agent behind a `data-http` service from 2026-09-25 to
2026-09-26, so that it could write and commit its own memory. That runtime is retired:
`archives/letta-brain/` holds it with the reason. `DATA_BRAIN=zo` and the migration
tracked in [wazootech/data#9](https://github.com/wazootech/data/issues/9) are historical
too — both paths are now the same path.

## Retired: the Agent File

`agents/@wazootech/data/data.af` was a generated Letta Agent File describing Data's
agent layer. It is archived at `archives/agent-file/data.af`. It was a projection of an
agent that had no runtime, it required Computer's dependency graph to regenerate, and
its prompt was a second copy of the text that now lives at `agent/instructions.md`. When
something consumes a Data `.af` again, it should be generated here, from that file, and
checked by this repository's CI.

## Relationship to the rest of Wazoo

- `wazootech/computer` — Computer, the team's general assistant: triage routing, plans,
  implementation, review, and the pull requests that carry them, plus run status,
  approvals, and the public activity channel that records its own work.
- `wazootech/workspace` — the federation manifest that lists this repository for local
  checkouts.

The ownership boundary between the two agents is recorded in `AGENTS.md` here and in
[wazootech/computer#72](https://github.com/wazootech/computer/issues/72).
