# Build a Task Manager CLI for AI Agent Pipelines

## Problem / Feature Description

Your team runs automated deployment pipelines driven by AI agents. Each pipeline stage needs to track work items — things like "provision database", "run smoke tests", "notify Slack" — as tasks that the agent creates, progresses, and removes over the course of a run. Until now, the agents have been writing to ad-hoc text files, which breaks down when two pipeline stages try to update the same file or when a downstream agent needs to query task state reliably.

You have been asked to build a small command-line tool called `tasks` that stores tasks in a local `tasks.json` file. The tool will be invoked exclusively by agents and automation scripts — it must never hang waiting for human input, its output must be reliably parseable, and it must be safe to call in parallel or in retry loops without corrupting state.

## Output Specification

Build the `tasks` CLI (Python or Node.js — your choice) with at minimum these operations:

- `tasks list` — list all tasks
- `tasks add --title "..." --priority high|medium|low` — create a new task
- `tasks done --id <id>` — mark a task as completed
- `tasks delete --id <id>` — delete a task

Write a `README.md` briefly describing how to use the tool.

After implementing the CLI, demonstrate that it works by running a realistic sequence of commands (add a few tasks, list them, mark one done, delete one) and saving the complete terminal output — including the exact commands you ran — to `demo-output.txt`. Run each command with its output going to stdout so the demonstration captures real command results.
