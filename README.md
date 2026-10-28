# Civic Obligation Reader

> **Fictional enactments only. This explains supplied text, not legal applicability. Not legal advice.**
> Unadmitted regression build. Independent admission and live-service validation are pending.

Pick one of six fictional enactments, or paste a bounded `s46.packet.v1` JSON packet. Choose an as-of date to see who must, must not, may or need not do what, by when. Inspect exact source words, pending and unapplied amendments, uncertainty reasons and a second-date comparison. Optional event dates support calendar-day arithmetic. Personal rulings append to browser history; an optional owner-scoped database stores ruling metadata separately.

The root layout keeps the notice visible. Evidence badges say **exact quote in selected version** and verify quote/version only. They do not verify interpretation. Invalid quotes are omitted from the table and CSV/JSON exports with a visible count; diagnostics preserve them. CSV cells neutralize spreadsheet formulas.

## Construction status

Source includes the strict packet parser, version resolver, persistent taint, one-hop dependency handling, rule extraction, code comparator arms, scorer, provider/model boundaries, reservation ledger, sealed-run gates, reader UI, local/remote rulings and SQL migration. The author kit and admission protocol are available for independently appointed A/R sessions. Authored tests and replay examples exist.

Local validation on 2026-10-27 installed pinned dependencies with install scripts disabled and supplied the lockfile. Final typechecking, lint, production build and the full regression suite passed: **301 tests across 34 files**. The bounded localhost E01 journey passed 10 assertions covering date changes, source, computed deadlines, local ruling staleness and export generation. The author kit passed 26 checks; offline schemas validated six dev packets and 343 label lines; synthetic admission checks passed 16 assertions. Extractor v2 corrects supported actor boundaries and deadline precedence and stales prior v1 rulings. Code-only dev evaluation ran against builder-authored expectations; it establishes no admission or model-comparison claim. Database, provider endpoint, authentication and sealed execution remain unverified. See [validation status](docs/DEFERRED-VALIDATION.md) and [limitations](docs/LIMITATIONS.md).

## Results

<!-- s46:measured-results:start -->
No measured results. Independent admission and runtime validation are pending.
<!-- s46:measured-results:end -->

The preregistered, unmeasured comparison asks whether the default pipeline achieves higher exact actor/modality/deadline tuple F1 than the stronger pinned one-pass model comparator, without higher wrong-version rates or lower action fidelity/slot recall. A tie or loss must be reported. Builder-authored development expectations and authored replays never establish this claim.

G1 is pending Roy-appointed independent hidden author A and blind relabeller R. The original Claude builder and both Codex builders, including their children and forks, belong to the excluded cumulative builder lineage. The builder never authors hidden data or admission receipts. Held-out data and ledgers stay outside this repository.

## Local use under bounded local-validation authorization

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port <claimed-local-port>
```

Node >=22.6 is required. The lockfile is supplied. Round 2 permits local installation and validation while Dirty Mode stays open; check free RAM exceeds 3 GiB before installation. Claim the port under the project resource policy before starting a server. Missing remote configuration gives keyless local mode. Block network requests during the offline browser journey. Source is rendered as React text nodes.

The optional browser configuration names are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Provider access belongs only in the local evaluator environment under `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `MODEL_BASE_URL`, never a public browser prefix. No provider access is supplied in this repository. See [Bolt activation handoff](BOLT-HANDOFF.md); importing or provisioning is not authorized in this run.

## Evaluation after validation and approvals

```sh
npm run admit
npm run eval -- --split dev --run-kind measured
npm run eval:models -- --run-kind measured --pilot-id <unique-id>
npm run eval:heldout -- --run-kind measured
```

The deterministic dev entrypoint has run locally; admission and live model/sealed commands remain unrun. The dev entrypoint is deterministic code-arm evaluation. The model pilot is owner-gated and refuses the current disabled configuration. After owner approval of access, literal model IDs, dated prices and affordable allocations, commit the source/configuration, then run the uniquely named dev pilot. It stores raw completions, scores and an immutable receipt under the outer shell's `eval-ledger/pilots/<unique-id>/`, outside this repository. It chooses stronger M1b by dev tuple F1 (tie to mid), and H only on qualifying dev evidence; otherwise B0.

Before any hidden run, copy that receipt's selection into `defaultArm`/`strongerM1b`, its source inventory into `files`, and its ID/hash into `selectionEvidence`; freeze and commit the experiment. Source, guide, dev corpus, prompts, models, prices and approval must still match. The sealed runner verifies the artifact hashes and recomputes the selection before unsealing. Changed editions need a new approved pilot. Both pilot and sealed dispatch share one app-wide lifetime reservation ledger and lock, so a new experiment does not reset the USD 40 ceiling.

The sealed entrypoint refuses missing admission, an unfrozen/incomplete experiment, missing contested-label binding, unsupported run kind or an unaffordable full schedule before unsealing. The one-use consume marker prevents rerunning a sealed edition. Every scheduled M1b query has a separate consolidation outcome, including invalid, missing or screened claims; valid claims are scored independently of row validity, without repair. Read the entrypoint's explicit configuration requirements before activation.

`eval/experiment.json` is deliberately unconfigured: caps zero, model IDs null, owner approval/selection evidence null, default B0. The testing budget is USD 40 total (hard lifetime ceiling); actual spend is zero and live access/model/price configuration is pending. Reservations precede dispatch; unknown usage retains the reservation. J remains not_run pending relationship disclosure. No model is called by the browser.

Replay run kinds are `authored_replay` and `captured_replay`; measured reports refuse either. `fixtures/replay/authored/` contains builder boundary examples, not captured responses. No headline or numeric performance claim is available.

## Project map

| Path | Purpose |
|---|---|
| `src/core/` | Pure packet/version/extraction/evidence logic |
| `src/ui/`, `src/state/`, `src/export/` | Reader, personal rulings, explicit exports |
| `fixtures/dev/`, `fixtures/MANIFEST.json` | Six original CC0 fictional dev enactments and hand-written expectations |
| `eval/`, `scripts/` | Code/model arms, scoring, reports and gated local evaluation |
| `tools/author-kit/`, `tools/admit.ts` | Isolated authorship tools and receipt-only admission check |
| `schema/`, `docs/` | Packet/gold contracts, frozen guide, author packets and validation handoff |
| `supabase/migrations/` | Unapplied owner-scoped ruling migration |
| `tests/` | Local regression checks; see validation status for executed scope |

Code: MIT ([LICENSE](LICENSE)). Fixture texts: original fiction, CC0-1.0. No push, remote, deployment or publication has occurred.
