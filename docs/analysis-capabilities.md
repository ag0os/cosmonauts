# Analysis Capabilities

Cosmonauts exposes code analysis as stable capabilities. A project may bind
each capability to a different implementation, leave it visibly unbound, or
report that discovery failed. Procedures use only the names below; provider
identity and version appear in runtime status and results, not in the
capability vocabulary.

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

## Scope and requests

Requests are discriminated by capability. Project and path scopes are
available only when a binding advertises them. A path scope contains at least
one trimmed project-relative path. Changed-scope audit requires a non-empty
`base`. Trace requires exactly one target kind: symbol, file, dependency, or
duplicate location. Complexity alone requires a metric. Fix preview has no
apply option.

Bindings advertise supported scope kinds and, for complexity, metrics.
Unsupported scope or metric requests are rejected before provider execution;
they are never widened and never represented as an empty clean result.

## Bindings and failures

A capability binding has one of three states:

- `bound` identifies the implementation and advertises scope kinds and metrics.
- `unbound` gives a diagnostic reason for support that is absent, unavailable,
  unconfigured, uninstalled, or awaiting execution consent.
- `failed` retains a structured discovery or introspection failure. It is
  distinct from unbound because an attempted provider failure must block a
  backed gate rather than degrade as unsupported.

## Completed results

Completed analysis results share capability, provider identity and version,
the exact echoed scope, a verdict field, and a complete provider-tagged native
envelope.

Dead code, duplication, complexity, boundary conformance, and changed-scope
audit return findings with `verdict: "pass" | "fail"`. Findings carry an
adapter-local ID, gate-aligned category, severity, message, locations, generic
action descriptions, and optional provider-tagged details.

Trace returns graph nodes, edges, and evidence. Fix preview returns proposal
descriptions and locations. These two result kinds carry
`verdict: "not-applicable"`: neither operation asserts pass or fail, and the
runtime must not fabricate one.

Fields that cannot be supported by two independent implementations do not
enter the generic result shape. They remain under a `{ providerId, data }`
provider-details object or in the provider-tagged native payload.
