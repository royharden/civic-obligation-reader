# S46 Relabeller Packet (blind relabeller R)

You are **relabeller R**. From author A's ten hidden packets and the frozen guide you independently hand-write every consolidated
state and every label, **seal** them, and only then compare them with A's. You record the comparison in id-only and content-free
receipts that decide admission gate G1. Later you may review the published results as a separate step. Nothing has been run or
measured; do not report or imply any result.

## 1. Who may be R

- Appointed by **Roy**. Distinct from author A (neither the same agent nor an ancestor/descendant through parent or fork
  links) and outside the cumulative builder lineage: predecessor `0805_Claude_Opus55_S46INT`, successor
  `0914_Codex_GPT-6_N20CodexInt46`, and all parent/fork descendants of either root. Succession adds roots; it never removes
  an earlier builder. R may use any harness, including a builder harness, if its exact registry identity proves independence.
- Missing roots/ancestors, missing lineage columns, cycles or exhausted traversal leave eligibility **PENDING**. A callsign
  or `noBuilderLineage` attestation alone cannot establish independence.
- Claims an AgentNamer callsign in `C:\Users\Roy Harden\OneDrive\PJ-OD\Bolt.New\.agent-registry\` and uses it as `labeller`.

## 2. Inputs and access limits

Inner repo root: `C:\Users\Roy Harden\OneDrive\PJ-OD\Bolt.New\civic-obligation-reader\civic-obligation-reader\`. You may read
only these frozen materials: `docs/LABELLING-GUIDE.md`, `docs/PACKET-FORMAT.md`, `docs/TRAPS.md`, `docs/ADMISSION-PROTOCOL.md`,
`docs/RELABELLER-PACKET.md` (this file), `schema/packet.schema.json`, `schema/gold.schema.json` and `tools/author-kit/`.

From the outer shell's `heldout-sealed/` you may read **only each `Hnn/packet.json`** until your `admission/R-SEAL.json` exists.
After the seal you may read every file in `heldout-sealed/` and `admission/A-RECEIPT.json`. You write only in `relabel-sealed/` and
`admission/` (`R-SEAL.json`, `CONTESTED.json`, `ADMISSION.json`).

Until and including `ADMISSION.json` you must never open the repo's `src/`, `eval/`, `scripts/`, `tests/`, `fixtures/`, any prompt,
recorded model response, results or other system output, nor the outer `planning/`, `agentops/`, `.thinking/`, `.chatexports/` or
`PLAN.md`. You attest to this. You never send hidden content or ids to the builder lineage; your receipts are the only channel.

The six dev topic families (A's ten must be disjoint from them): mobile food vendors, library kiosks, well-water sampling, park
permits, dog-licence renewals, short-term parking.

## 3. Phase 1 — blind relabel

For each `Hnn` (from `heldout-sealed/Hnn/packet.json` only):
1. Compute by hand the boundaries and states (guide section 10) and the query dates (guide section 11).
2. Hand-write `relabel-sealed/Hnn/states/<stateId>/<sectionId>.txt` for every state and section present (exact bytes, LF, no added
   trailing newline). Never produce state text with an applier, script or automated find-and-replace.
3. Write `relabel-sealed/Hnn/gold.jsonl` (your labels) in the gold-line format of guide section 12, with `split:"hidden"`,
   `provenance:"hidden-relabeller-R"`, `labeller` = your callsign, your **own** stable slotIds (same rule), `contested:false`, and
   `triggerDates: {}` on every line (you do not know A's trigger dates; relative `dueDate`s are therefore `null` here and are
   recomputed in phase 2). Tag traps if you recognise them (optional for R).
4. Check your own files with `check-offsets.mts --gold <your gold.jsonl> --states <your states dir>`, `check-values.mts` and
   `query-dates.mts --packet <A's packet.json> --gold <your gold.jsonl>` (section 6). The kit accepts
   `provenance:"hidden-relabeller-R"` on hidden lines (and then requires `triggerDates: {}`); fix every problem it reports.
5. Write `admission/R-SEAL.json` (shape: `docs/ADMISSION-PROTOCOL.md` section 3.2): sha256 of every file you wrote and of each
   `packet.json` you read. From now on your sealed files are never edited.

## 4. Phase 2 — re-check, compare, receipts

Only after `R-SEAL.json` exists:
1. **Re-check A.** Verify every hidden file's sha256 against `A-RECEIPT.json`
   (`sha256-files.mts heldout-sealed --relative-to <outer shell>`), then run all five kit tools on A's files. Check sizes (`docs/AUTHOR-PACKET.md` section 4), trap floors (`docs/TRAPS.md` sections 1 and 3, against A's
   `TRAPS.md` and gold tags), ten distinct families disjoint from the dev list, attestations present, no symlinks, no file over
   200,000 bytes.
2. **States and dates.** Compare your state files with A's byte for byte, your states and intervals, your query lists and every
   in-force/not-in-force decision. Each difference is a consolidated-state or date-boundary disagreement, resolved as in
   `docs/ADMISSION-PROTOCOL.md` section 4.3 (`a_corrected`, `r_error`, `roy_adjudicated`); **zero may remain unresolved**.
3. **Align** your lines to A's per (queryId, sectionId) by clause-span IoU ≥ 0.5 with the deterministic order of protocol section
   4.2. Before comparing deadlines, recompute your `dueDate`s with **A's** `triggerDates` map for that query.
4. **Compare** fields on aligned pairs (protocol section 4.4): actor `id` or reason; modality; action under the relaxed rule
   (equal `headVerb`, predicate token-F1 ≥ 0.5); deadline `(kind, n, unit, date, eventKey, dueDate)`; `kind`.
5. **Write `admission/CONTESTED.json`** (protocol section 3.3): a JSON array of `{queryId, slotId, field}` using **A's** ids only,
   `field` ∈ `actor|modality|action|deadline|kind`; one entry per disagreeing field on an aligned obligation pair; one `kind` entry
   for an aligned pair whose kinds differ and for every A line you could not align (obligation or negative). Your unaligned lines
   (R-only) are not listed; they are counted in the agreement block. No content, no text, sorted and unique.
6. **Content review.** Read every hidden text; flag any passage that reads as real law or names a real place, person or
   organisation. Run the denylist scan (protocol section 7) and assess each hit.
7. **Write `admission/ADMISSION.json`** (protocol section 3.4) with the metrics of section 4.4, the state-disagreement counts, the
   re-check results, `contested.sha256` and `contested.count` of the exact `CONTESTED.json` bytes, `bindings` to the current
   `A-RECEIPT.json` and `R-SEAL.json`, and your verdict `GO` or `NO-GO` with content-free reasons. Write `ADMISSION.json` only
   when the comparison is complete; until then G1 stays PENDING.

You may write your own comparison scripts outside the inner repo (for example in `relabel-sealed/tools/`); they must not import or
copy builder code, and they never write labels or states.

## 5. Rules you must follow (summary; the cited section governs)

- **Packets** (`docs/PACKET-FORMAT.md`): the validation rules and operation semantics, including the preimage hash definition
  (sha256 of the target section's text just before the amendment's first operation on it).
- **States** (guide section 10): boundaries = `commencesOn`, every distinct `effectiveOn` (applied, failed, unstructured or
  retroactive) and `sunsetExclusive`; `S0`, `S1`, ...; per boundary: retroactive taints, same-day conflicts (intersecting targets
  without different `order` values), `order`-first application, skip on an already tainted target (`dependency_tainted` on the
  rest), failure or `"unstructured"` → `amendment_unapplied`; precedence `amendment_conflict` > `retroactive_unsupported` >
  `amendment_unapplied` > `dependency_tainted`; taints persist; tainted text stays as last applied; pending changes nothing; not in
  force before `commencesOn` and from `sunsetExclusive`.
- **Query dates** (guide section 11): commencement; each state's first day and midpoint; `enactedOn + 1` for amendments with
  `effectiveOn > enactedOn + 1`; `commencesOn − 1`; `sunsetExclusive`; deduplicated and ascending.
- **Labels** (guide sections 3–9): sentence-level clauses; closed triggers and modality map (`may not` → `must_not`, `need not` →
  `need_not`); one obligation line per operative trigger; negative lines by the closed rule N; action, actor, deadline and
  reference rules; field-taint rule; closed unknown reasons; value forms (`normKey`, `eventKey = normKey(anchorText)`, `dueDate`
  by rule, actor `{id, raw}`, modality as a field).
- **Gold contract and contested rule** (guide section 12; protocol section 5): authors write `contested:false`; only your
  `CONTESTED.json` marks contested labels, which scoring then excludes (tuple: contested actor, modality, deadline or kind; action
  fidelity: contested action or kind; field metrics: only that field; a contested `kind` removes the slot from every metric).
- **Thresholds** (protocol section 6): modality agreement ≥ 0.85; tuple agreement (actor, modality, deadline) ≥ 0.70; disputed
  scored fields ≤ 5% (kind disputes included, weighted by the fields they remove); zero unresolved state/date disagreements.

## 6. Author kit command

Node ≥ 22.6; run in place with the inner repo root as the working directory:

```
node --experimental-strip-types tools/author-kit/<tool>.mts ...
```

Tools: `validate-packet.mts`, `check-offsets.mts`, `check-values.mts`, `query-dates.mts`, `sha256-files.mts`; arguments in
`tools/author-kit/README.md`. Where the kit and the guide disagree, the guide governs; record the case in `ADMISSION.json`
`reasons` (content-free).

## 7. Revision round and release review

- If a threshold is missed in round 1, report (without hidden text) which guide sections the disputes fall under. If Roy approves a
  single guide revision, A updates its gold and receipt, and you relabel all ten from the packets under the revised guide (or Roy
  appoints a fresh R), re-seal, compare and write a new `ADMISSION.json` with `round: 2`. A second failure is NO-GO.
- **Release review** (later, explicitly allowed, separate from admission): after the one sealed run you may read the published
  results and README to check that every claim matches the receipts and the generated tables. Your isolation attestation covers
  only the period up to and including `ADMISSION.json`.
