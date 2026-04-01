---
name: find-docs
description: >-
  Retrieves up-to-date documentation, API references, and code examples for any
  library, framework, SDK, CLI tool, or cloud service. Use even when you think
  you know the answer -- training data may not reflect recent API changes.
---

# Documentation Lookup

Fetch current docs for any library using the Context7 CLI. Two-step process: resolve library name to an ID, then query docs.

## Step 1: Resolve Library ID

```bash
ctx7 library <name> "<specific question>"
```

Pick the best match by name similarity, snippet count, source reputation, and benchmark score. If the user mentions a version, use the version-specific ID from the output (format: `/org/project/version`).

## Step 2: Query Documentation

```bash
ctx7 docs <libraryId> "<specific question>"
```

Use the user's full question as the query — specific queries return much better results than single keywords.

## Rules

- If `ctx7` is not found, inform the user and ask if they want to install it (`npm install -g ctx7`).
- Always run `library` first to get a valid ID, unless the user provides one in `/org/project` format.
- Do not run more than 3 commands per question.
- Do not include sensitive information (API keys, passwords, credentials) in queries.
- If a command fails with a quota error, inform the user and suggest `ctx7 login`. Do not silently fall back to training data.
