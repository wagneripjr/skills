# Build an Agent-Safe File Generation CLI

## Problem Description

Your team is building an internal platform where AI agents autonomously generate project artifacts — reports, README files, configuration templates, and summaries — on behalf of users. The agents construct CLI invocations dynamically, sometimes using resource names and filenames derived from upstream data sources (web scrapes, user-submitted fields, API responses). Because these inputs are untrusted and may contain injection attempts or malformed values, the CLI tool they drive must be hardened against adversarial input.

You have been asked to implement `filegen`, a command-line tool that generates text files from a small set of embedded templates. The tool will be invoked exclusively by AI agents, so it must be built with the security and machine-readability requirements that make a CLI safe for autonomous use. Specifically, the tool must validate and sanitize inputs appropriate for an agentic context, and it must expose its own schema in a machine-readable format so agents can discover its capabilities at runtime without relying on human-readable help text.

## Commands to Implement

- `filegen create --name <resource-name> --template <template-name> [--output <filename>]` — generate a file for the named resource using the specified template; write the output to `./generated/<filename>` (default filename: `<resource-name>.<template-name>.txt`)
- `filegen list` — list available templates with a brief description of each
- `filegen delete --name <resource-name>` — delete a previously generated file for the named resource

Templates are simple text strings embedded directly in the tool. Include at least four hardcoded templates: `report`, `readme`, `config`, and `summary`.

Generated files are saved in a `./generated/` subdirectory (create it if it does not exist).

The tool will be used by AI agents that may pass inputs constructed from untrusted upstream data. Implement the tool with appropriate input validation and security hardening for this use case. Add `--help-json` support to each command so agents can discover the command schema at runtime.

## Output Specification

Produce the following files:

1. **`filegen.py`** (or an equivalent entry point) — the complete, runnable CLI implementation. It must be executable with `python filegen.py <command> ...` (no install step required).

2. **`hardening-demo.txt`** — a transcript of test runs demonstrating the security hardening. Include:
   - At least one successful `create` invocation
   - Multiple invocations that are rejected due to invalid input (cover different categories of invalid input)
   - The output of `filegen list`
   - An invalid `--template` value that triggers an error listing all valid template names

3. **`help-schema.json`** — the raw JSON output from running `filegen create --help-json`. Save this file so the schema can be inspected.

4. **`evaluation-report.json`** — your assessment of the tool against the 7-axis Agent-DX CLI rubric (0–3 per axis, 0–21 total). Include the axis name, score, and rationale for each of the 7 axes, plus the total.

Do not leave large temporary files in the working directory. The `./generated/` subdirectory may contain a small number of generated text files.
