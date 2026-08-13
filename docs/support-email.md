# Support email runbook

This runbook configures `support@syncmemos.com` as a working customer-support identity. It covers
both receiving and sending: Cloudflare Email Routing forwards inbound mail, but forwarding alone
does not provide an authenticated mailbox or SMTP service for outbound replies.

Current status (owner-reported, 2026-08-13): inbound routing and outbound replies have been tested
successfully. No private destination, credential, or message data is stored here. Header-level
SPF, DKIM, and DMARC evidence remains an operational record rather than a repository artifact.

Do not store destination addresses, SMTP/API credentials, recovery codes, or raw test messages in
this repository. Put secrets only in the selected mail provider or secret manager.

## 1. Choose the outbound service

Before editing DNS, choose one authenticated outbound option:

- a mailbox provider that hosts `support@syncmemos.com` and supports SMTP or its own web client;
- an SMTP provider compatible with Gmail's **Send mail as** feature; or
- Cloudflare Email Sending if its current availability and product limits fit interactive customer
  support, not only transactional application email.

The service must support the visible From address `support@syncmemos.com`, DKIM signing for
`syncmemos.com`, SPF alignment, and replies to arbitrary customer addresses. Do not reuse the
application's Resend API key in a personal mail client unless the provider explicitly supports and
secures that workflow.

## 2. Configure inbound routing

1. Sign in to Cloudflare and select `syncmemos.com`.
2. Open **Email > Email Routing** (the dashboard may show **Compute > Email Service > Email
   Routing**).
3. Onboard the domain and review the MX and authentication records Cloudflare proposes.
4. Add the private Gmail address as a destination and complete Cloudflare's verification email.
5. Create an exact routing rule from `support@syncmemos.com` to the verified destination.
6. Do not create a catch-all unless it is deliberately wanted and monitored.
7. From a separate external account, send a uniquely identifiable test message to
   `support@syncmemos.com` and confirm it reaches the destination inbox and retains a usable Reply-To
   address.

DNS propagation can take time. Do not repeatedly replace correct records while propagation is in
progress.

## 3. Configure authenticated outbound mail

Follow the selected outbound provider's current documentation and use its exact DNS values. If the
private Gmail inbox remains the user interface:

1. In Gmail, open **Settings > See all settings > Accounts and Import**.
2. Under **Send mail as**, add `Syncmemos Support <support@syncmemos.com>`.
3. Configure the outbound provider's SMTP hostname, port, TLS mode, username, and app-specific
   credential. Do not use the private Gmail password.
4. Complete the ownership verification received through the inbound route.
5. Set replies to use the address that received the message, or explicitly select Syncmemos Support
   when replying.
6. Confirm a reply's visible From address is exactly `support@syncmemos.com`; a display name alone is
   insufficient.

If Gmail or the provider no longer supports this arrangement, use the provider's hosted mailbox or
another supported mail client. Do not spoof the From header through an unauthenticated alias.

## 4. Publish authentication records

Use only values issued by the active inbound and outbound providers.

- Maintain a single SPF policy for the domain. Merge all authorized senders into that record rather
  than publishing multiple SPF TXT records.
- Publish every DKIM selector required by the outbound service. Cloudflare routing and outbound mail
  may use different selectors.
- Publish DMARC at `_dmarc.syncmemos.com`. Start with reporting and review the reports before moving
  to quarantine or reject; choose the final policy based on observed legitimate senders.
- Remove obsolete provider authorizations after migration.

SPF, DKIM, and DMARC records are public configuration, but account credentials and signing private
keys are secrets. Only provider-supplied public DNS values belong in DNS.

## 5. Acceptance test

Run the test from an external mailbox that is not the forwarding destination.

- [ ] A new message to `support@syncmemos.com` arrives in the intended inbox.
- [ ] Replying sends from `support@syncmemos.com`, not the private Gmail address.
- [ ] The external recipient can reply again and the conversation returns to the support inbox.
- [ ] The received message headers show SPF `PASS` for an aligned domain.
- [ ] The received message headers show DKIM `PASS` for `syncmemos.com` or an aligned signing domain.
- [ ] The received message headers show DMARC `PASS`.
- [ ] The message is not marked as spam by the external provider.
- [ ] A second external provider is tested to reduce provider-specific false confidence.
- [ ] DMARC aggregate reports have a monitored destination that does not expose a private address
  publicly unless that is intentional.
- [ ] Account recovery and two-factor authentication are enabled for every mailbox administrator.

Record only the date, tester, providers used, pass/fail result, and non-sensitive remediation notes.
Do not paste complete headers into a public issue because they can contain private addresses,
routing identifiers, and infrastructure details.

## Operational ownership

Before launch, assign a primary and backup owner for the inbox, define a response target, and test
account recovery. Review forwarding rules, mailbox access, SPF, DKIM, DMARC reports, bounces, and
spam placement after every mail-provider or DNS change.

Application verification email remains separately configured through Resend as described in
[the email verification runbook](email-verification.md). Customer-support replies and application
transactional mail may share a domain only when their SPF/DKIM configuration is compatible.

## Official references

- [Cloudflare: Route emails](https://developers.cloudflare.com/email-service/get-started/route-emails/)
- [Cloudflare: Set up email records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/email-records/)
- [Cloudflare Email Service postmaster](https://developers.cloudflare.com/email-service/reference/postmaster/)
- [Gmail: Send emails from a different address or alias](https://support.google.com/mail/answer/22370)
