---
name: deepwiki
description: Query DeepWiki for deep knowledge about open-source GitHub repositories — architecture, internals, undocumented behavior. Uses Claude Code CLI.
---

# DeepWiki

DeepWiki provides AI-generated documentation and deep knowledge about open-source GitHub repositories. Access it by shelling out to Claude Code CLI, which has the DeepWiki MCP server configured.

Use this when you need to understand how a dependency works, its internal architecture, or behavior that isn't covered in official docs.

## Invocation

All calls go through Claude Code in print mode:

```bash
claude -p --dangerously-skip-permissions "your query"
```

## Tools

DeepWiki exposes three MCP tools to Claude Code. When writing your query, reference the tool by name so Claude Code uses the right one.

### ask_question

The primary tool. Ask a natural-language question about a repo and get a grounded, detailed answer.

**Parameters:** `repoName` (string or string[], max 10), `question` (string)

```bash
# How does a library handle something internally?
claude -p --dangerously-skip-permissions "Use mcp__deepwiki__ask_question for repo 'vitest-dev/vitest' with question 'How does the snapshot testing system work internally?'"

# Compare across repos
claude -p --dangerously-skip-permissions "Use mcp__deepwiki__ask_question for repos ['vitest-dev/vitest', 'jestjs/jest'] with question 'How do these test runners handle module mocking differently?'"
```

This is the most useful tool. It returns focused, context-grounded answers. Use it for:
- Understanding internal architecture of a dependency
- Finding undocumented behavior or edge cases
- Learning how a specific feature is implemented
- Comparing approaches across repositories

### read_wiki_structure

Get the table of contents for a repo's wiki. Use this to discover what topics are documented before diving deeper.

**Parameters:** `repoName` (string)

```bash
claude -p --dangerously-skip-permissions "Use mcp__deepwiki__read_wiki_structure for repo 'sinclairzx81/typebox'"
```

Returns a numbered outline like:

```
- 1 Overview
- 2 Core Architecture
  - 2.1 Type System
  - 2.2 Schema Compilation
- 3 Advanced Features
  ...
```

Use this when you want to know what's available before asking specific questions.

### read_wiki_contents

Dumps the entire wiki content for a repo. Returns a very large result (can be 500k+ characters).

**Parameters:** `repoName` (string)

```bash
claude -p --dangerously-skip-permissions "Use mcp__deepwiki__read_wiki_contents for repo 'sinclairzx81/typebox'"
```

**Avoid this tool in most cases.** It returns everything at once with no page filtering. Prefer `ask_question` for targeted answers or `read_wiki_structure` + `ask_question` for a browse-then-ask workflow.

## Workflow

The typical pattern:

1. **Browse** — use `read_wiki_structure` to see what topics exist for the repo.
2. **Ask** — use `ask_question` with a specific question about the topic you need.

For quick lookups, skip straight to `ask_question`.

## Limitations

- Only works for **public GitHub repositories** that have been indexed by DeepWiki.
- If a repo isn't indexed yet, you'll get an error with a URL to visit to trigger indexing.
- The wiki content is AI-generated from the repo's source code — it's generally accurate but not infallible.
- `read_wiki_contents` returns the entire wiki with no way to request a single page.
