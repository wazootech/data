# Data

Data is Wazoo's developer-support agent. It answers questions about Wazoo's own
tooling from repository source and documentation, verifies what it can, cites what
it used, and hands verified findings to Computer instead of writing to a repository
itself.

This repository is Data's house. Its prompt lives here, its published artifacts live
here, and the tooling that deploys its live surface lives here. What does not live
here is Data's conversations and memory: those belong to the runtime.

## What lives here

| Path | Contents |
| --- | --- |
| `agent/instructions.md` | Data's prompt. The source of truth for who Data is; the live Zo persona is built from it. |
| `channels/http/` | Data's live surface: `GET /health` and `POST /ask`, deployed as the `data-http` Zo service. |
| `channels/discord/` | Data's Discord channel: a thin Gateway socket that forwards admitted mentions into `channels/http/`, deployed as the `data-discord` Zo service. |
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

- **Identity.** A Zo persona, built from `agent/instructions.md`, scoped read-only:
  file reads, web search and browsing, conversation reads, and read-only views of
  hosting and settings. Data holds no write scope and no shell, so the read-only
  boundary is structural rather than a matter of instruction.
- **Surface.** The `data-http` service in `channels/http/` routes questions into that
  persona and returns the answer. `GET /health` reports readiness; `POST /ask` takes
  `{ question, session? }`. The `data-discord` service in `channels/discord/` is the human
  front door: it holds the Gateway socket, and forwards each admitted mention to
  `POST /ask` with `session=discord:<channel>`, so both channels share one brain and one
  thread of memory.
- **Deploy.** Pushing to `main` runs `.github/workflows/deploy.yml`, which fast-forwards
  the live checkout on the Zo host and restarts the service through Zo's MCP endpoint,
  then waits for the service's own readiness line. This is the same shape as Goop's
  deploy, and it needs the repository secret `ZO_API_KEY`.

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
