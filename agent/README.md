# Agent

Data's identity lives here.

- `instructions.md` is Data's system prompt and the single source of truth for who
  Data is: the counterpart to Computer, scoped to developer support for Wazoo's own
  tooling, answering from repository source and documentation rather than memory,
  read-only against repositories, and publishing its guidance artifacts here.

`instructions.md` is also the source of truth for Data's Zo persona. The persona holds
the live copy; when the two disagree, this file is the source and the persona is what
gets fixed.

## History

This prompt was authored in `wazootech/computer` under `agents/data/agent/` as part
of the two-agent eve split proposed in wazootech/computer#72. That split is not
landed, and the prompt now belongs to the agent's own repository, so it moved here
in the same change that removed it from Computer.
