# Test health audit

This repository-local method inventories and assesses test evidence without turning heuristics into facts. Run every command explicitly from a trusted checkout:

```sh
bun scripts/test-health-audit/cli.ts --audit-root <path> <command>
```

`<path>` is the archive-safe audit directory (for example, an active plan's `audit/` directory). The utility is deliberately not a package script because `scripts/` is not shipped in the npm package.

## Commands and outputs

| Command | Output |
|---|---|
| `census` | Source declarations, reporter observations, command evidence, reconciliation findings, and a recorded `complete`, `incomplete`, or `blocked` state. |
| `prepare-units` | Deterministic assessment work units tied to the current census digest. |
| `validate` | Schema, identity, freshness, material-input, and bundle validation evidence. |
| `probe --confirm-probe <id>` | One explicitly confirmed copied-sandbox probe record, including target, import route, guardrail, containment, and restoration evidence. |
| `baseline` | Baseline condition rows and either `not established` or `eligible-for-ratification`. |

Exit zero means the requested observation or decision record was produced. An observed failing test run, an `incomplete` or `blocked` census, a calibration miss, and `not established` are valid recorded outcomes and exit zero. A non-zero exit means the tooling could not produce trustworthy evidence: examples include an unreadable audit root, invalid manifest, incompatible reporter payload, stale or missing census digest, or unproven probe containment/restoration.

## Assessment rubric

Assess each declaration independently across Execution, Grounding, Contract alignment, Fault sensitivity, Realism, Determinism, and Engineering quality. Preserve the common evidence basis on every conclusion. Grounding and Realism are independent descriptions, not rankings. A focused unit, mediated seam, shipped artifact, persisted-state test, or composition root can each be appropriate for its claim.

Objective collection records only what source syntax and public Vitest payloads establish. Unsupported or dynamic syntax, missing command evidence, source/runtime mismatches, filters, and unknown lifecycle phases remain visible limitations and can never become clean evidence. Assertion and reachability candidates are heuristic inputs for an assessing agent; collectors do not assign role, authority, chain adequacy, criticality, disposition, or portfolio sufficiency.

## Trust and consent boundary

The census and validators inspect repository content and audit artifacts. Test commands execute project-controlled code, so maintainers invoke them explicitly from a checkout they trust. Probes additionally require the exact `--confirm-probe <id>` token after reviewing the printed target, copied import route, and guardrail. No command enables a CI gate. Only a project owner can ratify an eligible baseline; agent assessment never substitutes for that final decision.

## Rerun triggers and epochs

Open a successor epoch and rerun the affected evidence after remediation, an inventory or authority change, a method/schema amendment, or an added or removed test file. Recollect runtime observations whenever runner, configuration, setup, command definitions, or test source changes. The atomic `<audit-root>/index.json` is the sole current-epoch pointer; never infer the current epoch by scanning `epochs/`. Existing epoch manifests are immutable.

A reporter-clean non-zero post-run policy exit (for example, a coverage threshold after all tests complete) is command evidence and residual uncertainty. It is not fabricated into a collection, hook, or test-body failure.
