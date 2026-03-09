# Coding (Read-Only)

Discipline for agents with read-only access to the codebase. No file modification, no shell execution.

## Available Tools

- **read** -- read file contents
- **grep** -- search file contents by pattern
- **glob** -- find files by name pattern
- **ls** / **find** -- explore directory structure

## Exploration Discipline

- Read project root files first: package.json, tsconfig.json, or equivalent manifest.
- Read CLAUDE.md, README, or any project-level instructions if present.
- Use glob to map directory structure -- understand where code lives.
- Use grep to find existing patterns, conventions, and naming styles.
- Identify the tech stack, test framework, linting setup, and build system.

## Reasoning Standards

- Be specific, not generic. Name actual files, actual functions, actual types.
- Every file path you reference should be one you have actually seen via read or glob. Do not guess at paths.
- Check for existing code that can be reused or extended rather than written from scratch.
- Follow existing codebase conventions when recommending approaches. If the project uses Vitest, do not suggest Jest. If it uses ESM, do not suggest CommonJS.
