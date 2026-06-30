---
title: Extract the coding domain to its own installable repo (domains S2)
status: active
createdAt: '2026-06-25T00:00:00.000Z'
updatedAt: '2026-06-26T14:38:35.000Z'
---

## Summary

Externalize the `coding` domain from the framework repo into its own
independently-developed, install-on-demand package — the first real consumer of
the domain-extraction vision. The framework npm tarball ships only framework +
`shared` + `main`; `coding` installs from the catalog/git, and this repo
dev-loops it via `--link`. Builds directly on the now-portable `coding` package
produced by the archived `domain-authoring` plan (single-domain root, framework
prompts separated, framework/domain boundary established).

This plan is **spec-ready and awaits planner design.** It is **Wave 2** of the
`S2 — Extract coding` slice of `missions/architecture/domains.md`.

**Depends on: `coding-agnostic-framework` (Wave 1) — must be merged and green
first. ✅ SATISFIED 2026-06-29** (Wave 1 archived; merged to local `main` at
`fcb801c`, not yet pushed; suite green, QM + independent codex review clean).
Wave 1 removes the framework's hardcoded `coding` defaults and decouples
the test suite's framework-internal dependence on bundled `coding` (test Buckets C
and B), while `coding` stays bundled. This plan does the irreversible move on top
of that.

## Scope

Product-side scope: the irreversible cutover — physically separate `coding` into
its own repo and make it installable, without regressing this repo's own
development (which dogfoods `coding`). Includes the physical move, the import
rewrite, making the catalog resolve a git-URL source (a framework-code change, not
a data flip), removing `bundled/` and auditing its dev-mode coupling, the `--link`
dogfood loop, and moving the Bucket A coding-content tests with the domain.

Not here (already done in Wave 1): decoupling the hardcoded `coding` defaults and
the test Buckets C/B. Out of the whole slice: domain routing (S4), the
customization override-layer (S3), the declarative-format migration (S5), domain
composition/inheritance, and authoring new domain content. Distribution model is
decided: **install-on-demand** (the framework does not bundle `coding`).
