# Retired: Data's Agent File (.af)

`data.af` is the Agent File checkpoint projected for Data in `wazootech/computer`
by `scripts/export-agent-file.ts` (commit range around wazootech/computer#75).

It is retired here for three reasons:

1. **There was no agent to checkpoint.** Data has never had a runtime. The file
   declared a target, and its own `metadata.model_note` said so.
2. **Its generator was another repository's dependency graph.** Regenerating it
   required `wazootech/computer`'s build and `@github-tools/sdk`, so a copy living
   here would have drifted from the copy that CI actually checked.
3. **Data's runtime is a Zo persona, not an eve app.** The `.af` format describes
   Letta agent state; nothing in Data's runtime consumes it.

Its content is preserved in git history and in this archive. If a consumer for a
Data checkpoint appears — a Letta-hosted Data, or a second framework — the
projection returns as a generated artifact of whichever repository owns the source.
