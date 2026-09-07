# Create Agent Knowledge Files for deployctl

## Background

The platform team at a growing SaaS company maintains a deployment CLI called `deployctl` (version 2.1.0). They're rolling out an AI-assisted operations workflow where agents will autonomously manage service deployments — creating, scaling, rolling back, and monitoring services in staging and production. The existing README was written for human operators and is not suitable for agent consumption: it buries the quick-start deep in the document, uses imprecise examples with angle-bracket placeholders, and gives no guidance on how agents should handle errors or avoid dangerous operations.

The team wants to ship three standard documentation files alongside the `deployctl` binary itself. These files will be loaded by AI agents before they invoke any `deployctl` commands, giving them the context and behavioral rules needed to operate safely. A well-structured set of these files will let agents work autonomously without human oversight in routine cases.

Your job is to write these three files. The CLI specification is provided below — use it as your only source of truth about how `deployctl` behaves.

## CLI Specification

**deployctl** — deploy and manage services across staging and production environments.

**Commands:**

| Command | Synopsis |
|---------|----------|
| `services list` | `deployctl services list [--env staging\|production] [--json] [--fields id,name,status] [-q]` |
| `services create` | `deployctl services create --name <name> --image <image> --env <env> [--replicas 1-10] [--dry-run] [--if-not-exists] [--json] [-q]` |
| `services update` | `deployctl services update --id <id> --replicas <n> [--dry-run] [--json]` |
| `services delete` | `deployctl services delete --id <id> [--if-exists] [--dry-run] [--yes] [--json]` |
| `logs` | `deployctl logs --id <id> [--since 5m] [--limit 100] [--json]` |
| `status` | `deployctl status --id <id> [--json] [--fields status,health,replicas]` |
| `rollback` | `deployctl rollback --id <id> --to <revision> [--dry-run] [--yes] [--json]` |
| `config get/set` | `deployctl config get <key>` / `deployctl config set <key> <value>` |
| `auth` | `deployctl auth login` / `deployctl auth status [--json]` |

**Authentication:**
- Set `DEPLOYCTL_API_KEY` environment variable, or run `deployctl auth login`
- Token stored at `~/.config/deployctl/credentials`

**Error codes:**
- `AUTH_EXPIRED` — exit 4
- `RESOURCE_NOT_FOUND` — exit 3
- `RATE_LIMITED` — exit 75 (transient — safe to retry)
- `QUOTA_EXCEEDED` — exit 2
- `VALIDATION_ERROR` — exit 2
- `CONFLICT` — exit 5

**Configuration:**
- Project config: `.deployctl.yaml` in the project root (discovered by walking up the directory tree)
- User config: `~/.config/deployctl/config.yaml`

## Output Specification

Create the following three files in your working directory:

- **`CONTEXT.md`** — a comprehensive reference document for AI agents that covers commands, flags, error handling, and behavioral notes. This is the primary reference document.
- **`AGENTS.md`** — a behavioral guide with rules and patterns that agents should follow when invoking `deployctl`.
- **`llms.txt`** — a concise orientation file placed at project root for LLMs that need a quick overview before diving into the detailed documentation.

Each file will be read by an AI agent that has never used `deployctl` before. Write them to maximize agent effectiveness and safety.
