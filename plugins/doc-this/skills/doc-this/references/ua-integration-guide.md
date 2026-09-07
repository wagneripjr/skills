# Understand-Anything Integration Guide

When the third-party Understand-Anything (UA) plugin has been run on the project, doc-this agents can read its knowledge graph as a **fallback** structural source. This is Layer 3 in the extraction priority:

```
LSP (compiler-quality) → UA hints (tree-sitter quality) → pure LLM reading
```

Use UA only when LSP is unavailable for the project's language.

## Detection

Check for `.understand-anything/knowledge-graph.json` at the project root. If found:

1. Read `project.analyzedAt` and `project.gitCommitHash` from the graph
2. Compare `gitCommitHash` with current `git rev-parse HEAD`
3. Record in `state.json.structural_extraction`:
   ```json
   {
     "ua_detected": true,
     "ua_graph_path": ".understand-anything/knowledge-graph.json",
     "ua_commit_hash": "abc1234",
     "ua_staleness": false
   }
   ```
4. If `gitCommitHash` differs from HEAD: set `ua_staleness: true` and warn the user

When UA is not detected, set `ua_detected: false` and proceed normally.

## What doc-this reads from UA

| UA File | What Agents Read | Used By |
|---------|-----------------|---------|
| `knowledge-graph.json` → `nodes[]` of type `file`, `function`, `class` | Function/class names, file paths, line ranges | Code Analyst (structural skeleton) |
| `knowledge-graph.json` → `edges[]` of type `imports`, `calls`, `depends_on` | Cross-file dependencies | Architect (spec-impact-matrix), Detective (API classification) |
| `.understand-anything/intermediate/scan-result.json` → `files[]` | File inventory, language counts | Scout (enumeration cross-check) |
| `.understand-anything/intermediate/scan-result.json` → `importMap` | Per-file import lists | Code Analyst (module dependencies) |
| `.understand-anything/intermediate/layers.json` | Architecture layers with node assignments | Architect (C4 boundary hypothesis) |
| `.understand-anything/domain-graph.json` → `domainMeta.businessRules` | Uncited business rule hints | Detective (leads to investigate) |

## The hint-verify-cite pattern

Every UA-sourced claim goes through three steps:

### Step 1 — Hint

Read a UA claim. Example: "function `Login` at `AuthService.cs` lines 12-45 with params `email`, `password`".

### Step 2 — Verify

Read the actual source file at the stated location. Three outcomes:

- **Match**: Source confirms the claim exactly
- **Partial match**: Source confirms part (e.g., function exists but at different line range)
- **No match**: Source contradicts or does not contain the claim

### Step 3 — Cite

- **Match** → 🟢 `AuthService.cs:12` (doc-this citation, NOT a reference to UA)
- **Partial match** → 🟢 with the corrected citation. Log the discrepancy as a staleness note.
- **No match** → Drop the claim silently. Do NOT create a 🔴 GAP for it — the gap is in UA's data, not in the legacy system. The agent's own analysis will catch any real gaps independently.

## Confidence mapping

| UA Data | Validation Method | Confidence |
|---------|-------------------|------------|
| `files[].path` | `test -f <path>` | 🟢 if file exists |
| `files[].language` | Cross-check with file extension | 🟢 if consistent |
| `importMap[file][]` | Read import statement at source | 🟢 with `file:line` cite |
| `function:` node lineRange | Read source at lineRange | 🟢 if function found at line |
| `class:` node lineRange | Read source at lineRange | 🟢 if class found at line |
| `layers[].nodeIds` | Verify via import-graph analysis | Informational hint only |
| `domain:` node businessRules | Search for rule in code | 🟢 if cited; drop if not found |
| `calls` edges | Trace call in source | 🟢 if call found |
| `table:` nodes | Verify against schema/DDL | 🟢 if table exists |

## Staleness handling

When `ua_staleness` is true (UA was built on a different commit):

- All hints may be stale — verify everything against current code
- Line ranges are likely shifted — read broader context around the hinted location
- Files may have been added or removed — the file-existence check catches this
- The pipeline continues normally; more hints will fail verification but the fallback is safe

## Known limitations

### Namespace-based languages (C#, Java, Kotlin)

UA's `extract-import-map.mjs` resolves imports by file path. Languages that use namespace-based imports (`using System.Collections.Generic;` in C#, `import java.util.List;` in Java) produce broken import graphs — the script cannot map namespaces to files without a compilation model.

**This is the primary reason LSP takes priority over UA.** When LSP is available, the import graph is compiler-quality. When LSP is unavailable for a namespace-based language, UA's import data should be treated with extra skepticism — verify every edge.

### File-path-based languages (TypeScript, Python, Go, Rust)

UA's import resolution works well for these languages. The tree-sitter extraction and import-map scripts were designed for this pattern. UA hints are reliable.

## Context-window discipline

- **Never read the full `knowledge-graph.json`** — it can be several MB. Use grep to find nodes by `filePath` match, then read only those nodes.
- **For Scout**: read only `scan-result.json` (smaller, no node/edge data).
- **For the Code Analyst**: grep for nodes matching the current module's file paths.
- **For Detective**: grep for `domain:` nodes and `calls` edges only.
- **For Architect**: read `layers.json` (small) and grep for `imports` edges.

## What NOT to do

- Never copy UA's `summary` or `tags` text into doc-this output (those are LLM-generated interpretations, not cited facts)
- Never reference `.understand-anything/` paths in any spec file as citations
- Never reference UA node IDs (e.g., `function:src/auth/login.ts:login`) as evidence
- Never create 🔴 GAPs for claims that UA made but source doesn't support (that's UA's problem, not a system gap)
- Never require UA as a prerequisite — doc-this works without it
