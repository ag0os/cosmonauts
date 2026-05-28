---
title: External skills management UX
status: active
createdAt: '2026-05-28T00:00:00.000Z'
updatedAt: '2026-05-28T00:00:00.000Z'
---

## Summary

Redesigns the user-facing model for managing Cosmonauts skills across external agent harnesses (Claude Code, Codex, Gemini CLI, Antigravity). Replaces the current `cosmonauts skills export` flow — which copies internal agent skills verbatim and confuses callers — with a clearer two-track UX: a friendly `install` path for the curated external Cosmonauts bundle (and any other shipped external bundles), and an explicit, advanced `export-internal` path for the rare cases where a single internal skill is genuinely useful outside.

Three of the four target harnesses (Codex CLI, Gemini CLI, Antigravity CLI/IDE) share `.agents/skills/`; only Claude Code remains on its harness-specific `.claude/skills/`. The spec adopts `.agents/skills/` as the canonical path for the three standards-aligned targets, introduces a `standard` target as a first-class alias, and retires today's incorrect `~/.codex/skills/` personal path (which Codex CLI does not actually read from). An operator covers all four harnesses with `-t all`, which writes the unique `standard` and `claude-code` destinations; if Claude Code adopts the standard upstream, that collapses to one physical destination without changing the user-facing surface.

This plan is spec-ready and awaits planner design. No implementation strategy, file layout, or test plan is prescribed here — see `spec.md` for the behavior contract.

## Scope

Product-side scope:

- Vocabulary and taxonomy for internal skills, external bundles, adapted skills, harness targets, and install scope.
- CLI surface for listing, installing, and (rarely) exporting skills to external harnesses.
- Target harness path table for Claude Code, Codex, Gemini CLI, and Antigravity at project and user scope.
- How external bundles are sourced from the repository and how adapted variants relate to their internal twins.
- Default behavior, guardrails, and error messaging that prevent the "I ran `skills export` and got useless internal skills" failure mode that exists today.
- Drift-prevention requirements between internal Drive (and similar) knowledge and any externally adapted variant.

Out of scope for this plan:

- Concrete file structure under `external-skills/`, registry/index format, internal `lib/skills/` API shape, or test framework choices — planner decides.
- Backwards-compatibility shims for the current `cosmonauts skills export` command; we may rename or remove flags freely.
- Skills consumed by Cosmonauts' own internal agents at runtime (the `domains/*/skills/` resolution path) beyond marking which skills are internal-only.
- Auto-install at `npm install` time or background sync; everything is explicit operator action in this version.
