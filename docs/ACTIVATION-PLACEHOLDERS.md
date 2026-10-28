# Activation placeholders and testing budget

This is a local handoff for the next integrator outside Dirty Mode. The placeholders below are documentation markers, never usable credentials, model pins, prices or approvals. Do not copy them into a running environment or into `eval/experiment.json`. Leave optional browser configuration unset for keyless local mode. Never read credential, `.env`, SSH or token files to fill these values; Roy supplies the actual access through an authorized channel.

Round 2 permits bounded local installation and validation while Dirty Mode remains active. It permits no live provider calls, account creation, spending without Roy-supplied access, remote creation, push, publication or deployment. This document records no validation result.

## Placeholder inventory

Every marker in this document is also linked from `BOLT-HANDOFF.md`. All markers currently occur only in this handoff documentation; the destination column identifies the future consumer, not a configured value.

| Marker | Future destination | Real value needed / owner step |
|---|---|---|
| `<PLACEHOLDER_SUPABASE_URL>` | `VITE_SUPABASE_URL`, read by `src/lib/supabase.ts` | Roy-approved fresh database project's HTTPS URL after target and migration tracking inspection |
| `<PLACEHOLDER_SUPABASE_ANON_KEY>` | `VITE_SUPABASE_ANON_KEY`, read by `src/lib/supabase.ts` | Public browser anon key belonging to that exact target; never a service-role key |
| `<PLACEHOLDER_AUTH_SITE_URL>` | Database auth Site URL and redirect allowlist | Approved frontend origin and callback locations; keep localhost-only validation isolated from future deployment |
| `<PLACEHOLDER_TEST_USER_A>` | Future two-user RLS/auth validation procedure | Roy-supplied or explicitly authorized test identity A; this is not an appointed admission author |
| `<PLACEHOLDER_TEST_USER_B>` | Future two-user RLS/auth validation procedure | Separate authorized test identity B; no invented address or account signup |
| `<PLACEHOLDER_ANTHROPIC_API_KEY>` | Local evaluator `ANTHROPIC_API_KEY`, read by `eval/providers/anthropic.ts` | Roy-supplied provider access, only if that provider is selected; never browser configuration |
| `<PLACEHOLDER_OPENAI_API_KEY>` | Local evaluator `OPENAI_API_KEY`, read by `eval/providers/openai-compatible.ts` | Roy-supplied compatible-provider access, only if selected; never browser configuration |
| `<PLACEHOLDER_MODEL_BASE_URL>` | Local evaluator `MODEL_BASE_URL`, read by `eval/providers/openai-compatible.ts` | Approved HTTPS API base supporting the implemented `/chat/completions` contract; no embedded credentials, query or fragment |
| `<PLACEHOLDER_SMALL_MODEL_PIN>` | `eval/experiment.json` → `models.small` | Exact supported model ID returned by the selected provider; choose the cheapest adequate compatible small model after access and dated prices are known |
| `<PLACEHOLDER_MID_MODEL_PIN>` | `eval/experiment.json` → `models.mid` | Exact supported model ID for the comparator tier; adequacy and comparator selection require real dev evidence |
| `<PLACEHOLDER_PRICE_EDITION>` | `priceEdition` and each `modelArms[].price.edition` | Dated, verified price source identifier matching the chosen literal models and provider billing |
| `<PLACEHOLDER_INPUT_PRICE_MICROUSD_PER_MILLION>` | Each arm's `price.inputMicroUsdPerMillion` | Verified nonnegative integer rate for that model; replace separately per arm as needed |
| `<PLACEHOLDER_OUTPUT_PRICE_MICROUSD_PER_MILLION>` | Each arm's `price.outputMicroUsdPerMillion` | Verified nonnegative integer rate for that model; replace separately per arm as needed |
| `<PLACEHOLDER_OWNER_APPROVAL_ID>` | `ownerApproval.approvalId` | Actual recorded owner-approved access/model/price/schedule authorization reference, never a fabricated approval |
| `<PLACEHOLDER_OWNER_APPROVED_BY>` | `ownerApproval.approvedBy` | Actual approving owner identity from that authorization; this document appoints nobody |

No independent author or relabeller identity is invented here. This INT, its DL seats and children remain builder lineage and cannot become the admission stand-in. Any eligible external stand-in must be labeled **delegated stand-in, not human-independent**; construction acceptance keeps **independence PENDING - Roy**. Human appointments remain Roy's decision. Do not populate admission receipts or hidden labels with placeholders.

## USD 40 testing plan — proposed allocations, no live execution

App-lifetime hard ceiling: **USD 40**. Spend recorded by this handoff: **USD 0**. Roy-supplied keys/accounts: **none**. Current executable configuration stays disabled: dev/sealed caps `0`, model IDs/prices/owner approval/selection evidence unset, `frozen: false`. This proposal changes none of those fields.

1. Complete permitted keyless local validation first. Before any later live run, the next authorized integrator verifies actual compatible model pins and dated prices, inspects the complete app-lifetime ledger and outstanding reservations, and records the owner-approved schedule. No speculative price or performance estimate is supplied here.
2. Proposed initial live allocation: **at most USD 4 total for the full dev pilot**, **at most USD 31 for the full sealed schedule**, leaving **USD 5 unallocated safety margin** below the hard ceiling. These are planning limits, not activated experiment caps. Existing spend and retained reservations reduce every remaining allocation; a new experiment never resets history.
3. Start with the smallest adequate supported model tier and finite token bounds. The existing `eval:models` command requires all four model arms and the complete six-fixture dev schedule. Compute its full maximum first with the existing `fullPilotMaximum`/`scheduleMaximum` logic. Do not turn it into an undocumented subset, trim the required comparison, or claim a partial run as a completed pilot. If the complete pilot cannot fit USD 4, halt for a revised affordable schedule/owner decision before dispatch.
4. Reserve the full bounded charge before every dispatch under the shared exclusive run lock. Halt before a reservation exceeds the phase allocation or remaining app-lifetime ceiling. Keep unknown usage and failed-call reservations charged; do not automatically retry or release them. A provider/model mismatch, bound violation, incomplete price evidence or irreconcilable ledger stops the live schedule for reconciliation.
5. A sealed run additionally requires genuine admission, the measured pilot receipt, clean committed source, the source/configuration hash-bound freeze and an affordable complete schedule. Check its full bound against the USD 31 proposal and actual remaining balance before unsealing. Preserve consume markers and all ledgers on failure; do not rerun an edition to improve a result.
6. Record every future charge in the outer `HANDOFF.md`: UTC date, purpose/run/arm, amount, retained reservation versus settled cost, cumulative app total and remaining ceiling; reference the durable `eval-ledger/` entries. Do not include keys or other secrets. Reconcile the handoff total with `lifetime.jsonl` before further dispatch. The USD 5 margin is not automatically available to a later phase.

Current spend entry: **2026-10-27 — USD 0 — documentation and keyless construction only; no provider dispatch or billing; cumulative USD 0; hard ceiling remaining USD 40.**

## Local TypeSafe working disclosure

TypeSafe relationship: not stated; no affiliation or independence is asserted or denied (pending Roy's factual confirmation)

This is Round 2's local-only working default, not public wording. It makes no factual relationship claim and does not activate a J adapter or measured J result. J remains `not_run`; any future public disclosure requires Roy's factual confirmation.
