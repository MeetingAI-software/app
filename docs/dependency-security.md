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

## September 2026 security refresh

The security branch updates Browserslist to `4.28.9`, covering
[GHSA-c83g-rgw3-j3cx](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx)
and [GHSA-73wf-gq98-2v4g](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g).

The root `overrides.qs` pins `6.16.0` to address
[GHSA-x5fp-wj9c-mxmx](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx)
and [GHSA-4mjr-xmp4-gh2g](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g).
Express `4.22.2` and body-parser `1.20.6` still request `~6.15.1`, so a normal update cannot select
the fixed minor release. Remove the override when those parents allow a fixed version, then rerun
the audit and HTTP test suite. This preserves the existing Express major version.

When refreshing this override, use a resolver that handles overrides across workspace links:
`npm@11.6.2` silently retained qs `6.15.3`. The lockfile was resolved with `npm@11.18.0` and an
explicit `npm update qs --package-lock-only --ignore-scripts`. Always check `npm ls qs` after
installation; the override declaration alone is not evidence that the fixed version is installed.

## Accepted development-only advisory

As of 2026-08-13, npm reports four moderate findings through this development-only chain:

`drizzle-kit@0.31.10` -> `@esbuild-kit/esm-loader` -> `@esbuild-kit/core-utils` -> `esbuild@0.18.20`

The advisory concerns esbuild's local development server. Syncmemos does not run Drizzle Kit or an
esbuild development server in production. Drizzle Kit is used locally to generate migrations, and
generated migrations remain reviewed artifacts.

The current npm remediation suggestion is a forced downgrade to `drizzle-kit@0.18.1`, so it is not
accepted. Recheck this exception whenever Drizzle Kit is updated and remove it as soon as a stable
release no longer includes the affected loader. Critical and high findings are not accepted.
