# Data's agent file

`data.af` lands in this directory once Data's agent source exists. The file follows Letta's
[Agent File](https://github.com/letta-ai/agent-file) format, the same convention used for
`computer.af` in `wazootech/computer`.

Rules for this directory:

- `data.af` is a projection of Data's source, never the source of truth. It is produced by
  `scripts/export-agent-file.ts` in `wazootech/computer` from an explicit shareable-block
  allowlist, and CI fails when the committed file and a fresh regeneration disagree.
- Do not hand-edit `data.af`. Change the source, then regenerate.
- A block whose content is private is excluded by the allowlist rather than redacted into the
  export. `wazootech/data` is public, so the export must never carry secrets, customer data, or
  internal-only operational detail.

Open item: the format fixes model configuration, memory blocks, tools, and message history, but not
Data's identity — the agent id and the mapping from Data's runtime to its file are settled in
[wazootech/computer#73](https://github.com/wazootech/computer/issues/73).
