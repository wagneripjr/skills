# Publishing a postmortem to Confluence

Run this only when the user asks for the postmortem on Confluence. The repository file is the
record; the Confluence page is a copy of it for readers who live in Confluence. Nothing here
changes the file contract in `SKILL.md`.

## Preconditions

1. **The file is written first.** `docs/postmortems/YYYY-MM-DD-<slug>.md` exists and meets the
   file contract. Publishing never replaces writing it — the frontmatter and the finding-id live
   only in the file.
2. **A Confluence tool is connected.** You need create-page, update-page and read-page
   operations. Atlassian's MCP server provides them as `createConfluenceContent`,
   `updateConfluenceContent` and `getConfluenceContent`; the tool-name prefix differs per host.
   If no such tool is available, stop after the file: report its path and say that publishing
   needs a connected Atlassian MCP server. Do not hand-roll REST calls, do not ask the user for an
   API token, and never print a page URL or id that a tool did not return — a fabricated link is
   worse than none, because someone will paste it into the incident channel.
3. **The destination is known** — see the next section.
4. **The tool's own preflight is followed.** Atlassian's tools require reading the content-format
   guide and the space's authoring instructions before writing. Do it. Apply space instructions
   to anything this procedure leaves open (where the page lives, extra labels); the title and the
   body below come from the file and are not restyled.

## Destination — per project

Every postmortem of a project lands under the same Confluence parent page, recorded once in the
project's repository beside the postmortems themselves, in `docs/postmortems/confluence.json`:

```json
{ "parent": "https://<site>.atlassian.net/wiki/spaces/<KEY>/pages/<parent-page-id>" }
```

- **Config present:** create every new page under `parent` (pass it as the create call's parent
  content URL). Read the parent page first; if it cannot be read — deleted, moved, no permission —
  stop and report. Never fall back to the space root or to a guessed page: a postmortem published
  in the wrong place is read by the wrong audience.
- **Config absent:** ask the user where postmortems go. Accept a parent page URL, or an existing
  postmortem page whose siblings these should be — then the destination is *that page's parent*,
  found by listing its ancestors, and you state which page that is before using it. Write the
  answer to `docs/postmortems/confluence.json` and commit it with the postmortem, so the question
  is asked once per project rather than once per incident.

The config fixes *where*; it does not make the publish silent. A postmortem carries
infrastructure detail and its appendices carry real commands and output, so the first create of
each postmortem still names the parent page in the confirmation.

## Title

```
YYYY-MM-DD HH:MM <H1>
```

- `YYYY-MM-DD` is the **filename** date (the incident date).
- `HH:MM` is the **start of the incident window** from the body's metadata table, in the
  timezone the document declares. Do not convert it again, and do not add the timezone to the
  title.
- The rest is the H1, verbatim.

Example: `2026-03-14 21:07 checkout-api — p99 latency spike during flash sale`. Date and time first
make a parent page's children sort chronologically.

If the document has no window start, ask the user for it. Never fill in `00:00` or a time recalled
from memory: a made-up time in a title is an unsourced number in the most-read line of the page.

Date and H1 are the pair that forms the finding-id, so the same freeze applies: never retitle the
page on its own. If the H1 changes, the page title changes with it, through a republish.

## Body — the file's Markdown, preserved

Send `body.format: "markdown"` with the file's content, after exactly three removals:

1. **The YAML frontmatter block.** Confluence does not parse it — and its closing `---` directly
   under the last key is a setext heading underline in Markdown, so left in, `severity: high`
   renders as an H2 at the top of the page.
2. **HTML comments between the frontmatter and the H1** — template guidance, not content.
3. **The H1.** The page title already carries it; left in, the title appears twice.

Everything else goes as written: headings, tables, code fences, lists, blockquotes, emphasis. Do
not convert to HTML, add panels or macros, or reflow text. The format guide prefers HTML for rich
elements, but a postmortem uses only basic Markdown, and a converted body is a second rendering
that drifts from the file it claims to copy. Severity, status and dates still reach the reader:
the body's metadata table carries them in their human labels.

Relative links to other repository files will not resolve on Confluence. Leave them as written
and list them in the report so the user can decide.

## Labels

After the page exists, add `postmortem` and `severity-<enum>` (e.g. `severity-high`) through the
label operation — on Atlassian's MCP server, `addLabelsToConfluenceContent`, reached through its
`discover` tool. Labels are what make the Confluence copy filterable the way frontmatter makes the
repository corpus filterable: `label = "severity-high"` is the Confluence-side query. If no label
operation is available, say so; the page is still valid without them.

## Create or update

**First publish** (the frontmatter has no `confluence:` key):

- Create a classic page (`contentType: page`) as a draft (`draft: true`) unless the user said to
  publish it now. Classic pages are the type that supports drafts, and a draft lets the user read
  the rendered result before anyone else can.
- Write the URL **the tool returned** into the frontmatter as an optional key,
  `confluence: <url>`, and commit it with the postmortem (or as a follow-up `docs:` commit). This
  is what makes the next publish an update instead of a duplicate.

**Republish** (the frontmatter has `confluence:`):

- Read the page first. For a classic page, read the draft with full detail — that read also
  returns the snapshot token the update requires.
- Show the user the page's current version, last editor and timestamp, and get confirmation
  before overwriting. A full-body replace discards any edit made directly in Confluence since the
  last publish; the file wins, so the user must know what is about to be lost.
- Update with the title and body rebuilt from the file as above.
- If severity changed, add the new `severity-<enum>` label and tell the user the old one is still
  on the page. Removing a label is a destructive operation and theirs to approve.
- If the page cannot be read (deleted, moved, no permission), report that and stop. Never create
  a second page while the frontmatter still points at the first.

## Report

State the page URL exactly as returned, whether it is a draft or published, the labels applied,
and any relative links that will not resolve there.
