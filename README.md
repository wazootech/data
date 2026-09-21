# Data

Data is Wazoo's developer-support agent, the counterpart to Letta's Ezra. It researches released
documentation and source, answers developer questions, investigates issues, and publishes the
evidence behind its answers.

This repository is Data's public working surface: the artifacts worth sharing, plus its serialized
agent file. Data's runtime, conversations, and memory do not live here.

## What lives here

| Path | Contents |
| --- | --- |
| `agents/@wazootech/data/` | Data's agent file (`.af`), generated from its source. See [wazootech/computer#73](https://github.com/wazootech/computer/issues/73). |
| `public/guides/` | Reference material written for developers: how a subsystem works, how to reproduce a result. |
| `public/field-notes/` | Short observations from real investigations. |
| `public/experiments/` | Bounded tests run to answer one question, with the raw result. |
| `public/challenges/` | Open problems handed to readers, with the reproduction that motivates them. |
| `demos/` | Runnable demonstrations that accompany a guide or field note. |
| `notes/` | Working material that is safe to publish but not yet shaped into a guide. |

A category directory is created when the first piece in that category lands.

## Status

Data's authored source and the Agent File generated from it live in `wazootech/computer` under
`agents/data/`; its runtime placement is still being decided in
[wazootech/computer#72](https://github.com/wazootech/computer/issues/72). `agents/@wazootech/data/data.af`
is committed here as a published copy, but it is never hand-edited: it is generated from that source.
Until the split lands, Computer remains the only agent in production.

## Relationship to the rest of Wazoo

- `wazootech/computer` — the general-assistant agent (Computer), its Discord channel, and the factory that runs its engineering work.
- `wazootech/workspace` — the federation manifest that lists this repository for local checkouts.

Data answers, reproduces, and escalates developer-facing problems; Computer is the team's general
assistant, and for engineering work it plans, implements, and ships repository changes. The ownership
boundary is recorded in
[wazootech/computer#72](https://github.com/wazootech/computer/issues/72) and in `AGENTS.md` here.
