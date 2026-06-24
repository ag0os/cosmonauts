# UX Review: round 2

## Overall

incorrect

## Assessment

The root-domain scaffold/docs remediation is visible and the new live binding command generally gives usage, success, and unavailable-target feedback. Two user-facing validation paths still leave authors with silent or under-specified failures: malformed top-level `domainBindings` values are ignored without warning, and invalid package domain paths collapse to `domains: invalid-path` without saying what path shape to use.

## Prior Findings

- UX-001: resolved. `lib/packages/installer.ts:258-273` now adds corrective actions for both root-domain package install failures: `path: "."` with additional domains tells authors to move domains into subdirectories or keep `path: "."` as the only entry, and missing root `domain.ts` tells authors to add `domain.ts` at the package root or change `cosmonauts.json` to point at the domain directory.
- UX-002: resolved. `docs/domains.md:77-105` uses external package imports from `cosmonauts/lib/...`, and the scaffold output now matches the root package layout at `cli/create/subcommand.ts:108-115` (`name/domain.ts`, `name/agents/`, etc.) rather than repo-relative nested domain paths.

## Findings

- id: UX-003
  priority: P2
  severity: medium
  confidence: 0.86
  complexity: simple
  dimensions: confusing-states, feedback
  location: lib/config/loader.ts:86-101, docs/domains.md:190-191
  summary: |
    The config loader warns for malformed entries inside an object-shaped `domainBindings` value, but if the user sets `domainBindings` itself to a wrong shape such as an array or string, the condition at `lib/config/loader.ts:86-90` simply skips it. From the user's seat, the binding silently does not apply, even though the docs say binding target problems and malformed entries should be surfaced so the user can fix configuration.
  suggestedFix: Warn when `domainBindings` is present but is not an object map, using the same corrective wording as entry-level warnings.

- id: UX-004
  priority: P2
  severity: low
  confidence: 0.9
  complexity: simple
  dimensions: confusing-states
  location: lib/packages/manifest.ts:144-145, lib/packages/installer.ts:240-245
  summary: |
    Invalid domain paths in `cosmonauts.json` are reduced to the install error `Invalid cosmonauts.json ...: domains: invalid-path`. Unlike the new root-domain install errors, this gives no corrective action and does not say that paths must be relative package-internal paths, with `.` only allowed for the package root. A package author using an absolute path or `../domain` has to infer the contract from the terse reason code.
  suggestedFix: Expand `invalid-path` manifest validation output into a user-facing message that names the allowed path shapes and the offending domain/path where possible.
