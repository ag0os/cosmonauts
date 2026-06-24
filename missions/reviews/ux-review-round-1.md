# UX Review: round 1

Overall: incorrect

## Assessment

The user-facing domain authoring surfaces are mostly present, but two changed areas still leave domain authors without actionable guidance: the new install-time validation errors state what is invalid without saying how to fix it, and the new authoring guide uses repo-relative imports that do not match the generated external package scaffold.

## Findings

- id: UX-001
  priority: P2
  severity: medium
  confidence: 0.9
  complexity: simple
  dimensions: ux|documentation
  location: lib/packages/installer.ts:254-270
  summary: |
    When a user installs a root-domain package with `path: "."`, the new validation errors only say either that root-domain packages cannot declare additional domains or that root `domain.ts` is missing. They do not name the corrective action at the failure point, even though this is the install-time message the package author sees before any docs context. This makes the root-layout migration harder to recover from than the docs promise.
  suggestedFix: Add the fix to each thrown message, e.g. add `domain.ts` at the package root or change `cosmonauts.json` to point at the domain directory; for mixed root packages, move each domain into its own subdirectory or keep `path: "."` as the only domain entry.

- id: UX-002
  priority: P2
  severity: medium
  confidence: 0.85
  complexity: simple
  dimensions: documentation|correctness
  location: docs/domains.md:77-105
  summary: |
    The new domain authoring guide shows `domain.ts` and agent examples importing types from `../../lib/...`. A user creating the documented root-domain package layout (`alpha/domain.ts`, `alpha/agents/coach.ts`) will not have the Cosmonauts repo's `lib/` directory two levels up, and the generated scaffold uses the package import form instead. The guide therefore gives external domain authors examples that are inconsistent with the scaffold and likely fail when copied into a package.
  suggestedFix: Use import paths that work for authored packages and align with the scaffold, or explicitly label repo-internal examples separately from external package examples.
