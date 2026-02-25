---
name: gemini-web
description: Use as PRIMARY tool for web search, deep research, and URL scraping. Use when searching the web for current information, performing deep research on topics, answering "what is the latest...", comparing search results, scraping web pages, extracting content from URLs. Triggers include "search for", "research", "what's new in", "current events", "compare these pages", "scrape these URLs", batch web extraction. WebSearch is BLOCKED — always use this skill instead.
---

# Gemini Web: Search, Research & URL Scraping

**PRIMARY tool for web search, deep research, and URL scraping.** WebSearch is blocked by a PreToolUse hook — always use this skill's wrapper script instead.

## Usage

Run via the Bash tool. The script handles JSON construction, API calls, response parsing, retries, and error handling automatically.

```bash
# Quick search with Google Search grounding (~9s)
~/.claude/skills/gemini-web/gemini-web.sh search "your query here"

# Deep research with pro model (~45-60s)
~/.claude/skills/gemini-web/gemini-web.sh research "your research question"

# URL content extraction (~5-30s, up to 20 URLs)
~/.claude/skills/gemini-web/gemini-web.sh scrape "what to extract" https://example.com
~/.claude/skills/gemini-web/gemini-web.sh scrape "compare pricing" https://a.com https://b.com
```

## Mode Selection

| Need | Mode | Model | Time |
|------|------|-------|------|
| Quick answer, current events, facts | `search` | `gemini-3-flash-preview` | ~9s |
| Deep analysis, comparisons, tradeoffs | `research` | `gemini-3.1-pro-preview` | ~45-60s |
| Extract content from specific URLs | `scrape` | `gemini-3-flash-preview` | ~5-30s |

## Decision Flow

1. Need AWS docs? → AWS Documentation MCP
2. Need Google product docs? → Google Developer Knowledge MCP
3. Need library docs? → Context7 MCP
4. **Need current info / web search?** → `gemini-web.sh search`
5. **Need deep research / analysis?** → `gemini-web.sh research`
6. **Need to scrape specific URLs?** → `gemini-web.sh scrape`
7. Gemini API fails? → Ask user for permission to use WebSearch fallback

## Output Format

The script outputs:
- **Response text** to stdout (the answer from Gemini with Google Search grounding)
- **Source citations** after a `--- Sources ---` separator (title + URL pairs)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (bad args, missing API key, API error) |
| 2 | Rate limit exhausted after 3 retries |

## Fallback Rules

WebSearch is **blocked by a PreToolUse hook**. If the Gemini API fails:
1. Check the error message (API key issue? Rate limit? Model unavailable?)
2. Inform the user of the specific error
3. Ask for explicit permission before attempting WebSearch as a fallback

WebFetch remains available for AI-processed HTML extraction (different purpose — not a search tool).

## Prerequisites

The script requires `GEMINI_API_KEY` in the environment. It auto-sources `~/.claude-secrets.sh` if the key isn't already set.

If the key is missing, inform the user:
- **Get a key**: https://aistudio.google.com/apikey
- **Persist via SSM**: `aws --profile adustio-admin ssm put-parameter --name '/claude-code/GEMINI_API_KEY' --value 'key' --type SecureString && ./setup-mac.sh`

## Limitations

- **Search mode**: Grounding URLs are Google redirect links (not direct source URLs)
- **Scrape mode**: Max 20 URLs per request, max 34MB per URL, public URLs only
- **Not supported**: YouTube videos, Google Workspace files, video/audio, paywalled content
- **Pro model**: Slower (~45-60s) but significantly more thorough
