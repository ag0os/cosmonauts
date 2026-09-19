# Test health audit

This repository-local method inventories and assesses test evidence without turning heuristics into facts. Run every command explicitly from a trusted checkout:

```sh
bun scripts/test-health-audit/cli.ts --audit-root <path> <command>
```

`<path>` is the archive-safe audit directory (for example, an active plan's `audit/` directory). The utility is deliberately not a package script because `scripts/` is not shipped in the npm package.

## Commands and outputs

| Command | Output |
|---|---|
| `census` | `source-census.json`, raw reporter observations, and bundle 2 as both `suite-integrity.json` and `suite-integrity.md`, including each command's timing plus watcher-start evidence and a recorded `complete`, `incomplete`, or `blocked` state. |
| `prepare-units` | Deterministic assessment work units tied to the current census digest. |
| `carry-forward` | Judgments inherited from the predecessor epoch — deliverables, whole profile units whose material inputs all rehash unchanged, and census answers whose finding restates the identical observation. Every carried record is stamped `carriedFrom`. |
| `dispatch` | Drains the epoch's outstanding work units, one OS process per unit, measuring each process's own cost rather than accepting a reported one. |
| `assemble` | Bundle 3's `profiles/index.json`, derived from the shards, plus the current bundle-completeness report. |
| `validate` | Schema, identity, freshness, material-input, provenance, derivation, and bundle validation evidence. |
| `probe --confirm-probe <id>` | One explicitly confirmed copied-sandbox probe record, including target, import route, guardrail, containment, and restoration evidence. |
| `baseline` | Baseline condition rows and either `not established` or `eligible-for-ratification`. |

Exit zero means the requested observation or decision record was produced. An observed failing test run, an `incomplete` or `blocked` census, a calibration miss, and `not established` are valid recorded outcomes and exit zero. A non-zero exit means the tooling could not produce trustworthy evidence: examples include an unreadable audit root, invalid manifest, incompatible reporter payload, stale or missing census digest, or unproven probe containment/restoration.

## Assessment rubric

Assess each declaration independently across Execution, Grounding, Contract alignment, Fault sensitivity, Realism, Determinism, and Engineering quality. Preserve the common evidence basis on every conclusion. Grounding and Realism are independent descriptions, not rankings. A focused unit, mediated seam, shipped artifact, persisted-state test, or composition root can each be appropriate for its claim.

Objective collection records only what source syntax and public Vitest payloads establish. Unsupported or dynamic syntax, missing command evidence, source/runtime mismatches, filters, and unknown lifecycle phases remain visible limitations and can never become clean evidence. Assertion and reachability candidates are heuristic inputs for an assessing agent; collectors do not assign role, authority, chain adequacy, criticality, disposition, or portfolio sufficiency.

A carried judgment is never a retyped one. Carry-forward is the only mechanism that moves a profile or a census answer between epochs, it copies whole units rather than individual records, and it stamps each with the epoch and digest it came from. A finding id is a content hash over the finding's kind, command and detail, so an answer carries only where the successor restates the identical observation; anything else returns for assessment.

An assessing agent records answers to census findings in the current epoch's `dispositions.json`, including the finding ID, disposition, reasoning, assessor provenance, and sources the agent opened. The disposition distinguishes `repair-required-tooling` from `repair-required-suite`; `limitation-accepted` is invalid without at least one consulted source. Accounted-for findings remain visible in suite integrity while no longer leaving the census indefinitely `incomplete` or `blocked`. Conditional and unreachable AST candidates stay in the non-blocking heuristic lane at `reasoned`; they are not objective failures.

## Trust and consent boundary

The census and validators inspect repository content and audit artifacts. Test commands execute project-controlled code, so maintainers invoke them explicitly from a checkout they trust. Probes additionally require the exact `--confirm-probe <id>` token after reviewing the printed target, copied import route, and guardrail. No command enables a CI gate. Only a project owner can ratify an eligible baseline; agent assessment never substitutes for that final decision.

## Rerun triggers and epochs

Nothing under assessment may change while an epoch is being collected. A census executes the suite repeatedly over several minutes, so an edit landing mid-run is observed by some commands and not others, and the resulting evidence describes no single tree. Finish and commit every source, test, and tooling change first, then open the epoch.

Open a successor epoch and rerun the affected evidence after remediation, an inventory or authority change, a method/schema amendment, or an added or removed test file. Recollect runtime observations whenever runner, configuration, setup, command definitions, or test source changes. The atomic `<audit-root>/index.json` is the sole current-epoch pointer; never infer the current epoch by scanning `epochs/`. Existing epoch manifests are immutable.

### What a successor epoch inherits, and how an inheritance is told from evidence

`carry-forward` seeds a successor from its predecessor so the epoch is not
empty before its own evidence exists: whole profile units whose material inputs
all rehash unchanged, census answers whose finding restates the identical
observation, and the deliverable documents. Every carried record is stamped
`carriedFrom`; the documents are not, because a document has no place to carry a
stamp. They are copied and restamped with the successor's epoch id instead.

That makes an inherited document structurally indistinguishable from a rebuilt
one, and three baseline conditions read those documents. `validate` therefore
checks derivation rather than shape:

- `behavior-risk-matrix.md` and `gap-register.md` are re-joined from the current
  epoch's own inventory, profiles and probe records and compared with what the
  epoch published. Publisher and checker share one derivation, so the check
  cannot drift into a second opinion. A successor that never republished its
  portfolio fails here rather than reporting the predecessor's cells.
- Every record in `probes.jsonl` names the file it mutated and that file's
  digest at run time. If this revision's file hashes differently, or is gone,
  the measurement does not describe this revision and the record is rejected --
  whatever its outcome. A stale `probe-confirmed` would otherwise credit
  baseline condition 6 for a mutation that no longer applies, and a stale
  `probe-survived` would open a remediation row against code that is gone.
- Every material input the manifest froze is rehashed against the working tree.
  Nothing else covers them: the per-profile digests cover a profile's own
  inputs, and the census digests cover declarations and command output. Without
  this, the method document, plan, schema or runner config could move under an
  open epoch with every other check still green.

Both the portfolio derivation and the bundle-completeness report are demanded
only once the epoch has reached `baseline.md`. Before that its documents are
legitimately partial.

The immutable manifest freezes only the source-census digest available when the epoch opens. The post-run command-census digest is recorded separately with suite integrity and validated against the raw command evidence; validation never compares those unlike digests.

A reporter-clean non-zero post-run policy exit (for example, a coverage threshold after all tests complete) is command evidence and residual uncertainty. It is not fabricated into a collection, hook, or test-body failure.
