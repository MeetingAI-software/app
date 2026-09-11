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

## 2026-09-11 follow-up

A fresh lockfile audit found one critical, three high and six moderate package findings. The
compatible update resolves Next and its ESLint configuration to `16.3.4`, Multer to `2.3.0`,
Sharp to `0.35.4`, js-yaml to `4.3.2`, and Vitest plus `@vitest/mocker` to `4.1.11`.
The lockfile includes the corresponding native Sharp/libvips and Next SWC packages. These are
resolved versions, not just the manifest ranges. Workspace placement changes account for much of
the lockfile diff; verify actual installed versions after a clean `npm ci`.

Primary advisories: [Next Windows RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36),
[Next AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
[Multer multipart field names](https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm),
[Sharp/libheif](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c),
[js-yaml merge limits](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh), and
[Vitest mock redirect](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9).
Multer's `2.3.0` also covers the audit's aborted-upload descriptor leak, asynchronous file-filter
size-limit race and oversized array-index advisories.

Advisory severity describes the package. It does not prove application exploitability: the Next
Windows issue requires a Windows-hosted server, image advisories require affected image processing,
and upload authentication/notice gates precede Multer here. No production exploit was attempted.

After clean installation on Node `20.20.2`, the audit reports no high/critical findings and the
production-only audit reports zero findings. Four moderate development findings below remain.
Drizzle Kit's stable registry version is still `0.31.10`; the forced downgrade to `0.18.1` remains
inappropriate. The manual update policy and `qs@6.16.0` override are retained. Repeat audit on the
final PR head and sequential integration because the advisory database can change independently.

## Accepted development-only advisory (rechecked 2026-09-11)

As of 2026-08-13, npm reports four moderate findings through this development-only chain:

`drizzle-kit@0.31.10` -> `@esbuild-kit/esm-loader` -> `@esbuild-kit/core-utils` -> `esbuild@0.18.20`

The advisory concerns esbuild's local development server. Syncmemos does not run Drizzle Kit or an
esbuild development server in production. Drizzle Kit is used locally to generate migrations, and
generated migrations remain reviewed artifacts.

The current npm remediation suggestion is a forced downgrade to `drizzle-kit@0.18.1`, so it is not
accepted. Recheck this exception whenever Drizzle Kit is updated and remove it as soon as a stable
release no longer includes the affected loader. Critical and high findings are not accepted.

Rechecked 2026-08-27 as part of the launch readiness pass: unchanged. The same four moderate
findings are reported through the same chain, `drizzle-kit@0.31.10` is still the latest published
release, and the only remediation npm offers is still the breaking downgrade. The exception stands
for the same reason it was written. Next recheck: at the next Drizzle Kit release, or before Live,
whichever comes first.
