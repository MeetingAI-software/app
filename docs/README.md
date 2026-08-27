# Documentation index

Twenty-odd documents accumulated here, and their order of use is not obvious from their filenames.
This index gives each one an owner and a place in the launch sequence.

Two conventions run through all of them:

- **`Unassigned`** means a person has not been named. It is an open item, not a formatting
  placeholder.
- **`Not verified`** means a fact about a provider or an external party that we have not established
  from the dashboard or the contract. It must never be turned into a public claim.

Nothing in `docs/` is legal advice, and the documents of a legal nature are drafts for the adviser,
not finished text.

## The launch sequence

Each step blocks the ones after it. Owner column: `Owner` is work only the account holder can do;
`Engineering` is work in this repository; `Adviser` needs the qualified reviewer.

| # | Step | Read | Owner |
|---|---|---|---|
| 1 | Choose the legal seller and gather the public seller facts | [legal seller readiness](legal-seller-readiness.md), [Skatteverket call brief](skatteverket-call-brief.md) | Owner |
| 2 | Stand up a monitored support address with SPF, DKIM and DMARC | [support email](support-email.md) | Owner |
| 3 | Establish region, DPA and breach contact for all ten providers | [DPA checklist](dpa-checklist.md), [processor map](data-processors.md) | Owner |
| 4 | Merge the security and compliance hardening branch | [pre-merge checklist](security-branch-premerge.md), [audit report](security-compliance-audit.md) | Engineering |
| 5 | Adviser reviews the privacy pack and answers the controller question | [DPIA](dpia.md), [register](ropa.md), [DSR procedure](data-subject-requests.md), [breach procedure](incident-response.md) | Adviser |
| 6 | Decide whether a withdrawal function is owed, and by whom | [withdrawal function design](withdrawal-function-design.md) | Adviser + Owner |
| 7 | Publish the legal pages against the exact reviewed commit | [legal pages](legal-pages.md) | Owner + Engineering |
| 8 | Take Paddle Live and run the production preflight | [Paddle Live operations](paddle-live-operations.md), [production hardening](paddle-production-hardening.md), [preflight record template](live-preflight-record.template.md), [what preflight is waiting for](live-preflight-waiting.md) | Owner |
| 9 | Run the 48-hour paid validation | [customer validation](customer-validation.md), [tracker](customer-validation-tracker.md) | Owner |

Where the sequence stands and what is left is summarised in the
[launch handoff](launch-handoff.md).

## By subject

### Privacy and data protection

| Document | What it is |
|---|---|
| [dpia.md](dpia.md) | Draft Art. 35 impact assessment. Holds the unresolved controller/processor question |
| [ropa.md](ropa.md) | Draft Art. 30 register, activity by activity |
| [data-subject-requests.md](data-subject-requests.md) | Draft procedure for access, erasure, portability and objection |
| [incident-response.md](incident-response.md) | Draft Art. 33/34 breach procedure and the 72-hour clock |
| [data-retention.md](data-retention.md) | The retention schedule the sweep job enforces, and why |
| [data-processors.md](data-processors.md) | Engineering inventory of every provider that touches personal data |
| [dpa-checklist.md](dpa-checklist.md) | The worksheet that turns that inventory from `Not verified` into evidence |

### Legal and commercial

| Document | What it is |
|---|---|
| [legal-seller-readiness.md](legal-seller-readiness.md) | The gate: no seller, no Live |
| [legal-pages.md](legal-pages.md) | Fail-closed publication of the six legal routes |
| [withdrawal-function-design.md](withdrawal-function-design.md) | Design only. Nothing is built, and Paddle stays the merchant of record |
| [skatteverket-call-brief.md](skatteverket-call-brief.md) | What to ask before registering |
| [support-email.md](support-email.md) | The support address, its authentication, and its acceptance criteria |

### Billing

| Document | What it is |
|---|---|
| [paddle-sandbox.md](paddle-sandbox.md) | Sandbox setup and webhook testing |
| [paddle-production-hardening.md](paddle-production-hardening.md) | The startup guard that refuses an incomplete Live catalog |
| [paddle-live-operations.md](paddle-live-operations.md) | Going Live, in order |
| [live-preflight-waiting.md](live-preflight-waiting.md) | What preflight is still blocked on |
| [live-preflight-record.template.md](live-preflight-record.template.md) | The record to fill in on the day |
| [customer-validation.md](customer-validation.md) / [customer-validation-tracker.md](customer-validation-tracker.md) | The 48-hour paid validation and its running record |

### Engineering

| Document | What it is |
|---|---|
| [local-development.md](local-development.md) | Setup, and the guards you will meet |
| [email-verification.md](email-verification.md) | Verification tokens, the send budget, and the migration guard |
| [dependency-security.md](dependency-security.md) | Audit policy and the one accepted development-only advisory |
| [gemini-eval.md](gemini-eval.md) | Document generation evaluation |
| [security-compliance-audit.md](security-compliance-audit.md) | Findings and what each fix does. Arrives with `fix/security-compliance-hardening` |
| [security-branch-premerge.md](security-branch-premerge.md) | What to check before merging that branch to `main`. Arrives with it too |

Architecture is documented per day in `ARCHITECTURE*.md` at the repository root.

## Rules that apply to everything here

- No personal data, ID documents, bank details, home addresses or secrets — not in the repository,
  not in commits, not in tests, and not as placeholders.
- Seller facts are entered as environment variables in the hosting platform, never in source
  control.
- Provider evidence lives in the private launch record. What comes back here is one word per cell.
