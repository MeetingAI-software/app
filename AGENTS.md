# Repository working agreement

## Branch names

- Never create or rename a branch under the `codex/` namespace.
- Use a descriptive, lowercase kebab-case name that states the branch's purpose. Prefer a conventional prefix such as `feat/`, `fix/`, `docs/`, `test/`, `chore/`, `review/`, or `release/` when it fits.
- Do not use generated code names or animal names. A reviewer should understand the work from the branch name alone.

## Merge readiness

- Bring the latest `origin/main` into an integration branch without rewriting shared history.
- Before opening a pull request, run the repository's tests, typechecks, builds, and secret scan.
- Do not mix unrelated working-tree changes into an integration pull request.
