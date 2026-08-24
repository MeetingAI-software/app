# Syncmemos Live-preflight record template

Copy this template to the private launch record. A repository-safe row contains only the UTC date,
deployed Git commit, environment label, check name, and `PASS` or `FAIL`. Do not add names, contact
details, provider/customer identifiers, URLs containing tokens, support correspondence, payloads,
or credentials.

| UTC date | Git commit | Environment | Check | Result |
|---|---|---|---|---|
| YYYY-MM-DD | `<full commit SHA>` | Production-closed | Legal publication smoke | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Preview-dummy | Legal publication smoke | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Local | API tests/typecheck/build | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Local | Web tests/typecheck/lint/build | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Sandbox | Remote billing check | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Sandbox | Four-plan checkout matrix | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Sandbox | Failure and lifecycle simulations | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Sandbox | Webhook replay and state convergence | PASS/FAIL |
| YYYY-MM-DD | `<full commit SHA>` | Production-closed | Billing mutations disabled | PASS/FAIL |

The private launch record may link these aggregate results to restricted evidence. That evidence is
never copied back into this repository, an issue, a pull request, CI output, or chat.
