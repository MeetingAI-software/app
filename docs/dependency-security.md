# Dependency security

## Automated detection

`.github/dependabot.yml` opens weekly version-update pull requests for npm (one entry covers both
workspaces — the root `package-lock.json` is the only lockfile) and for the GitHub Actions pinned
in CI. Minor and patch bumps are grouped into a single pull request; majors arrive individually so
each is read rather than rubber-stamped.

Version updates are only half of it. Dependabot **alerts** and **security updates** — which fire
when an advisory is published rather than on a schedule — are a repository setting, not a file:
Settings -> Code security. Without them this repository still learns about a vulnerable dependency
only when someone runs `npm audit` by hand.

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
