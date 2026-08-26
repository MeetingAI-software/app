# Dependency security

## Detection

Dependabot **alerts** are enabled at Settings -> Code security. They fire when an advisory is
published against a dependency, and they are a notification only: visible to repository
administrators, no pull request opened, no commit authored.

Dependabot **security updates** and scheduled **version updates** are both deliberately off. Both
work by opening pull requests, and a merged Dependabot pull request records `dependabot[bot]` as
the commit author. This is a two-person student project whose history is meant to show only its two
authors, so upgrades are applied by hand: read the alert, apply the change locally, run the
verification below, and commit it like any other change.

`npm outdated` from the repository root lists routine drift that no advisory covers.

## Verification

Run `npm audit` from the repository root together with both applications' normal test, typecheck,
lint, and build commands. Do not use `npm audit fix --force`: major-version changes must be reviewed
and tested explicitly.

## Accepted development-only advisory

As of 2026-08-13, npm reports four moderate findings through this development-only chain:

`drizzle-kit@0.31.10` -> `@esbuild-kit/esm-loader` -> `@esbuild-kit/core-utils` -> `esbuild@0.18.20`

The advisory concerns esbuild's local development server. Syncmemos does not run Drizzle Kit or an
esbuild development server in production. Drizzle Kit is used locally to generate migrations, and
generated migrations remain reviewed artifacts.

The current npm remediation suggestion is a forced downgrade to `drizzle-kit@0.18.1`, so it is not
accepted. Recheck this exception whenever Drizzle Kit is updated and remove it as soon as a stable
release no longer includes the affected loader. Critical and high findings are not accepted.
