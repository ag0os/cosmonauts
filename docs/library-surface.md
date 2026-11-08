# Library surface

The library/content boundary is being established in library-strip steps 2–5.
The public declaration and runtime contracts will be documented as those seams land.

## Import boundary

**LS-1:** Nothing under library or CLI core imports from `domains/` or `bundled/`.
`tests/coding-agnostic-framework.test.ts` checks static imports, type imports,
re-exports, literal dynamic imports and literal `require` calls across `lib/` and
`cli/`, including content subsystems still awaiting later removal.

Extension implementations live in `lib/extensions/`, except `domain-bindings`,
whose move is deferred until its human-owned suppression registry entry can be
retired. Its implementation and directive remain unchanged at the original path.
Eight `domains/shared/extensions/*/index.ts` entry points forward to the moved
implementations to preserve
current domain and Pi discovery. Existing memory forwarding entries already
pointed into `lib/` and remain in place. Discovery and authorization defaults are
unchanged in this mechanical move; consumer runtime and memory grants follow in
later steps. The package Pi extension root remains on those forwarding entries
so internal knowledge-surface adapters are not accidentally auto-discovered.
