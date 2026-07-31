# Analysis Capabilities

Cosmonauts exposes code analysis through a stable, provider-neutral contract.
In v1, a project selects or auto-detects one provider for the session. That
provider may bind each capability, leave it visibly unbound, or fail during
discovery. Changing the provider does not change capability or tool names.
Provider identity and version appear only in runtime status and results.

## Canonical capability vocabulary

| Capability | Classification | Contract |
|---|---|---|
| `dead-code` | gate-facing | Find unreachable files, exports, types, or dependencies. |
| `duplication` | gate-facing | Find structurally duplicated code. |
| `complexity` | gate-facing | Find units that violate a requested supported complexity metric. |
| `boundary-conformance` | gate-facing | Find dependencies that violate configured architectural boundaries. |
| `changed-scope-audit` | operational | Audit changes from an explicit base without widening to the whole project. |
| `trace` | operational | Trace a symbol, file, dependency, or duplicate location through available evidence. |
| `fix-preview` | operational | Return proposed changes without applying them. |

The four gate-facing names are exactly the corresponding gate kinds in the
[gate contract vocabulary](../domains/shared/skills/work-artifacts/references/gate-contracts.md).
The operational names describe requests and do not create aliases for
`correctness`, `artifact-conformance`, or `mutation`.

## Public runtime surface

The stable TypeScript boundary is
[`lib/analysis/index.ts`](../lib/analysis/index.ts). It exports the capability
vocabulary, requests, bindings, results, failures, and the pure binding
resolver. Provider discovery, process execution, and result normalization stay
outside that boundary.

Pi registers one status tool and one tool per capability:

| Tool | Contract |
|---|---|
| `analysis_status` | Return all seven binding rows. |
| `analysis_dead_code` | Request `dead-code` for project or path scope. |
| `analysis_duplication` | Request `duplication` for project or path scope when advertised. |
| `analysis_complexity` | Request one advertised `complexity` metric. |
| `analysis_boundaries` | Request `boundary-conformance` for project or path scope when configured and advertised. |
| `analysis_audit` | Request `changed-scope-audit` from an explicit base. |
| `analysis_trace` | Request `trace` for exactly one target. |
| `analysis_fix_preview` | Request non-mutating `fix-preview`. |

Tool registration is immediate. Provider discovery runs once per session and
working directory at the first status need, which includes agent-start status
injection, and the same snapshot is shared by tool calls. The snapshot is
cleared at session start and shutdown.

## Scope and requests

Requests are discriminated by capability. Project and path scopes are
available only when a binding advertises them. A path scope contains at least
one trimmed project-relative path. Changed-scope audit requires a non-empty
`base`. Trace requires exactly one target kind: symbol, file, dependency, or
duplicate location. A symbol's project-relative `path` and a duplicate
location's positive `line` are optional provider-neutral identity fields;
providers advertise whether each is optional or required. Complexity alone
requires a metric. Fix preview has no apply option.

Bindings advertise supported scope kinds, complexity metrics, and trace target
requirements. Unsupported scopes, metrics, target kinds, or missing
provider-required target identity return a structured unsupported result before
provider execution; they are never widened, misreported as provider invalid
output, or represented as an empty clean result.

Every provider invocation is shell-free, bounded by a finite timeout, and
non-mutating. Cancellation reaches the provider process and is reported as an
aborted failure. Fix preview has no apply input.

## Discovery and bindings

Project configuration may set one non-empty provider preference at
`analysis.provider`; otherwise the runtime auto-detects. An explicitly selected
provider that is unavailable does not fall back silently. The status block and
`analysis_status` always return one row for every capability.

Executing a project-resolved provider requires per-project consent recorded
outside the repository. Before consent, signal discovery is file-read-only and
detectable capabilities report `execution-not-consented`; no provider process
is spawned.

The provider preference belongs in `.cosmonauts/config.json`:

```json
{
  "analysis": {
    "provider": "<provider-id>"
  }
}
```

Execution consent belongs in
`~/.cosmonauts/analysis-execution-consent.json`, keyed by the project's
canonical absolute path:

```json
{
  "schemaVersion": 1,
  "projects": {
    "/absolute/project/path": {
      "providers": ["<provider-id>"]
    }
  }
}
```

Repository configuration cannot grant execution consent to itself. Missing,
malformed, repository-contained, or non-matching consent leaves execution
withheld.

For Fallow, the boundary-configuration signal used by declared coverage is
bound to the canonical configuration inputs observed during introspection.
Consent, executable identity, and that configuration identity are revalidated
together in the final synchronous pre-spawn callback. A configuration change
invalidates the binding instead of reusing discovery-time coverage. Node cannot
make filesystem reads and a path-based process spawn OS-atomic, so a mutation
after that callback remains outside this guarantee.

A capability binding has one of three states:

- `bound` identifies the implementation and advertises scope kinds and metrics.
- `unbound` gives a diagnostic reason for support that is absent, unavailable,
  unconfigured, uninstalled, or awaiting execution consent.
- `failed` retains a structured discovery or introspection failure. It is
  distinct from unbound because an attempted provider failure must block a
  backed gate rather than degrade as unsupported.

Calls against an unbound binding return that structured state. Calls using an
unadvertised scope or metric return `unsupported-scope` or
`unsupported-metric`. Calls against failed bindings, invalid provider output,
timeouts, cancellation, and provider process failures throw a tool error that
names the capability, provider, failure class, and available process evidence.

## Completed results

Completed analysis results share capability, provider identity and version,
the exact echoed scope, a verdict field, and a complete provider-tagged native
envelope.

Dead code, duplication, complexity, boundary conformance, and changed-scope
audit return findings with `verdict: "pass" | "fail"`. Every such completed
verdict-bearing result declares its non-empty evaluated gate coverage using
the existing gate-facing capability vocabulary. Findings carry an adapter-local
ID, gate-aligned category, severity, message, locations, generic action
descriptions, and optional provider-tagged details.

Trace returns graph nodes, edges, and evidence. Fix preview returns proposal
descriptions and locations. These two result kinds carry
`verdict: "not-applicable"`: neither operation asserts pass or fail, and the
runtime must not fabricate one. They declare no evaluated gate coverage.

Fields that cannot be supported by two independent implementations do not
enter the generic result shape. They remain under a `{ providerId, data }`
provider-details object or in the provider-tagged native payload.

The native envelope preserves the provider ID, completed exit code, parsed
payload, and stderr without truncation. Provider exits that mean findings are
completed analysis, while crashes, invalid configuration, missing bases,
signals, timeouts, and unclassifiable output never become clean results.
