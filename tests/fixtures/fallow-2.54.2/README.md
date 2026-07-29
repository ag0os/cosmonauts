# Fallow 2.54.2 live envelopes

These fixtures preserve the reference provider's process envelope for every
analysis capability plus the config-introspection exit matrix. Each JSON file
records its own `provenance.envelopeSource`; the initial set was captured from
the repository-pinned live engine, while adapter tests may explicitly identify
fixture replay as `captured-payload`.

Run the capture into an existing directory outside the repository:

```bash
output_dir="$(mktemp -d)"
bun scripts/capture-fallow-envelopes.ts --output "$output_dir"
```

The script resolves only `node_modules/.bin/fallow`, verifies version `2.54.2`,
builds disposable projects under the operating-system temp directory, passes
`--no-cache` to every captured invocation, and requires `--dry-run` for the fix
preview. It refuses repository-local output and fails if any provider invocation
changes a temporary project. Copy reviewed results into this directory as a
separate promotion step.

`changed-scope-audit.json` is captured from a Git worktree carrying all three
change classes: a tracked unstaged edit, a staged addition, and an untracked
addition.
