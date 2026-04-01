---
name: playwright-cli
description: Browser automation via playwright-cli — navigation, form filling, screenshots, network mocking, storage management. Token-efficient alternative to browser MCP tools.
---

# Playwright CLI

`playwright-cli` is a command-line tool for browser automation — navigation, form filling, screenshots, network interception, and more. It's designed to be token-efficient: commands return YAML snapshots with labeled element references instead of full DOM dumps.

## Prerequisites

`playwright-cli` must be installed globally on the system:

```bash
npm install -g @playwright/cli@latest
```

Check availability before using:

```bash
which playwright-cli
```

If not installed, inform the user and stop — do not install it yourself.

## Detailed Command Reference

The playwright-cli repo provides its own skill files with comprehensive command docs and examples. Install them once:

```bash
playwright-cli install --skills
```

This generates detailed documentation at `.claude/skills/playwright-cli/`:

- `SKILL.md` — full command reference (navigation, input, tabs, storage, network, DevTools)
- `references/request-mocking.md` — intercepting and mocking network requests
- `references/running-code.md` — executing arbitrary Playwright code (geolocation, permissions, media emulation, waits)
- `references/session-management.md` — managing browser sessions
- `references/storage-state.md` — cookies, localStorage, sessionStorage CRUD

**Read those files before writing commands.** They contain the complete API with examples.

## Quick Start

The basic workflow: open a page, read the snapshot to find element references, interact with elements, verify results.

```bash
# Open a page
playwright-cli open https://example.com

# Take a snapshot to see element references (e1, e2, ...)
playwright-cli snapshot

# Interact using element references from the snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli click e3

# Take a screenshot
playwright-cli screenshot

# Close the browser
playwright-cli close
```

Element references are **ephemeral** — they change after navigation or page mutations. Always take a fresh snapshot before interacting with elements.

## When to Use

- Verifying UI behavior (form submissions, navigation flows)
- Taking screenshots for visual inspection
- Testing authenticated flows (save/restore state with `state-save`/`state-load`)
- Debugging browser-based issues
- Extracting data from web pages
- Mocking network requests for testing
