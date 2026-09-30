# Learning entry format

**`entry-format: 1`**

This is the interface between the capture skill, which writes `.learnings/`, and any consumer that reads it. The executable definition is the corpus in [`fixtures/`](fixtures/): each `<case>.md` has a hand-written `<case>.expected.json` stating exactly what a conforming reader returns. A consumer vendors `fixtures/` at a pinned commit and runs its own reader against it. `scripts/entries.mjs` is this skill's reader, and the corpus is checked against it on every change. Every fixture is invented.

## Corpus

The corpus is every regular file matching `*.md` directly inside `.learnings/`. File names starting with `.` are excluded. Subdirectories are not searched. Files are read in byte order of their names. An entry means the same thing in any corpus file: its file name carries no meaning.

## Entries

- **Header.** A line starting with `## [` at column 0 opens an entry. The **id** is the text inside the first `[...]` on that line. The **heading** is the rest of the line after that `]`, trimmed. It holds the category for `LRN`, the command for `ERR`, and the capability for `FEAT`. A header line with no closing `]` still opens an entry, with id `""` and heading `""`. A reader may skip that entry, but it must never merge the entry's fields into the entry before it.
- **Extent.** An entry runs from its header to the next header or to the end of the file. `### ` subheadings, `---` rules, and every other `## ` heading stay inside the entry. A closing `---` and a final newline are both optional. Lines before the first header, such as a template preamble, belong to no entry.
- **Fences are not tracked.** A header line or a field line inside a fenced block counts. A preamble therefore never contains a line starting `## [`, and an entry never holds a field-shaped line inside a fence.
- **Lines** are split on LF. Values and headings are trimmed, so a trailing CR has no effect.

## Ids

The capture skill writes `TYPE-YYYYMMDD-NNN`. `TYPE` is `LRN`, `ERR` or `FEAT`. `YYYYMMDD` is the UTC date of capture. `NNN` is the next three-digit sequence for that type and date across the whole corpus, starting at `001`, as printed by `node "<skill-dir>/scripts/entries.mjs" next-id <TYPE>`. Older entries may carry three-character alphanumeric suffixes such as `ERR-20250115-A3F`. Readers never validate an id: an id is whatever sits in the brackets.

**Once written, an id never changes.** Ids are also cited from outside the corpus, for example in a document's `learnings:` frontmatter list or in a ledger row. Those citations rely on the id string alone.

## Field lines

A field line starts at column 0 and takes one of two spellings:

- bold: `**Name**: value`
- bullet: `- Name: value`

The value is the text after the colon, trimmed, and it may be empty. Names are case-sensitive. None of these are fields: `- **Name**:`, `* Name:`, an indented line, `**Name** :`, or `**name**:`. If one entry sets a field more than once, **the last occurrence wins**, whatever its spelling. Readers accept both spellings for every field. Writers use the spelling given in the table below.

| Field | Written as | Values | Written by | A reader may rely on |
|---|---|---|---|---|
| `Status` | bold | `pending` `in_progress` `resolved` `wont_fix` `promoted` `promoted_to_skill` | capture; a consumer may move it to `promoted` | exact lowercase comparison |
| `Skill` | bold | `<plugin>:<name>` or `none` | capture | absent, empty and `none` (compared case-insensitively) all mean no skill |
| `Fix-type` | bold | `rule` `skill` `verifier` `refactor` | capture | lowercase the value before comparing |
| `Review` | bold | one or more review ids separated by whitespace, commas, or both | capture, only for category `review_finding` | splitting on `[\s,]+` and dropping empty tokens gives the id set |
| `Promoted` | bold | `CLAUDE.md`, `auto memory (<file>)`, or a skill path | capture, or a consumer | free text naming the promotion target |
| `Skill-Path` | bold | path of the extracted skill | capture, together with `promoted_to_skill` | free text |
| `Scenario` | bold | slug of the scenario that exercises the fix | **consumer only** | see [Reserved](#reserved-for-consumers) |
| `Verdict` | bold | for example `fixed` | **consumer only** | see [Reserved](#reserved-for-consumers) |
| `Activation` | bold | for example `activated` | **consumer only** | see [Reserved](#reserved-for-consumers) |
| `Applications` | bullet, under `### Metadata` | `N` | capture, optional | [numeric rule](#evidence-fields) |
| `Confirmations` | bullet, under `### Metadata` | `N` | capture, optional | [numeric rule](#evidence-fields) |
| `Contradictions` | bullet, under `### Metadata` | `N` | capture, optional | [numeric rule](#evidence-fields) |
| `Confidence` | bullet, under `### Metadata` | `0.0`–`1.0` | a consumer that scores entries | [numeric rule](#evidence-fields) |
| `Last-Observed` | bullet, under `### Metadata` | ISO-8601 timestamp | capture, optional | free text; the timestamp records when the learning was last seen and is never a score input |
| `Logged` | bold | ISO-8601 timestamp | capture | informational |
| `Priority` | bold | `low` `medium` `high` `critical` | capture | informational |
| `Area` | bold | `frontend` `backend` `infra` `tests` `docs` `config` | capture | informational |

A reader returns exactly these fields. No other line is a field.

## Reserved for consumers

`Scenario`, `Verdict` and `Activation` belong to a consumer that reconciles an entry into a skill. The capture skill never writes them. A consumer may write them, may move `Status` to `promoted`, and may set `Promoted`. The values a consumer is known to test are `Verdict: fixed` and `Activation: activated`. What those values mean is defined by the consumer.

## Evidence fields

The evidence fields are optional. This plugin ships no scorer and promises none. A consumer may score them, and a consumer may read them only in the bullet spelling. The numeric value of `Applications`, `Confirmations`, `Contradictions` or `Confidence` is the leading decimal number of its value: an optional sign, digits with an optional fraction, and an optional exponent. A value with no leading number reads as `0`, so `4 (last three sessions)` reads as `4`.

## Not part of the contract

- Section bodies such as `### Summary`, `### Details`, `### Error`, `### Resolution` and `### Metadata` lines other than the evidence fields. These are prose written for people, and no reader may parse them.
- The text of a template's preamble.
- The order of fields within an entry, and the order of entries across files.

## Changing the contract

Adding a fixture that every existing expectation still satisfies is not a change. A change that makes any existing fixture's expectation differ bumps `entry-format`, in this file and in `ENTRY_FORMAT` in `scripts/entries.mjs`. Adding a field also bumps it, because a reader returns exactly the fields in the table. Expectations are always written by hand, never generated by running a reader.
