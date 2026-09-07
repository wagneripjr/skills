# Rebuild the `dockhand` setup command so it stops embarrassing us

I run the platform team at Marrowfield Logistics. `dockhand` is our internal freight-routing
tool. The `dockhand init` command collects a first-time setup — workspace name, default
environment, region, and an API token — and writes them to a config file so the other
subcommands can find them.

The current version was written in an afternoon two years ago and every one of the complaints
below is a real ticket someone filed. I need a replacement written from scratch.

## What people keep filing tickets about

1. **It hangs forever in CI.** We run `dockhand init` in our build pipeline, where nobody is at
   a keyboard. It sits there until the 60-minute job timeout kills it. The pipeline has all four
   values available to it — it just has no way to hand them over.

2. **"Production vanished from the list."** Deploying to production needs an approval id issued
   by the compliance team. When an org doesn't have one, the current tool simply leaves
   `production` out of the environment list. This is the single most common support ticket we
   get: people think the tool is broken or that they're looking at the wrong workspace. Two of
   them re-installed it. Nobody who filed one of these tickets ever worked out on their own that
   an approval id was the thing they were missing.

3. **The token leaked into shell history.** People were passing the token as a flag value on
   the command line. It ended up in `~/.zsh_history` and was visible in `ps` output on a shared
   jump box. Security has told us that has to stop, but CI still needs a way to supply it.

4. **Home directory clutter.** It writes to `~/.dockhand/`. Three separate people have asked us
   to put the config where this platform's conventions say a tool's config belongs, and to
   support the override those conventions define.

5. **It silently clobbered a working config.** Someone re-ran `init` to check something and lost
   a config they'd spent an afternoon getting right. There was no warning.

## Constraints

- Python 3 standard library only, or Node.js builtins only. No pip, no npm, no network.
- One entry file, runnable directly with no install step (`python3 dockhand.py init ...` or
  `node dockhand.mjs init ...`).
- Environments are `development`, `staging`, `production`. Regions are `eu-west`, `us-east`,
  `ap-south`. Treat an org as having no production approval id unless one is supplied.

## Output Specification

Write these four files into the working directory:

1. **`dockhand.py`** (or `dockhand.mjs`) — the complete, runnable tool.

2. **`transcript-interactive.txt`** — what an engineer sees at the terminal, from the first
   keystroke to the final line, for a session where they pick each value by hand. It must
   include the case from complaint 2: an engineer on an org with no approval id who wants
   production.

3. **`transcript-ci.txt`** — real captured output from running the tool with stdin **not** a
   terminal (pipe something into it, or redirect from `/dev/null`). Include the exact command
   line, the full output, and the exit code for each of: one run that completes successfully
   without any human input, and at least two runs that are refused. Nothing in this file may be
   hand-written — run the commands and paste what came back.

4. **`config-location.txt`** — the exact filesystem path the config was written to, and the
   contents of that file.
