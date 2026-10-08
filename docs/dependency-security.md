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

## October 2026 security refresh

On 2026-10-08, the recovered security branch was based on main commit `603094d`.
A fresh audit reported 15 affected packages (two critical, eight high, five moderate).
After remediation, both the full and production-only audits report zero vulnerabilities.
These results supersede the historical development-only exception below.

Runtime dependency floors are Next and eslint-config-next `^16.3.8` and Multer `^2.4.0`.
The lockfile also resolves Sharp `0.35.5`, proxy-addr `2.0.8`, source-map-js `1.2.2`,
and brace-expansion `1.1.21`/`5.0.12` to address newly published advisories.
Native Next and Sharp packages move with their parent releases.
See [Next RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j),
[Multer abort cleanup](https://github.com/advisories/GHSA-3pph-fpjx-jg34),
[Sharp SVG processing](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
[proxy subnet matching](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), and
[brace expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

The scoped core-utils override selects esbuild `0.25.12` without downgrading Drizzle Kit.
It closes [esbuild development-server cross-origin access](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
API/tsx and Vitest retain compatible esbuild `0.28.2` instances.

Braces `3.0.3` has no published fix for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Next's ESLint plugin only consumes fast-glob's named `globSync` for configured project roots.
A scoped override resolves that dependency to the local `tools/eslint-root-glob` adapter,
using tinyglobby `0.2.15` without braces. The adapter disables directory expansion and preserves
absolute paths and directory result strings. It deliberately implements only the interface
consumed by this plugin. The root development dependency supplies a portable local package link;
it is not a published registry package or a general fast-glob replacement.
Tests exercise the actual Next helper with default, wildcard, brace, literal, array and unmatched roots.
Recheck the helper's imports and API whenever upgrading eslint-config-next.

Resolve updates with npm `11.18.0`, then run a clean installation. Workspace resolver reuse can
retain vulnerable packages even when overrides declare patched versions. The lock includes matching
esbuild native binaries and required optional WASM dependencies; dependency and peer ranges were
checked across the whole lock. Actual execution was on macOS ARM64, not every platform.

Verification on Node `20.20.2`: API 916 tests passed and five opt-in live AI provider tests skipped;
web 143 tests passed. Both typechecks and builds, web lint and the secret scan passed.
Focused HTTP tests reject huge/padded/unknown-base numeric indices and excessive nesting before
append-field, retain all 50 participants with either part ordering, preserve JSON/WebM/MP4 uploads,
and verify capacity recovery and error semantics. See [upload bounds](upload-limits.md).
Drizzle schema export, loader CJS/ESM/source maps, esbuild origin handling, proxy subnet controls,
Sharp SVG/PNG/WebP/AVIF roundtrips and source-map-js ordinary mappings also passed.
No production exploit, external provider call, deployment or database migration was performed.
GitHub alerts on the default branch may remain open until this branch is merged and rescanned.

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

## Historical development-only advisory (resolved 2026-10-08)

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
