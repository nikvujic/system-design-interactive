# ADR 0001: Biome for linting and formatting

**Status:** Accepted

## Context

The roadmap planned ESLint and Prettier for linting and formatting. The repository uses TypeScript 7, the
native (Go-based) compiler. ESLint's TypeScript support, typescript-eslint, relies on the TypeScript
compiler's JavaScript API, and its current release supports TypeScript versions below 6.1. Using it
here would mean installing a second, older TypeScript version only for linting, with the risk that the
linter and the compiler disagree about the same code.

## Decision

Use [Biome](https://biomejs.dev) as the single tool for linting, formatting and import sorting.

- One configuration file, `biome.json`, at the repository root, applied to every package.
- The recommended rule set, with `style/noNonNullAssertion` turned off: the compiler option
  `noUncheckedIndexedAccess` makes indexed reads possibly `undefined`, and a non-null assertion (`!`) is
  the explicit way to state that an index is known to exist.
- Markdown is not formatted. The documentation uses hand-written tables and line breaks.
- `pnpm lint` checks everything and fails on any problem, including unformatted code. `pnpm format`
  applies formatting and safe fixes. CI runs `pnpm lint`.

## Consequences

- Linting does not depend on the TypeScript compiler version, so TypeScript upgrades are not blocked by
  the linter.
- Biome does not use type information, so rules that need it (for example, detecting unhandled
  promises) are not available. The strict compiler settings cover part of this gap.
- Biome's plugin ecosystem is smaller than ESLint's. If a needed rule is missing, this decision can be
  revisited once typescript-eslint supports TypeScript 7.
- The Biome version is pinned exactly, because formatting output can change between releases.
