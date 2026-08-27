# Launch handoff

Where the launch work stands as of **2026-08-27**, what is left, and who can do it. Written to be
readable months from now by someone who was not in the room.

Nothing here identifies a person, a company, an address, or a Paddle Seller ID. Those live in the
private launch record; this document names roles.

## The state in one paragraph

The product works and the engineering side of compliance is largely done or drafted. What blocks
Live is not code. It is that no legal seller has been chosen, no support address has been confirmed
as monitored, no provider has a verified region or a signed processing agreement, and no qualified
reviewer has read the policies. Every one of those is owner work, and each one blocks something
downstream. The three flags stay as they are: `LEGAL_POLICIES_PUBLISHED=false`,
`LEGAL_WITHDRAWAL_FLOW_APPROVED=false`, `BILLING_MUTATIONS_ENABLED=false`. No Live catalog exists, no
Live key is installed, and no real payment has been taken.

## What was done in this pass

**Security and compliance branch.** `fix/security-compliance-hardening` was rebased onto current
`main` and is green: typecheck clean, 798 API tests passing across 79 files with 5 skipped, 137 web
tests across 24 files, both builds succeeding. Three conflicts needed judgement rather than
mechanics, and all three are written up in the audit report: the migrations were renumbered so they
follow `main`'s waitlist migration without a single SQL statement changing; upload validation kept
`main`'s magic-byte sniffing over the branch's declared-MIME allowlist, because the allowlist would
have rejected recordings `main` deliberately accepts; and the CSP kept Report-Only, because flipping
it to enforcing during a merge that is also a production deploy is two changes wearing one hat.

**Privacy pack.** Four drafts written for the adviser: the [DPIA](dpia.md), the
[register](ropa.md), the [DSR procedure](data-subject-requests.md), and the
[breach procedure](incident-response.md). They are drafts, and they say so on the first line.

**Withdrawal function.** [Designed, not built](withdrawal-function-design.md). The design keeps
Paddle as the only place money moves and refuses to create a parallel case record.

**Owner support.** A [per-provider checklist](dpa-checklist.md) turning the processor map from ten
`Not verified` rows into a task list with named questions.

**Housekeeping.** A [documentation index](README.md) with the launch sequence and an owner per step;
a dead `DEPLOYMENT.md` link replaced with the actual deploy job; the accepted esbuild advisory
rechecked and confirmed unchanged.

## Branches to review

Two, both awaiting the owner. Neither should be automerged: merging to `main` runs a production
migration and deploys.

| Branch | Contents | Note |
|---|---|---|
| `fix/security-compliance-hardening` | Twelve commits of security and compliance fixes, plus the audit report and the pre-merge checklist | Read the pre-merge checklist first. It is a production migration |
| `docs/launch-readiness-pack` | The privacy pack, the withdrawal design, the DPA checklist, the docs index, two small fixes | Documentation only, no code paths touched |

Merge the security branch first — the privacy documents describe several of its measures as
implemented, flagged as branch-only until it lands.

There are also roughly six already-merged feature branches that can be deleted.

## What blocks Live, in order

1. **Choose the legal seller.** Blocks the controller entry in every privacy document, the seller
   facts on the legal pages, which supervisory authority applies to a breach, and Paddle Live.
2. **Confirm the support address is monitored.** Blocks the DSR procedure — there is no request
   process without an inbox someone reads — and the published contact point.
3. **Provider regions and DPAs, all ten.** Blocks any residency statement in the privacy policy,
   the transfer entries in the register, and the breach-notification chain.
4. **Merge the security branch.** Blocks the DPIA measures that are currently branch-only, and OAuth
   accounts cannot be deleted at all until it lands.
5. **Adviser review**, including the controller/processor question below.
6. **Publish the legal pages** against the exact reviewed commit, then Paddle Live, preflight, and
   the paid validation.

## The question to put to the adviser first

An organiser records a meeting. The other participants are transcribed, labelled, summarised and
stored, with no account and no relationship with us. Are we the processor for the organiser, a
controller in our own right, or joint controllers? [DPIA §7](dpia.md) sets out what each answer
costs. It changes the terms, possibly the notice flow, and the whole participant path in the DSR
procedure — so it is the first agenda item, not a loose end.

## Gaps that no document closes

Known, written down, and not fixed:

- **Waitlist.** `waitlist_signups` has no retention period, no deletion path, and no way to withdraw
  the consent it relies on. It is new on `main` and was not in scope for any prior work. Blocking.
- **Participant rights.** Someone recorded in a meeting has no route to their own data. This is a
  design consequence, not an oversight, and the adviser's answer decides what we owe them.
- **No export endpoint.** A subject access request is assembled by hand today.
- **`transcripts.raw_payload`.** A second complete copy of every meeting, kept indefinitely for
  reprocessing. Minimisation argues for bounding it.
- **`webhook_events` that never process.** Their payloads keep transcript content with no row-level
  retention. The redaction on the branch only covers rows that succeeded.
- **CSP is Report-Only.** Flipping it to enforcing is its own change, after a pass through the app
  including the Paddle overlay reports no violations.

## Two things that must not slip

**Nothing of a legal nature in this repository is finished text.** Every policy, procedure and
assessment here is a draft for the qualified reviewer.

**No personal data in the repository.** No ID documents, no bank details, no home addresses, no
secrets — not in commits, not in tests, not as placeholders. Seller facts are environment variables
in the hosting platform. Provider evidence and correspondence live in the private launch record.
