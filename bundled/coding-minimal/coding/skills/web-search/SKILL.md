---
name: web-search
description: Search the web for current information using Claude Code CLI — library versions, changelogs, API docs, error solutions, release notes.
---

# Web Search

Search the web for current information by shelling out to Claude Code CLI, which has built-in web search capabilities. Use this when you need information that isn't in the codebase or local docs — current versions, changelogs, breaking changes, error solutions, or API documentation.

## Invocation

```bash
claude -p --dangerously-skip-permissions "your question"
```

No special keywords needed — Claude Code picks up web search automatically based on the query.

## Examples

```bash
# Library versions and release notes
claude -p --dangerously-skip-permissions "What are the new features in Bun 1.2?"

# Breaking changes and migration guides
claude -p --dangerously-skip-permissions "What breaking changes were introduced in TypeBox 0.34?"

# Current package versions
claude -p --dangerously-skip-permissions "What is the current latest version of @anthropic-ai/sdk on npm?"

# Error solutions
claude -p --dangerously-skip-permissions "Solutions for TypeScript error TS2345 with generic constraints on conditional types"

# API documentation
claude -p --dangerously-skip-permissions "Bun SQLite API — what methods are available and how do transactions work?"
```

## When to Use

- Current library versions, changelogs, or release notes
- Breaking changes and migration paths between versions
- Solutions to specific error messages or stack traces
- API documentation for external libraries
- Best practices or patterns you're unsure about
- Any question where the answer may have changed since your training data

## Tips

- Be specific. "Research: TypeBox 0.34 breaking changes" gets better results than "Research: TypeBox changes."
- Claude Code returns synthesized answers with source URLs — check the sources if you need to verify details.
- For deep dives into a specific open-source repo's internals, prefer the `deepwiki` skill instead.
