# Step 3 — Specs Organization

This step runs immediately after the user picks `doc_level` (Minimal / Standard / Detailed) and before activating the Code Analyst. It decides and persists how generated specs are organized inside `<output_folder>/`.

## 1. Decide if the menu should be shown

Read `.doc-this/config.toml`, section `[specs]`. Also read `.doc-this/config.user.toml` if present and merge key by key (user file takes precedence per key).

After merge, the section is **decided** when `granularity` is one of: `module`, `use-case`, `endpoint`, `hybrid`, `feature`, `custom`.

- **Decided**: skip this step entirely. Continue to the database-context handshake (step-04).
- **Not decided** (section absent or `granularity` empty): present the menu.

### User-override warning

If `granularity` is empty in `config.toml` AND `config.user.toml` has a `[specs]` section with non-empty fields, warn before showing the menu:

> "I see `.doc-this/config.toml` has no specs-organization decision yet, but `.doc-this/config.user.toml` has an override in `[specs]`. The override will stay active after your choice and may overwrite fields you decide now.
>
> Current override in `config.user.toml`:
> [list keys and values]
>
> Proceed with the menu anyway? (y/N)"

Wait for an explicit yes. Empty or no aborts without persisting.

## 2. Show the menu

Read `.doc-this/context/surface.json` → `organization_suggestion`. Use `granularity` to pre-mark the suggested option and `rationale` to display the reason.

If `surface.json` has no `organization_suggestion` (Scout failed or didn't run), show the menu without a default and ask the user to pick manually.

Format (use `chat_language` from state.json — example below in English):

```
How do you want specs organized for this project?

Scout's suggestion: [translated granularity]
Reason: [organization_suggestion.rationale]

  [1] [marker] By code module
  [2] [marker] By use case
  [3] [marker] By endpoint / contract
  [4] [marker] Hybrid (modules at root, use cases nested)
  [5] [marker] By features (Scout lists discovered features)
  [6] [marker] Custom

Choose (Enter accepts the suggested):
```

Where `[marker]` is `*` on the pre-marked option and a space on the others. Add `(suggested)` next to the pre-marked one.

Mapping the 6 options to `granularity`:

| Option | `granularity` |
|--------|---------------|
| 1 | `module` |
| 2 | `use-case` |
| 3 | `endpoint` |
| 4 | `hybrid` |
| 5 | `feature` |
| 6 | `custom` |

### Input

- Enter without typing: accept the pre-marked option.
- Number 1–6: that option.
- Anything else: ask again, do not persist.
- Ctrl+C / ESC / cancel: abort, do not persist.

### Option 6 — custom

If the user picks 6, prompt:

> "What are the first-level folder names? Comma-separated or one per line (minimum 1)."

Sanitize each name (drop characters forbidden by the OS filesystem, drop empty names). If the list ends up empty, repeat. Names go into `custom_folders`.

## 3. Detect conflict with on-disk structure

Before persisting, check if `<output_folder>/` already has subfolders that look like a different granularity than the chosen one (e.g., chose `endpoint` but disk looks `module`-shaped).

If there is a conflict, warn:

> "I see specs already exist with the **[old]** structure in `<output_folder>/`. You chose **[new]** now, which differs.
>
> I'll create the new structure side-by-side; existing specs are preserved.
>
> Confirm? (y/N)"

Wait for an explicit yes. No aborts without persisting.

The detection is heuristic and best-effort. When it can't decide cleanly, **do not** show the warning (avoid false positives).

## 4. Persist (atomic write)

Update `.doc-this/config.toml`, section `[specs]`, with:

```toml
[specs]
layout = "feature-folder"
granularity = "<chosen>"
custom_folders = [<list>]   # only when granularity = "custom", else []
scout_suggestion = "<organization_suggestion.granularity from surface.json>"
decided_at = "<ISO 8601 UTC timestamp, e.g. 2026-05-04T14:32:00Z>"
```

Rules:

- **Atomic write**: write to `config.toml.tmp` in the same directory, then atomic rename to `config.toml`. A failure during write must not corrupt the existing file.
- **`scout_suggestion` is immutable**: if `[specs]` already existed with empty `granularity` and a populated `scout_suggestion`, preserve it. On first run, copy `organization_suggestion.granularity` from `surface.json`.
- **Non-destructive**: preserve any keys/sections you are not explicitly updating. Don't touch `[project]`, `[user]`, `[output]`, `[agents]`, `[engines]`, `[analysis]`, etc.
- **Don't touch `.doc-this/config.user.toml`**. That file belongs to the user.
- **IO failure** (disk full, permission denied): show a clear error, don't create spec folders, don't treat the choice as confirmed.

## 5. Continue

After successful persistence, run `references/step-04-database-context.md` to gather database ownership and schema versioning, then proceed to the Code Analyst.

## 6. Re-presenting the menu

There is no CLI flag to reconfigure. The user re-presents the menu by manually removing the `[specs]` section from `config.toml` (or emptying `granularity`). On the next run, this step detects "not decided" and runs again.

## Folder-name language

Folder names follow `doc_language` from state.json. Don't ask language here. In an `English` install, folders are in English; in `Português`, in Portuguese.

## Pre-flight checklist

- [ ] Read `[specs]` from `config.toml`, merge with `config.user.toml`
- [ ] If decided, skip this step
- [ ] If `config.user.toml` overrides exist but `config.toml` is empty, show the override warning
- [ ] Read `organization_suggestion` from `surface.json`
- [ ] Show menu with the suggestion pre-marked
- [ ] Accept Enter, 1–6, or cancel
- [ ] If option 6, collect `custom_folders`
- [ ] Detect on-disk conflict and ask for confirmation
- [ ] Atomic write to `config.toml`
- [ ] Preserve `scout_suggestion` on partial re-runs
- [ ] Run step-04, then activate the Code Analyst
