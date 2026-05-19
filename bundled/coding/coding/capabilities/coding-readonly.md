# Coding (Read-Only)

Discipline for agents with read-only access to the codebase. No file modification, no shell execution.

## Exploration Discipline

- Read project root files first: whichever dependency/build manifest the project uses (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `mix.exs`, etc.) plus any config files at the root.
- Read CLAUDE.md, README, AGENTS.md, or any project-level instructions if present.
- Use glob to map directory structure -- understand where code lives.
- Use grep to find existing patterns, conventions, and naming styles.
- Identify the tech stack and whichever of these the project actually has: test framework, static-analysis tooling, build system. Don't assume all three exist.

## Reasoning Standards

- Be specific, not generic. Name actual files, actual functions, actual types.
- Every file path you reference should be one you have actually seen via read or glob. Do not guess at paths.
- Check for existing code that can be reused or extended rather than written from scratch.
- Follow existing codebase conventions when recommending approaches. Match the project's choice of test framework, package layout, module system, and idiom — e.g. don't propose Jest when the project already uses Vitest, don't propose unittest when the project uses pytest, don't propose CommonJS when it uses ESM.
