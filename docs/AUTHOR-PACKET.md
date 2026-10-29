# S46 Author Packet (hidden-set author A)

You are **author A**: you write the ten hidden fictional enactments H01–H10, hand-write every consolidated state, write their
expected lines (gold), check them with the author kit, and record a receipt. Your work is the held-out test set; the builder never
sees it before a frozen, one-time evaluation. Nothing has been run or measured; do not report or imply any result.

## 1. Who may be A

- Appointed by **Roy** (owner). The project's plan does not appoint anyone, including its planning agents.
- **Outside the cumulative builder lineage**: neither predecessor `0805_Claude_Opus55_S46INT`, successor
  `0914_Codex_GPT-6_N20CodexInt46`, nor resumed builder `0950_Codex_gpt-6_N20CodexInt46`, nor any descendant through parent or fork links of any root. Succession adds roots;
  it never removes an earlier builder.
- **Different harness from every builder root.** The exact registry roots currently use `Claude` and `Codex`, so A uses
  another harness (for example Grok, Cursor or Antigravity). A fresh Claude or Codex session is still ineligible as A.
- Registry identity and ancestry must be complete: missing roots/ancestors, missing lineage columns, cycles or exhausted
  traversal leave eligibility **PENDING**, never inferred from a callsign or from the `noBuilderLineage` attestation alone.
- Not the relabeller R.
- Claims an AgentNamer callsign in `C:\Users\Roy Harden\OneDrive\PJ-OD\Bolt.New\.agent-registry\` and uses it as `labeller` and
  `fictionalProvenance.author`.

## 2. Inputs and access limits

Inner repo root: `C:\Users\Roy Harden\OneDrive\PJ-OD\Bolt.New\civic-obligation-reader\civic-obligation-reader\`. You receive and
may read **only** these frozen materials:

| Material | Path (inner repo) |
|---|---|
| Labelling guide | `docs/LABELLING-GUIDE.md` |
| Packet format | `docs/PACKET-FORMAT.md` |
| Trap catalogue | `docs/TRAPS.md` |
| Admission protocol (receipt shapes) | `docs/ADMISSION-PROTOCOL.md` |
| This packet | `docs/AUTHOR-PACKET.md` |
| Schemas | `schema/packet.schema.json`, `schema/gold.schema.json` |
| Author kit | `tools/author-kit/` (its `README.md` and the five `.mts` tools) |

Outside the repo you may read `heldout-sealed/README.md` and `admission/README.md` in the outer shell, and you write only in
`heldout-sealed/` and `admission/A-RECEIPT.json`.

You must **never** open the repo's `src/`, `eval/`, `scripts/`, `tests/`, `fixtures/`, any prompt, recorded model response, results
or other system output, the outer `relabel-sealed/`, `planning/`, `agentops/`, `.thinking/`, `.chatexports/`, `PLAN.md` or any other
file not listed above. You attest to this in your receipt. You never discuss hidden content with the builder lineage.

## 3. Topic families

The six **dev** families are taken; do not use them or near variants:
1. mobile food vendors
2. library kiosks
3. well-water sampling
4. park permits
5. dog-licence renewals
6. short-term parking

Choose **ten families of your own**: distinct from each other and from the list above, each a plausible local-government topic
(for example a fictional town's rule on something), with no shared template or copied structure across enactments. Record them in
your receipt. One family per enactment.

## 4. Sizes and coverage

Per enactment:
- 4–10 base sections (at most 12 including added sections); `Sec. N` numbering with at most `(a)` and `(1)` below it;
- 2–3 amendments, giving 3–4 states;
- 5–12 operative clauses (clauses that yield at least one obligation line) in each state; at most 30 candidate clauses;
- fictional places and bodies only (for example "Village of Quillmere", "the Harbor Board"); ASCII text recommended.

Across the ten enactments, the trap floors of `docs/TRAPS.md` (with its counting rules):
- **≥ 2 enactments each**: T1, T2, T3, T4, T5, T9, T12, T13, T15;
- **≥ 1 enactment each**: T6, T7, T8, T10, T11, T14, T18, T19;
- do **not** plant T16, T17 or T20 (they are unit tests; hidden packets must be valid, LF-only).

## 5. What to write

For each `Hnn` in `heldout-sealed/Hnn/` (layout in `docs/PACKET-FORMAT.md` section 4):
1. `packet.json`: `enactment.id` = `Hnn`; `fictionalProvenance` = your callsign, a one-sentence originality attestation,
   `"CC0-1.0"`; every amendment with its `instructionText`, `affectedSectionIds` and operations (or `"unstructured"`).
2. Compute by hand, before writing any state: the boundaries and states (guide section 10) and the query dates (guide section 11).
3. `states/<stateId>/<sectionId>.txt` for **every** state and every section present in it, **written by hand**. Never produce state
   text with any applier, script or automated find-and-replace; the kit only checks.
4. `gold.jsonl` per the gold contract (guide section 12): one line per (query, slot), `split:"hidden"`,
   `provenance:"hidden-author-A"`, `labeller` = your callsign, `contested:false`, traps tagged per `docs/TRAPS.md`.
5. `TRAPS.md` per `docs/TRAPS.md` section 4.

## 6. Rules you must follow (summary; the cited section governs)

- **Packet and validation** (`docs/PACKET-FORMAT.md` sections 1–3): strict JSON, no unknown or duplicate keys, depth ≤ 8, no lone
  surrogates; ids `sec-N`; every op target listed in `affectedSectionIds` (non-empty); targets and `afterSectionId` exist in the
  packet; `effectiveOn ≥ commencesOn`, `effectiveOn < sunsetExclusive`, amendment `enactedOn ≥` enactment `enactedOn`; caps
  128 KiB / 12 sections / 6 amendments / 7 states; operations atomic, `old`/`anchor` non-empty and occurring exactly once,
  insertions and replacements verbatim; `preimageSha256` = sha256 of the target section's text just before the amendment's first
  operation on it.
- **States** (guide section 10): boundaries = `commencesOn`, every distinct `effectiveOn`, `sunsetExclusive`; states `S0`, `S1`, ...;
  at each boundary: retroactive taints, then same-day conflicts (intersecting targets without different `order` values → neither
  applied, `amendment_conflict`), then `order`-first application, skipping amendments with an already tainted target
  (`dependency_tainted` on the rest); failure or `"unstructured"` → `amendment_unapplied`. Precedence `amendment_conflict` >
  `retroactive_unsupported` > `amendment_unapplied` > `dependency_tainted`. Taints persist; tainted text stays as last applied.
  Pending changes nothing; `asOf < commencesOn` or `≥ sunsetExclusive` → not in force.
- **Query dates** (guide section 11): commencement; each state's first day and midpoint (a + floor((b − a)/2) for `[a, b)`, a + 30
  days when open-ended); `enactedOn + 1` for each amendment with `effectiveOn > enactedOn + 1`; `commencesOn − 1`;
  `sunsetExclusive`. Deduplicated, ascending; exactly these.
- **Fields** (guide sections 5–8): one obligation line per operative trigger; negative lines by the closed rule N (every clause with
  a trigger word but no obligation, and every injected instruction); modality map with `may not` → `must_not` and `need not` →
  `need_not`; action = complete predicate after the trigger, before a separately marked deadline or condition, including its
  object; actor rules; the four deadline forms; one-hop references; field-taint rule; closed unknown reasons.
- **Value forms** (guide section 9): `normKey`; `eventKey = normKey(anchorText)` and `anchorText` always present with `eventKey`;
  one `triggerDates` map per query on every line of that query; `dueDate` by rule only; actor `{id, raw}`; modality as a field.
- **Gold contract** (guide section 12): stable `slotId` `<enactmentId>/<sectionId>/<n>`, `no_rows` slotId
  `<enactmentId>/none/0`; you always write `contested:false` (only R lists contested labels, in `admission/CONTESTED.json`).
- **Admission thresholds** (`docs/ADMISSION-PROTOCOL.md` section 6): your labels and R's blind labels must reach modality agreement
  ≥ 0.85, tuple agreement ≥ 0.70, ≤ 5% disputed scored fields and zero unresolved state/date disagreements. Label strictly by the
  guide; when it is silent, choose the reading the guide's closest rule implies and note it in `TRAPS.md`.

## 7. Author kit

Requires Node ≥ 22.6. Run each tool **in place**, with the inner repo root as the working directory, exactly as:

```
node --experimental-strip-types tools/author-kit/<tool>.mts ...
```

| Tool | Checks |
|---|---|
| `validate-packet.mts` | packet validation (section 6 above) |
| `check-offsets.mts` | gold-line shape (only the thirteen gold reasons; `subdivision` on obligation and negative lines), `(queryId, slotId)` uniqueness, one map and one `stateId` per query, and every span: `stateText.slice(start, end)` equals the quoted text, action `evidenceSpan` = `predicateSpan`, a `none_stated` deadline's `evidenceSpan` = `clauseSpan` |
| `check-values.mts` | recomputes `eventKey`, `dueDate`, `anchorText` presence, the one-map-per-query rule and `actor.id`: the defined term (`normKey` of the term as written in its definition) when the subject without one leading article or determiner (`each`, `every`, `any`, `all`, `no`, `such`) equals a term defined in that state or that term plus `s`/`es`, otherwise `normKey(raw)`; checks that `headVerb` is one `[a-z0-9]` token of the predicate (it does not check that it is the first verb, nor whether the defining section is tainted) |
| `query-dates.mts` | recomputes the query dates of each packet and compares them with the gold queries |
| `sha256-files.mts` | prints `{path, sha256}` for every file under a folder (use `--relative-to <outer shell>`), and lists symlinks and files over 200,000 bytes |

Arguments and output formats are in `tools/author-kit/README.md`. The kit imports nothing from the product code and never writes
your files. Compute states and query dates by hand **first**, then compare with the kit. If the kit and the guide disagree, the
guide governs: keep the guide's answer and record the case in `kitDisagreements` (content-free).

## 8. Originality and licence

All text is original fiction written for this task: no copied text, no real jurisdiction, statute, person, company or organisation,
no real-looking citations. Avoid every denylist term (`docs/ADMISSION-PROTOCOL.md` section 7). Injected-instruction text (T11) is
benign: no links, code, credentials or real exploit strings. Everything you write is released under **CC0-1.0**.

## 9. Receipt

When all ten enactments pass the kit, write `admission/A-RECEIPT.json` exactly in the shape of `docs/ADMISSION-PROTOCOL.md` section
3.1. Abridged example (a real receipt lists ten families and ten enactments):

```json
{
  "schemaVersion": "s46.a-receipt.v1",
  "authorCallsign": "<A callsign>",
  "harness": "Grok",
  "model": "<model>",
  "registry": "C:/Users/Roy Harden/OneDrive/PJ-OD/Bolt.New/.agent-registry",
  "writtenAt": "2026-11-02T15:04:05Z",
  "appointment": "<how and when Roy appointed A>",
  "materials": [ { "path": "docs/LABELLING-GUIDE.md", "sha256": "<sha256>" },
                 { "path": "docs/PACKET-FORMAT.md", "sha256": "<sha256>" } ],
  "guideSha256": "<sha256>",
  "node": "v22.12.0",
  "families": ["<family 1>"],
  "devFamiliesAvoided": ["mobile food vendors", "library kiosks", "well-water sampling", "park permits",
                         "dog-licence renewals", "short-term parking"],
  "enactments": [
    { "id": "H01", "family": "<family 1>", "sections": 6, "amendments": 3, "states": 4, "queries": 11,
      "operativeClauses": 7, "operativeClausesPerState": { "S0": 7, "S1": 8, "S2": 8, "S3": 7 },
      "goldLines": { "obligation": 70, "negative": 9, "no_rows": 2 },
      "traps": ["T1", "T3", "T4", "T12"],
      "files": [ { "path": "heldout-sealed/H01/gold.jsonl", "sha256": "<sha256>" },
                 { "path": "heldout-sealed/H01/packet.json", "sha256": "<sha256>" } ] }
  ],
  "checks": { "validatePacket": { "ok": true, "runs": 10, "problems": 0 },
              "checkOffsets": { "ok": true, "runs": 10, "problems": 0 },
              "checkValues": { "ok": true, "runs": 10, "problems": 0 },
              "queryDates": { "ok": true, "runs": 10, "problems": 0 } },
  "trapCoverage": { "T1": ["H01"] },
  "totals": { "enactments": 10, "files": 172, "goldLines": 812 },
  "kitRuns": [ { "tool": "check-offsets.mts", "args": "<args>", "exitCode": 0, "summary": "<counts>" } ],
  "kitDisagreements": [],
  "attestation": { "original": true, "fictional": true, "handWrittenStates": true, "noGeneratedText": true,
                   "noBuilderLineage": true, "noRepoAccess": true, "license": "CC0-1.0", "statement": "<A's statement>" }
}
```

After your receipt, R works blind from your `packet.json` files. If R reports a consolidated-state or date-boundary disagreement
that is your error, correct your files, re-run the kit and re-issue your receipt. In the single allowed guide-revision round you
update your gold to the revised guide and re-issue the receipt.
