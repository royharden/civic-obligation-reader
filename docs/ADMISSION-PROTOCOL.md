# S46 Admission Protocol (gate G1)

Readers: the builder, hidden-set author A, relabeller R, Roy. Gate G1 decides whether the hidden set may carry any claim. It
governs claim-bearing work only (hidden data, the sealed run, results tables, any headline). The receipt JSON shapes are defined
here, and `tools/admit.ts` and `scripts/eval-heldout.ts` parse exactly these shapes.

**Status (2026-10-27): PENDING — needs Roy to appoint A and R.** No receipt exists; nothing has been authored, relabelled, compared
or run.

## 1. Roles and who checks what

| Actor | Who | Writes | Reads | Never |
|---|---|---|---|---|
| Builder lineage | cumulative roots `0805_Claude_Opus55_S46INT` and `0914_Codex_GPT-6_N20CodexInt46`, and every parent/fork descendant of either | the inner repo (guide, packet format, schemas, author kit, dev fixtures, product code) | receipts, only through `tools/admit.ts`; hidden bytes and `CONTESTED.json` only through `scripts/eval-heldout.ts` after the freeze | opens, lists, hashes or copies `heldout-sealed/` or `relabel-sealed/` before the post-freeze unseal; writes any receipt |
| Author **A** | appointed by Roy; outside every builder root's lineage; harness different from every builder root's (currently neither `Claude` nor `Codex`) | `heldout-sealed/H01..H10/`, `admission/A-RECEIPT.json` | the frozen A materials (`docs/AUTHOR-PACKET.md` section 2) | reads `relabel-sealed/` or the repo's `src/`, `eval/`, `scripts/`, `tests/`, `fixtures/`, prompts, recorded responses or any system output |
| Relabeller **R** | appointed by Roy; distinct from A and from the builder lineage | `relabel-sealed/H01..H10/`, `admission/R-SEAL.json`, `admission/CONTESTED.json`, `admission/ADMISSION.json` | the frozen R materials; each hidden `packet.json`; A's other hidden files only after `R-SEAL.json` exists | sees builder code, dev data, prompts or system outputs before `ADMISSION.json` |
| Roy | owner | appointments; optional adjudication of disagreements; guide-revision approval | anything | — |
| `tools/admit.ts` | builder-written, read-only | nothing (prints a verdict) | the inner repo, the AgentNamer registry, `A-RECEIPT.json`, `R-SEAL.json`, `ADMISSION.json` | opens `CONTESTED.json`, `heldout-sealed/` or `relabel-sealed/`; imports from `src/` or `eval/`; prints ids or paths from receipts |

The AgentNamer registry is `Bolt.New\.agent-registry\` (it holds every builder root's exact identity). A and R each claim a callsign there.
The builder-root set is append-only across succession. `tools/admit.ts` resolves each root by its pinned registry ID, exact name
and harness; it never derives trusted identity from a callsign. Parent and fork links both count as lineage. A's excluded harness
set is derived from all resolved roots; R may use any harness but must be outside every builder root and distinct from A in both
ancestry directions. Missing or ambiguous identity/lineage evidence (including a missing root/ancestor, absent `parent_id` or
`forked_from` column, malformed/duplicate registry row, cycle or the 64-level traversal limit) leaves admission **PENDING**.
Custody is by instruction plus recorded hashes, not cryptography.

## 2. Order of work (blind order)

1. The guide and the other A/R materials are frozen in the inner repo (their sha256 are in `fixtures/MANIFEST.json`).
2. **A** authors H01–H10 in `heldout-sealed/`, checks them with the author kit, and writes `A-RECEIPT.json`.
3. **R** reads only the ten `packet.json` files, hand-writes its own states and labels in `relabel-sealed/`, and writes
   `R-SEAL.json` (hashes of every R file). R's sealed files are never edited afterwards.
4. Only then **R** opens A's states, gold and `TRAPS.md`, re-checks A's files with the author kit, compares (section 4), writes
   `CONTESTED.json`, then `ADMISSION.json` (which records `CONTESTED.json`'s sha256 and entry count).
5. The builder runs `tools/admit.ts` → `GO | NO-GO | PENDING` with reasons.
6. After the freeze (and only if spend is approved), `scripts/eval-heldout.ts` verifies hidden bytes against A's receipt hashes and
   `CONTESTED.json` against the hash in `ADMISSION.json`, then applies the contested rule (section 5).
7. Later, R may do a release review of the published results. It is a separate, explicitly allowed step; R's isolation
   attestation covers the period up to and including `ADMISSION.json`.

## 3. Receipt shapes

Common rules: UTF-8 JSON without a byte order mark (a BOM is rejected, as by the author kit), no duplicate keys. Every field listed is required unless marked optional; no other fields. `sha256`
values are 64 lowercase hex characters over the exact file bytes. Timestamps are ISO-8601 date-times with `Z` or an offset
(`2026-11-02T15:04:05Z`). Paths use `/` and are relative to the **outer shell** (`heldout-sealed/H01/packet.json`,
`relabel-sealed/H01/gold.jsonl`), exactly as `sha256-files.mts --relative-to <outer shell>` prints them. Receipts are
**content-free**: hashes, counts, verdicts, family names and short reasons, never hidden text.

**CheckResult** = an object `{ "ok": true|false, ... }` whose other fields, if any, are content-free counts. It passes only when
`ok` is `true`; anything else (including a bare `true` or `"pass"`) counts as failed. Record a kit tool as
`{ "ok": <exit code 0 on every run>, "runs": int, "problems": int }` and any other check as `{ "ok": boolean }`.

**FileHash** = `{ "path": string, "sha256": string }`.

**KitRun** = `{ "tool": string (e.g. "check-offsets.mts"), "args": string, "exitCode": int, "summary": string (counts only) }`.

### 3.1 `admission/A-RECEIPT.json` (written by A)

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | `"s46.a-receipt.v1"` | |
| `authorCallsign` | string | A's AgentNamer callsign |
| `harness` | string | A's registry harness; must differ from every builder root's (currently `Claude` and `Codex` are excluded) |
| `model` | string | |
| `registry` | string | absolute path of the AgentNamer registry folder |
| `writtenAt` | timestamp | |
| `appointment` | string | how and when Roy appointed A |
| `materials` | FileHash[] | every frozen material A used, inner-repo-relative paths (guide, packet format, traps, this protocol, author packet, both schemas, each author-kit file) |
| `guideSha256` | sha256 | equals the guide's entry in `materials` |
| `node` | string | `node --version` used for the kit |
| `families` | string[10] | A's ten hidden topic families, distinct |
| `devFamiliesAvoided` | string[6] | the six dev families, copied from `docs/AUTHOR-PACKET.md` |
| `enactments` | EnactmentReceipt[10] | one per H01–H10 |
| `checks` | `{ "validatePacket", "checkOffsets", "checkValues", "queryDates": CheckResult }` | final kit results over all ten enactments |
| `trapCoverage` | object trap id → enactment id[] | for T1–T15, T18, T19, per the counting rules of `docs/TRAPS.md` section 3 |
| `totals` | `{ "enactments": 10, "files": int, "goldLines": int }` | |
| `kitRuns` | KitRun[] | the final run of each tool |
| `kitDisagreements` | `{ "tool": string, "enactmentId": string, "guideSection": string, "note": string }[]` | where A believes the kit contradicts the guide (content-free); may be empty |
| `attestation` | object | booleans, all `true`: `original`, `fictional`, `handWrittenStates`, `noGeneratedText`, `noBuilderLineage`, `noRepoAccess`; strings: `license` (`"CC0-1.0"`), `statement` (A's own words: original fiction; never read the repo's `src/`, `eval/`, `scripts/`, `tests/`, `fixtures/`, prompts, recorded responses or system outputs, nor `relabel-sealed/`) |

**EnactmentReceipt** = `{ "id": "H01".."H10", "family": string, "sections": int (base + added), "amendments": int,
"states": int, "queries": int, "operativeClauses": int (the smallest per-state count), "operativeClausesPerState": { "S0": int, ... },
"goldLines": { "obligation": int, "negative": int, "no_rows": int }, "traps": string[] (trap ids that count for this enactment),
"files": FileHash[] (every file of that enactment, paths `heldout-sealed/Hnn/...`) }`.

### 3.2 `admission/R-SEAL.json` (written by R before opening A's states or gold)

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | `"s46.r-seal.v1"` | |
| `relabellerCallsign` | string | |
| `harness` | string | R's registry harness |
| `model`, `registry`, `appointment` | string | as in A-RECEIPT |
| `sealedAt` | timestamp | |
| `materials`, `guideSha256` | as in A-RECEIPT | |
| `packetsRead` | FileHash[10] | the ten `heldout-sealed/Hnn/packet.json` as R read them |
| `files` | FileHash[] | every R file (`relabel-sealed/Hnn/states/...`, `relabel-sealed/Hnn/gold.jsonl`, notes) |
| `totals` | `{ "enactments": 10, "files": int, "labelLines": int }` | |
| `attestation` | object | booleans, all `true`: `blindBeforeSeal` (no `heldout-sealed/` file other than the ten `packet.json` was opened), `noRepoAccess`, `noBuilderLineage`, `notAuthorA`, `handWrittenStates`; string `statement` |

### 3.3 `admission/CONTESTED.json` (written by R)

A top-level JSON **array** of `{ "queryId": string, "slotId": string, "field": "actor"|"modality"|"action"|"deadline"|"kind" }`.
Ids are **A's** ids. Entries are unique and sorted by `queryId`, then `slotId`, then `field` (code-unit order). A slot contested on
`kind` at a query has only the `kind` entry there. An empty array is valid. No other content.

### 3.4 `admission/ADMISSION.json` (written by R, only when the comparison is complete)

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | `"s46.admission.v1"` | |
| `relabellerCallsign`, `harness` | string | same values as in `R-SEAL.json` |
| `model`, `registry` | string | |
| `writtenAt` | timestamp | after `R-SEAL.sealedAt` |
| `round` | `1` or `2` | 2 only after the single guide revision (section 6) |
| `verdict` | `"GO"` or `"NO-GO"` | R's checklist verdict (until R is done there is no `ADMISSION.json`, and G1 is PENDING) |
| `reasons` | string[] | content-free reasons for every failed item |
| `guideSha256` | sha256 | the guide edition both labelled against |
| `guideRevision` | `{ "revised": boolean, "priorGuideSha256": sha256 or null }` | |
| `bindings` | `{ "aReceiptSha256": sha256, "rSealSha256": sha256 }` | hashes of the receipt files R checked |
| `recheck` | object | every value a CheckResult: `validatePacket`, `checkOffsets`, `checkValues`, `queryDates` (R's runs of the kit on A's files), `hiddenFilesMatchAReceipt`, `trapFloorsMet`, `familiesDisjointFromDev`, `sizesWithinLimits` |
| `kitRuns` | KitRun[] | R's final kit runs |
| `agreement` | object | `modality`, `tuple`, `disputedFieldRatio` (numbers) and `unresolvedStateDisagreements` (int), plus the counts of section 4.4 |
| `stateDisagreements` | `{ "total": int, "byKind": { "state_text", "boundary", "query_dates", "in_force": int }, "resolved": { "a_corrected", "r_error", "roy_adjudicated": int } }` | section 4.3 (unresolved = `agreement.unresolvedStateDisagreements`) |
| `thresholds` | `{ "modality": 0.85, "tuple": 0.70, "disputedMax": 0.05, "unresolvedStateMax": 0 }` | fixed |
| `contested` | `{ "sha256": sha256, "count": int, "byField": { "actor", "modality", "action", "deadline", "kind": int } }` | of the exact `CONTESTED.json` bytes; `count` = array length |
| `originalityReview` | `{ "ok": boolean, "flaggedPassages": int }` | section 7 |
| `denylistScan` | `{ "ok": boolean, "hits": int, "assessment": string }` | `ok` = every hit assessed as not real-law content |
| `noSymlinks` | boolean | over `heldout-sealed/` |
| `maxFileBytes` | int | largest file in `heldout-sealed/`; must be ≤ 200000 |
| `attestation` | object | booleans, all `true`: `noRepoAccess` (up to and including this receipt), `rSealBeforeComparison`, `noBuilderLineage`, `notAuthorA`; string `statement` |

## 4. Comparison, alignment and agreement (R)

### 4.1 Units

Every comparison is per **(query, slot)**: a slot present in eight queries counts eight times. Lines with `kind` `obligation`
or `negative` are aligned; `no_rows` lines are compared by `queryId` only.

### 4.2 Alignment

For each `queryId` and `sectionId`, R aligns its lines to A's by clause-span IoU, where IoU([a,b),[c,d)) = overlap / union,
overlap = max(0, min(b,d) − max(a,c)), union = (b − a) + (d − c) − overlap:
1. Candidate pairs are (A line, R line) with IoU ≥ 0.5.
2. Sort them by IoU descending; then by the distance between their modality `evidenceSpan` starts (a line without one uses its
   `clauseSpan` start) ascending; then by A `clauseSpan` start, A `slotId`, R `clauseSpan` start, R `slotId`.
3. Walk the list once, accepting a pair when neither line is already paired.

Unpaired A lines are **A-unaligned**; unpaired R lines are **R-only**. A `no_rows` line on one side with any line on the other is an
`in_force` disagreement (4.3).

### 4.3 Consolidated-state and date-boundary disagreements

Kinds: `state_text` (a section's state file bytes differ, or a section is present on one side only), `boundary` (the states or
their intervals differ), `query_dates` (the query lists differ), `in_force` (one side writes `no_rows`, the other does not). Each is
resolved as `a_corrected` (A fixes its files, re-runs the kit and re-issues `A-RECEIPT.json`; R re-verifies), `r_error` (R records
that its own sealed file is wrong under the guide; sealed files are not edited), or `roy_adjudicated`. Otherwise it is
`unresolved`. **Zero unresolved** is required.

### 4.4 Field agreement and metrics

On an aligned pair where both lines are `obligation`:
- **actor** agrees: both known with equal `id`, or both unknown with equal reason;
- **modality** agrees: equal known value, or both unknown with equal reason;
- **action** agrees: both known and matching under the guide's relaxed rule (equal `headVerb`, predicate token-F1 ≥ 0.5), or both
  unknown with equal reason;
- **deadline** agrees: both known with equal `(kind, n, unit, date, eventKey, dueDate)`, or both unknown with equal reason. R's
  blind labels carry `triggerDates: {}`; before comparing, R recomputes its own `dueDate` with A's `triggerDates` for that query.

An aligned pair whose `kind`s differ is a **kind disagreement**. Negative–negative pairs agree on kind; `negativeReason` is not
compared.

Metrics (raw proportions, not kappa), reported in `ADMISSION.json` `agreement`:

| Key | Definition |
|---|---|
| `aObligationLines`, `aNegativeLines`, `rObligationLines`, `rNegativeLines` | line counts over all in-force hidden queries |
| `alignedPairs`, `alignedObligationPairs` | aligned pairs; those where both lines are `obligation` (= **N**) |
| `kindDisagreementsAligned` | aligned pairs with different `kind` |
| `aUnaligned`, `rOnly` | `{ "obligation": int, "negative": int }` |
| `perField.actor` / `.modality` / `.action` / `.deadline` | pairs agreeing on that field ÷ N |
| `modality` | = `perField.modality`; threshold **≥ 0.85** |
| `tuple` | pairs agreeing on actor **and** modality **and** deadline (the primary tuple) ÷ N; threshold **≥ 0.70** |
| `tuple4Relaxed` | pairs agreeing on actor, modality, deadline and action ÷ N (reported, no threshold) |
| `disputedNumerator`, `disputedDenominator` | U and D below |
| `disputedFieldRatio` | U / D; threshold **≤ 0.05** |
| `unresolvedStateDisagreements` | section 4.3; must be **0** |

Disputed scored fields: an obligation line carries 4 scored fields (actor, modality, action, deadline), a negative line 1 (kind).
- D = Σ over A lines of their weight (4 or 1) + Σ over R-only lines of their weight.
- U = number of field-level `CONTESTED.json` entries (actor, modality, action, deadline) + Σ over A lines contested on `kind`
  (kind disagreements and A-unaligned lines) of their weight + Σ over R-only lines of their weight.

If N = 0 the agreement thresholds are not met.

### 4.5 Writing `CONTESTED.json`

- Aligned obligation pair: one entry per disagreeing field among actor, modality, action, deadline.
- Kind disagreement, or A-unaligned line (obligation or negative): one `kind` entry.
- R-only lines are not listed (they have no A id); they count in `agreement.rOnly` and in U.

## 5. Contested-label rule (applied at scoring; nobody edits gold)

Authors always write `contested:false`. At the post-freeze unseal `eval-heldout` passes `CONTESTED.json` to the scorer:
- **Tuple P/R/F1**: a slot with contested actor, modality, deadline or kind is excluded; every prediction aligned to it is dropped
  (neither true nor false positive).
- **Action fidelity**: a slot with contested action or kind is excluded.
- **Field-level metrics** (per-field accuracy, wrong-version trigger (b), unknown precision/recall): only the contested field is
  excluded.
- **Slot recall and wrong-version trigger (a)**: the slot is kept unless `kind` is contested. A contested `kind` removes the slot
  from every metric, and a gold value contested at one query is never used as another query's reference value.
- **Reporting**: exclusion counts per metric and per arm are printed with the results. R-only slots are disagreements, never scored.

## 6. Thresholds and the single revision

G1 requires all of: modality agreement **≥ 0.85**; tuple agreement **≥ 0.70**; disputed scored fields **≤ 5%**; **zero**
unresolved consolidated-state/date-boundary disagreements.

If round 1 misses a threshold: R reports, without hidden text, which guide sections the disputes fall under (counts per section).
The guide may be revised **once** (by the builder lineage, approved by Roy, new sha256 recorded in the manifest). A updates its gold
to the revised guide and re-issues `A-RECEIPT.json`; R relabels all ten from the packets under the revised guide (Roy may appoint a
fresh R instead; round-2 relabels by the same R are not blind and the receipt says `round: 2`), re-seals, compares and writes a new
`ADMISSION.json`. A second failure is **NO-GO**.

## 7. Content and file checks (R)

- **Originality**: R reads every hidden text and flags any passage that reads as real law, a real place, person or organisation.
  Provenance attestations must be present in every packet and in A's receipt.
- **Denylist scan** (supporting signal only): US state names, "United States", "U.S.C.", "Congress", "Parliament" and the 100
  largest US city names. R reports hits and its assessment of each.
- **Files**: no symlinks and no file over 200,000 bytes in `heldout-sealed/` (`sha256-files.mts` lists both).

## 8. `tools/admit.ts` checks and verdicts

`admit.ts` evaluates, reading only the inner repo, the registry and the three receipts named in section 1:
1. The guide's sha256 matches `fixtures/MANIFEST.json`, and the guide's **first** commit precedes every `src/` file (a later
   revision is recorded in the manifest with its own hash).
2. Dev: six enactments validate; every dev expected quote occurs at its offsets in its hand-written state text; dev families are
   disjoint from `A-RECEIPT.families`.
3. Hidden, from receipts only: A reports 10 enactments, every check a passing CheckResult (`ok: true`), trap floors met (`docs/TRAPS.md` section 1); A is in the
   registry with harness different from every builder root's and outside every builder root's parent/fork lineage; `ADMISSION.recheck` confirms these.
4. R's receipts exist with the same `relabellerCallsign` and `harness`; R is registered, distinct from A and from the builder
   lineage; `agreement` meets every threshold of section 6; `verdict` is `GO`; `contested` has a sha256 and a count.
5. `A-RECEIPT.attestation.original` is true; `originalityReview` and `denylistScan` report `ok: true`.
6. `noSymlinks` is true and `maxFileBytes` ≤ 200000.
7. Isolation and blind order: every boolean in each `attestation` is true (A's `noRepoAccess`, R's `blindBeforeSeal`,
   `rSealBeforeComparison`); `R-SEAL.sealedAt` is a valid timestamp earlier than
   `ADMISSION.writtenAt`; `bindings` equal the sha256 of the current `A-RECEIPT.json` and `R-SEAL.json`; every receipt's
   `guideSha256` equals the manifest's current guide hash.

Verdicts:
- **PENDING**: any of `A-RECEIPT.json`, `R-SEAL.json`, `ADMISSION.json` is missing, or registry identity/ancestry evidence is
  unresolved as described in section 1. Other failed checks are still listed, with their severity. This is the status today.
- **NO-GO**: all receipts present and any check fails. Each reason is marked `fixable` (malformed or mismatched receipt, missing
  field, bad hash: the writer repairs it and admit runs again) or `final` (a second agreement failure; A in any builder harness or
  lineage; R in any builder lineage or not distinct from A; an isolation or blind-order breach). A final NO-GO means no headline claim: the repo stays an unadmitted
  regression build.
- **GO**: every check passes and `ADMISSION.verdict` is `GO`.

`admit.ts` prints the verdict, check numbers and reasons, and counts; it never prints ids, paths or family names from receipts.

## 9. `scripts/eval-heldout.ts` at unseal

Refuses to run unless: `admit.ts` gives GO; the experiment is frozen; the run kind is `measured`; `admission/CONTESTED.json` exists
and its sha256 and array length equal `ADMISSION.contested.sha256` / `.count`; every hidden file's sha256 equals A's receipt.
It then applies section 5.
