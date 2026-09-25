# Agent

Data's identity lives here.

- `instructions.md` is Data's system prompt and the single source of truth for who
  Data is: the counterpart to Computer, scoped to developer support for Wazoo's own
  tooling, answering from repository source and documentation rather than memory,
  read-only against repositories, and publishing its guidance artifacts here.

Data runs as a self-hosted Letta agent, whose memory is a local git repository of
markdown. That memory carries a copy of this prompt at `system/persona.md`, seeded from
`instructions.md` by `scripts/sync-persona.ts` (`npm run sync-persona`, `--dry-run` to
compare without writing). Re-seed after every change here: the render is deterministic,
so an unchanged prompt is a no-op and a changed one is one commit. When the two
disagree, this file is the source and the agent's memory is what gets fixed.

## History

This prompt was authored in `wazootech/computer` under `agents/data/agent/` as part
of the two-agent eve split proposed in wazootech/computer#72. That split is not
landed, and the prompt now belongs to the agent's own repository, so it moved here
in the same change that removed it from Computer.
