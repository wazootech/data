# Automations

Durable records of the Zo automations that govern Data. One file per automation,
recording the automation ID, state, the exact `DTSTART`/`RRULE` with timezone, the
model, result delivery, the paths it touches, the instruction verbatim, and how to
recreate it.

These files exist so a schedule can be rebuilt if the Zo host is lost. They are
records, not the schedule: the live automation is the one in Zo.

Maintenance rules:

- Record the schedule as the exact `DTSTART`/`RRULE` lines plus a plain-language
  reading, never a paraphrase alone.
- Include the instruction verbatim. Paraphrasing drops the boundaries that keep an
  automation safe.
- Never store secrets, tokens, cookies, browser state, or message bodies here.
- When an automation is retired, keep its record and mark it retired.

## Inventory

None yet. Data's only runtime is the Discord bridge in `channels/discord/`, which is a
service, not a schedule.
