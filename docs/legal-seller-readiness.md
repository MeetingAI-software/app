# Legal seller readiness

This is an internal launch gate for Syncmemos. It is not legal or tax advice and it does not
identify Syncmemos as a registered company. Do not submit Paddle Live verification or publish
final legal policies until every blocking item below has an evidence owner and is complete.

Paddle requires one supplier identity for the account. Its account verification includes domain
and identity checks; business verification is not required for an individual or sole trader. That
does not determine whether selling this product in Sweden as an individual is lawful or suitable.
The owners must obtain Swedish professional guidance before selecting the supplier.

## Current owner-reported status

As of 2026-08-13, the owners prefer to validate demand before registering a business and would like
an individual to be the initial supplier if legally and operationally suitable. They have not yet
obtained the Swedish tax/business guidance required below, so this preference is not a completed
seller selection and must not be submitted to Paddle as an approved setup.

The owners do not want a home address published in the application. No private address is stored in
this repository. Swedish e-commerce law generally requires a service provider's name, address in
the state of establishment, and email address to be easily, directly, and permanently available.
The owners must obtain advice on a lawful public contact address before paid launch; the repository
must not invent an alternative or silently omit a required address.

## Blocking decisions

Record evidence in a private location with access limited to the owners. Do not commit personal
identity documents, home addresses, tax identifiers, bank details, contracts, or Paddle
verification exports to this repository.

- [ ] Obtain written guidance from Skatteverket or a Swedish accounting/tax professional covering:
  - when the planned activity is treated as business activity rather than a hobby;
  - how Paddle payouts and fees are declared;
  - VAT and reverse-charge treatment between the supplier and Paddle;
  - how two owners report their shares of revenue, expenses, profit, and loss;
  - whether the planned sales can be made without registered business activity;
  - whether a simple partnership, sole trader, trading partnership, or limited company is
    appropriate for the intended ownership and risk.
- [ ] Select exactly one legal supplier identity for the Paddle account, based on that advice.
- [ ] Confirm that the selected identity can accept Paddle's supplier agreement and receive
  payouts.
- [ ] Confirm the lawful seller name, address, country, support email, and phone that may be
  supplied to Paddle and shown where required.
- [ ] Open a separate payout account appropriate for the selected supplier.
- [ ] Sign an owners' agreement before revenue is accepted.

An unregistered simple partnership is not a legal person and cannot itself be approved for
Swedish F-tax. Skatteverket says its participants own assets and are responsible for obligations
according to their shares, while profits and losses are split equally unless agreed otherwise.
This is one reason the Paddle supplier must not be guessed from the project's shared ownership.

## Minimum owners' agreement

Have a Swedish lawyer or qualified adviser review the agreement where appropriate. At minimum it
should state:

- the parties and ownership percentages;
- decision rights and who may bind the project contractually;
- responsibility for hosting, provider, tax, refund, and chargeback costs;
- allocation and payment of revenue, expenses, profit, and loss;
- ownership and licensing of source code, domain names, brand, designs, customer data, and other
  intellectual property;
- access rules for GitHub, Paddle, DNS, hosting, email, database, and recovery credentials;
- security requirements, including individual accounts and two-factor authentication;
- what happens if an owner stops contributing, wants to sell a share, becomes unavailable, or
  leaves;
- how disputes, deadlocks, dissolution, customer obligations, and remaining funds are handled;
- signatures and effective date.

## Evidence record

Keep the completed record outside the public repository.

| Gate | Evidence to retain privately | Owner | Complete |
|---|---|---|---|
| Swedish tax/business guidance | Written response or adviser memo and date | Unassigned | No |
| Legal supplier selected | Signed owner decision referencing the advice | Unassigned | No |
| Owners' agreement | Signed agreement and version date | Unassigned | No |
| Seller contact details | Verified name/address/contact record | Unassigned | No |
| Payout account | Account ownership confirmation | Unassigned | No |
| Paddle verification | Dashboard confirmation after the earlier gates | Unassigned | No |

## Live gate

Until all blocking decisions are complete:

- keep `BILLING_MUTATIONS_ENABLED=false`;
- do not apply for Paddle Live verification;
- do not publish final Terms, Privacy Policy, or Refund Policy with inferred seller details;
- do not describe Syncmemos as a registered company;
- do not accept real payments.

After completion, provide only the non-secret seller facts needed for the legal pages. Identity
documents, bank details, credentials, and verification secrets must be entered directly into the
relevant provider dashboard, never into chat, issues, commits, or deployment logs.

## Official references

- [Paddle account verification](https://www.paddle.com/help/start/account-verification/what-is-account-verification)
- [Paddle business identification](https://www.paddle.com/help/start/account-verification/what-is-business-verification)
- [Paddle setup checklist](https://developer.paddle.com/build/set-up-checklist/)
- [Skatteverket: Enkelt bolag](https://www.skatteverket.se/foretag/drivaforetag/foretagsformer/enkeltbolag.4.6d02084411db6e252fe8000928.html)
- [Skatteverket: Hobby](https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hobby.4.58d555751259e4d661680003935.html)
- [Swedish Electronic Commerce Act (2002:562), section 8](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/)
- [Skatteverket: What is business activity?](https://www.skatteverket.se/foretag/drivaforetag/startaochregistrera/vadarnaringsverksamhet.4.6efe6285127ab4f1d25800025792.html)
