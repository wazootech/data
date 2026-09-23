# Agent

Data's identity lives here.

- `instructions.md` is Data's system prompt and the single source of truth for who
  Data is: the counterpart to Computer, scoped to developer support for Wazoo's own
  tooling, answering from repository source and documentation rather than memory,
  read-only against repositories, and publishing its guidance artifacts here.

A Zo persona named **Data** carries this prompt as its live identity. The deploy
step does not copy the prompt into a persona: the persona is edited in Zo, and this
file is what a reader reads and what a rebuild starts from. When the two disagree,
the persona is what is running and this file is what should be fixed.

## History

This prompt was authored in `wazootech/computer` under `agents/data/agent/` as part
of the two-agent eve split proposed in wazootech/computer#72. That split is not
landed, and the prompt now belongs to the agent's own repository, so it moved here
in the same change that removed it from Computer.
