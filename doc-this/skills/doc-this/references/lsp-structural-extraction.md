# LSP-Powered Structural Extraction

Doc-this agents use LSP language servers for deterministic cross-file analysis when available. LSP resolves namespaces, follows project references, and traces call chains at compiler quality — the same data Visual Studio code maps and JetBrains architectural diagrams use.

## Prerequisites

- `ENABLE_LSP_TOOL=1` in Claude Code settings.json `env` block
- LSP is a deferred tool — run `ToolSearch("select:LSP")` before the first LSP call
- A language server binary on PATH for the project's primary language:

| Language | Server | Install |
|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` | `npm i -g typescript-language-server typescript` |
| Python | `pyright-langserver` | `npm i -g pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |
| C# | `csharp-ls` | `dotnet tool install -g csharp-ls` |
| Java | `jdtls` | distribution package, or the Eclipse JDT.LS release archive |
| PHP | `intelephense` | `npm i -g intelephense` |
| Ruby | `solargraph` | `gem install solargraph` |

Missing server → the fallback chain below applies; nothing halts.

## Fallback chain

```
LSP available? → Yes → Use LSP (compiler-quality, deterministic)
       ↓ No
UA graph exists? → Yes → Use UA hints with hint-verify-cite (tree-sitter quality)
       ↓ No
Pure LLM reading (current behavior, unchanged)
```

Record which source was used in `state.json.structural_extraction.preferred_source`: `"lsp"`, `"ua"`, or `"llm"`.

## LSP operations mapped to agent needs

### Scout — surface enumeration

| Need | Operation | Notes |
|------|-----------|-------|
| All top-level symbols in project | `workspaceSymbol("")` | Returns classes, interfaces, modules, enums across all files. Broad query gives full picture. |
| Symbols in a specific file | `documentSymbol(filePath)` | Complete symbol tree for one file — functions, classes, fields, constants. |

Scout uses `workspaceSymbol` to build a deterministic component inventory. Cross-reference with file-system walk for non-code files (configs, Dockerfiles, CI) that LSP ignores.

### Code Analyst — per-module deep analysis

| Need | Operation | Budget | Notes |
|------|-----------|:------:|-------|
| Function/class inventory with line ranges | `documentSymbol(filePath)` | unlimited | Exact line ranges. Each symbol becomes a 🟢 citation directly (`file:line`). |
| Type signatures, parameter types, return types | `hover(filePath, line, col)` | 60 | For data dictionary. Hover on symbol name returns full type info. |
| Cross-module dependencies (what does this call?) | `outgoingCalls(filePath, line, col)` | 15 | **Entry-point functions only** (max 3-5 per module). Feed into `modules.json` dependency fields. |
| Resolve type definitions | `goToDefinition(filePath, line, col)` | 15 | Only when `hover` is insufficient for type resolution. |

**Not used by the Code Analyst**: `incomingCalls` (Detective's job), `findReferences` (Detective's job), `goToImplementation` (Architect's job). The budget hook enforces this — these operations have near-zero limits for the Code Analyst.

**Workflow**: For each file in the module, run `documentSymbol` → get full symbol tree → run `hover` on public symbols for type info → run `outgoingCalls` only on 3-5 module entry points → read only the business-logic code sections for contextual understanding. The structural skeleton is 100% accurate from LSP; the LLM enriches with business meaning.

**LSP-sourced symbols are 🟢 by definition**: the `file:line` from `documentSymbol`'s range IS the citation. No separate verification step needed.

### Detective — API classification and rule tracing

| Need | Operation | Notes |
|------|-----------|-------|
| Deterministic call graph for API classification | `incomingCalls` on each endpoint handler | Public = called from outside the project boundary; private = called only from within. Replaces heuristic guessing. |
| Which endpoints are auth-protected | `findReferences` on auth decorators/middleware | Every reference = an endpoint using that auth. Feeds permissions matrix. |
| Interface implementations | `goToImplementation(filePath, line, col)` | Find all concrete implementations of an interface. Feeds state machine discovery. |
| All usages of a business rule | `findReferences(filePath, line, col)` | Trace where a validation/rule is enforced across the codebase. |

**Key for C#**: `incomingCalls` on a controller action method reveals exactly which clients call it. With `csharp-ls`, this resolves across `.csproj` project references — the import graph that UA's tree-sitter scripts cannot build for namespace-based languages.

### Architect — spec-impact-matrix and C4 boundaries

| Need | Operation | Notes |
|------|-----------|-------|
| Spec-impact-matrix rows | `outgoingCalls` per component, `incomingCalls` per component | Each row cites the call site. Deterministic transitive-dependency map. |
| C4 Component boundaries | `goToImplementation` on key interfaces | Shows how code is actually wired, not how folders suggest. |
| ERD entity list | `workspaceSymbol` filtered by entity/model naming | Complete entity inventory. `hover` on properties → field types. |
| Cross-layer dependencies | `findReferences` on shared types | Which layers reference which types. |

## Language-specific notes

### C# (.NET)

- **Language server**: `csharp-ls` (install: `dotnet tool install --global csharp-ls`)
- **Namespace resolution**: LSP resolves `using` statements to actual files through the Roslyn compilation model. This is the critical capability that tree-sitter-based import parsers lack.
- **Project references**: `<ProjectReference>` in `.csproj` is followed automatically. Multi-project solutions work correctly.
- **Generated code**: EF migrations, gRPC stubs, and Swagger clients are indexed by LSP but can be filtered by path pattern.
- **Partial classes**: LSP aggregates symbols from all partial definitions — `documentSymbol` returns the complete picture.

### TypeScript / JavaScript

- **Language server**: `typescript-language-server` (install: `npm install -g typescript-language-server typescript`)
- **Module resolution**: Follows `tsconfig.json` paths, barrel imports (`index.ts` re-exports), and `node_modules`.
- **Monorepos**: Works within the scope of a single `tsconfig.json`. For monorepos with multiple configs, run per-package.

### Python

- **Language server**: `pyright` (install: `brew install pyright`)
- **Import resolution**: Resolves relative and absolute imports, `__init__.py` packages, virtual environments.

### Go

- **Language server**: `gopls` (install: `go install golang.org/x/tools/gopls@latest`)
- **Package resolution**: Follows `go.mod` module paths. Cross-module calls resolve correctly.

### Rust

- **Language server**: `rust-analyzer` (install: `rustup component add rust-analyzer`)
- **Crate resolution**: Follows `Cargo.toml` dependencies. Workspace members indexed together.

## Context-window discipline

LSP results are compact symbol lists (name + kind + line range), much smaller than raw code. Rules:

1. **Scout**: `workspaceSymbol("")` may return thousands of symbols on large projects. Filter by `SymbolKind` (keep only Class, Interface, Module, Enum, Function) and by file path (exclude test files, generated code, vendor).
2. **Code Analyst**: Run `documentSymbol` per-file, not on the whole project at once. Process one module at a time.
3. **Detective/Architect**: Run `incomingCalls`/`outgoingCalls` selectively on key symbols (endpoints, public APIs), not on every function.
4. **Cache reuse**: Scout's `workspaceSymbol` results should be saved to `.doc-this/context/lsp-cache/workspace-symbols.json` so the Code Analyst doesn't re-query.

## LSP call budgets

A PreToolUse hook (`hooks/doc-this-lsp-budget.mjs`) and PostToolUse hook (`hooks/doc-this-lsp-timing.mjs`) enforce per-agent call budgets and timing limits. These prevent unbounded call-graph traversal that consumed 2+ hours on medium-to-large projects.

### Budget table (per-agent, per-session, hard limits)

| Operation | Code Analyst | Detective | Architect |
|-----------|:---:|:---:|:---:|
| `documentSymbol` | unlimited | 15 | 15 |
| `hover` | 60 | 20 | 20 |
| `incomingCalls` | **5** | 40 | 40 |
| `outgoingCalls` | **15** | 10 | 40 |
| `findReferences` | **3** | 40 | 30 |
| `goToDefinition` | 15 | 10 | 10 |
| `goToImplementation` | **3** | 20 | 20 |
| `workspaceSymbol` | 2 | 2 | 5 |

Bold = intentionally low (not that agent's primary mission). Soft limits fire an advisory at ~50% of hard. Hard limits deny the call.

### Timing thresholds

- **Slow call**: > 15 seconds → PostToolUse advisory. Consider skipping further calls on that file.
- **Total wall-clock**: > 5 minutes of cumulative LSP time → PostToolUse warning to switch to LLM-only.

### Degradation protocol

When a hard limit fires or a slow-call warning appears:

1. **Do not retry** the denied call.
2. **Read the file with Read — mandatory, not optional.** A denied or unavailable LSP call never reduces file coverage: LSP accelerates structural extraction, it is not a precondition for reading. Read the source directly and trace manually. This applies in full to file types LSP never served (markup, SQL) — they were always going to be Read, never LSP-queried.
3. **Record a gap ONLY for what reading cannot provide.** The sole legitimate LSP-degradation gap is a fact that requires cross-file resolution a reader cannot reconstruct by hand at acceptable cost — e.g., the complete cross-project caller set of a method in a 40-project solution. The contents, control flow, validators, and behavior of any single file are obtainable by reading it, so they are never an LSP-degradation gap. "Could not run documentSymbol" is not a gap; "this file is unread" is a Total-Source-Coverage violation (see the describe-only pact).
4. **Prioritize remaining LSP budget** on cross-file call-graph questions (public API callers, module entry points) — single-file structure is fully recoverable by reading. Budget exhaustion changes HOW you learn a file's structure (Read instead of LSP), never WHETHER you cover it.

### Tracker file

Per-session state at `/tmp/.claude-doc-this-lsp-${CLAUDE_SESSION_ID}.json`. Auto-cleaned on session exit.

```json
{
  "calls": {
    "code_analyst": { "documentSymbol": 12, "hover": 8, "outgoingCalls": 3 },
    "detective": {},
    "architect": {}
  },
  "total_calls": 23,
  "total_time_ms": 45000,
  "slow_calls": []
}
```

### Bypass

Same as all doc-this hooks: `touch /tmp/.claude-doc-this-bypass-${CLAUDE_SESSION_ID}` in a prior turn.

## What NOT to do

- Never use LSP `summary` or `detail` text as spec content — those are IDE tooltips, not business documentation
- Never cite an LSP operation as the evidence source (wrong: "per LSP incomingCalls"). Cite the file:line that LSP pointed to (right: `OrderService.cs:42`)
- Never run LSP operations on files outside the project (e.g., NuGet cache, node_modules internals)
- Never treat LSP unavailability (timeout, unsupported file type, exhausted budget) as permission to skip a file — coverage is governed by the file manifest and the Code Analyst's routing table, not by LSP support. The observed legacy-WebForms incident (hundreds of unread markup files recorded as 🔴 gaps after csharp-ls timed out) is exactly this failure.
- Never assume LSP is available — always check `state.json.structural_extraction.lsp_available` and fall back gracefully
