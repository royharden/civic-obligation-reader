# Author kit

Five standalone checkers for whoever writes or re-checks enactment packets and gold labels: the hidden-set author (A),
the relabeller (R) and the dev-fixture builder. Each tool is ONE self-contained TypeScript file that uses only Node
built-ins (`node:fs`, `node:path`, `node:crypto`). They import nothing from the application (`src/`, `eval/`) and
nothing from each other, so you can copy this folder anywhere and run it without the rest of the repository.

Requirements: Node.js 22.6 or later (type stripping). No `npm install` is needed.
On Node 23.6 or later the `--experimental-strip-types` flag is accepted but no longer required.

## Folder layout the tools expect

```
<enactmentDir>/
  packet.json                         one packet (docs/PACKET-FORMAT.md, schema/packet.schema.json)
  states/<stateId>/<sectionId>.txt    hand-written consolidated text, one file per non-repealed section,
                                      exact UTF-8 bytes, LF only, no BOM, no trailing newline unless part of the text
  gold.jsonl                          one JSON object per line (schema/gold.schema.json), LF line endings
```

All offsets are section-local UTF-16 code units, half-open `[start, end)`. All hashes are SHA-256 over the exact bytes,
lowercase hex.

## Commands

Run from the repository root (or replace `tools/author-kit/` with wherever you copied the folder).
Add `--json` to any tool except `sha256-files` (which always prints JSON) to get machine-readable output for a receipt.

| Step | Command | What it checks |
|---|---|---|
| 1 | `node --experimental-strip-types tools/author-kit/validate-packet.mts <enactmentDir> [...]` | Packet rules: size <= 128 KiB; strict UTF-8 and strict JSON (duplicate keys, depth <= 8, lone surrogates); no unknown or missing keys; ids; real dates; caps (12 sections, 6 amendments, 7 states); unique ids; `affectedSectionIds` non-empty, known and covering every op target; `effectiveOn` >= `commencesOn` and < `sunsetExclusive`; amendment `enactedOn` >= enactment `enactedOn`. |
| 2 | `node --experimental-strip-types tools/author-kit/check-offsets.mts <enactmentDir> [...]` | Every gold line's shape (including `provenance`: `hidden-author-A` for A's gold, `hidden-relabeller-R` with `triggerDates: {}` for R's blind labels; only the thirteen gold unknown reasons; `subdivision` on obligation and negative lines; action `evidenceSpan` = `predicateSpan`; a `none_stated` deadline's `evidenceSpan` = `clauseSpan`); `(queryId, slotId)` unique; one `triggerDates` map and one `stateId` per query; `no_rows` alone in its query; every span slices the hand-written state text exactly (`clauseText`, actor `raw`, object, deadline `anchorText`, predicate span) and every `evidenceSpan`/`predicateSpan` lies inside `clauseSpan`. |
| 3 | `node --experimental-strip-types tools/author-kit/check-values.mts <enactmentDir> [...]` | Derived values: `eventKey = normKey(anchorText)`; `anchorText` present whenever `eventKey` is; `actor.id` recomputed (the defined term's `normKey` when the subject without one leading article or determiner `each`/`every`/`any`/`all`/`no`/`such` equals a term defined in that state or that term plus `s`/`es`, otherwise `normKey(raw)`); `dueDate` rule; `headVerb` is one token of the predicate (tokens = maximal `[a-z0-9]` runs after lowercasing); trigger keys normalised; one `triggerDates` map per query. |
| 4 | `node --experimental-strip-types tools/author-kit/query-dates.mts <enactmentDir> [...]` | Computes the states and required query dates from the packet metadata and compares them with the queries and `stateId`s in `gold.jsonl`. |
| 5 | `node --experimental-strip-types tools/author-kit/sha256-files.mts <folder> [--relative-to <dir>]` | SHA-256 of every file under `<folder>`, sorted, as JSON for a receipt's `files: [{path, sha256}]`; lists symlinks and files over 200000 bytes. |

Variants:

```
node --experimental-strip-types tools/author-kit/check-offsets.mts --gold <gold.jsonl> --states <statesDir> [--json]
node --experimental-strip-types tools/author-kit/query-dates.mts --packet <packet.json> [--gold <gold.jsonl>] [--json]
```

Exit codes: `0` clean, `1` problems found (or, for `sha256-files`, symlinks/oversize files present), `2` usage error.

Relabeller R checks its own blind labels in place (`relabel-sealed/Hnn/` holds `states/` and `gold.jsonl`):

```
node --experimental-strip-types tools/author-kit/check-offsets.mts --gold <relabel-sealed/Hnn/gold.jsonl> --states <relabel-sealed/Hnn/states>
node --experimental-strip-types tools/author-kit/check-values.mts <relabel-sealed/Hnn>
node --experimental-strip-types tools/author-kit/query-dates.mts --packet <heldout-sealed/Hnn/packet.json> --gold <relabel-sealed/Hnn/gold.jsonl>
```

## Rules the tools apply (summary)

- `normKey(text)`: lowercase; collapse every run of whitespace to one space; trim; strip trailing `.`, `,`, `;`, `:`
  characters; trim again; strip one leading article (`the `, `a `, `an `).
- `dueDate`: `absolute` gives `date`; `relative_calendar_days` gives the trigger date plus `n` calendar days (trigger
  day excluded) when `triggerDates[eventKey]` exists, otherwise `null`; `before_event` and `none_stated` give `null`.
- States: boundaries are `commencesOn`, every distinct amendment `effectiveOn` (applied, failed, unstructured or
  retroactive alike) and `sunsetExclusive`; a state is the half-open interval between consecutive boundaries inside
  `[commencesOn, sunsetExclusive)`, numbered `S0`, `S1`, ... in date order.
- Query dates (deduplicated, ascending): `commencesOn`; each state's first day and midpoint
  (`a + floor((b - a) / 2)` for a bounded state `[a, b)`, including a last state ended by `sunsetExclusive`;
  `a + 30` for an open-ended last state); the day after enactment for each amendment with
  `effectiveOn > enactedOn + 1`; the day before `commencesOn`; `sunsetExclusive` itself.
- Gold: authors always write `contested: false`; contested labels are listed only by the relabeller in
  `admission/CONTESTED.json`. Every `evidenceSpan` and `predicateSpan` lies inside `clauseSpan`.

## What the tools do not check

These guide rules need judgement or the packet's taint computation, so the kit leaves them to the labeller:

- `headVerb` is the **first verb** of the predicate (guide 6.2). `check-values` only checks that it is one token of the
  predicate; it prints a `note` (not a mismatch) when a token before it is neither an `-ly` token nor one of `also`,
  `only`, `then`, `thereafter`, `forthwith`, `again` and no comma precedes it.
- Taint and in-force status of a defining section: a defined-term actor whose definition sits in a tainted section is
  `dependency_tainted`, and one defined only in another state is `actor_undefined` (guide 6.1). `check-values` compares
  a known `actor.id` with the terms defined in the line's own state files only.
- Which clauses need lines (rule N), clause boundaries, modality, the action boundary and every unknown reason's
  applicability (guide sections 3–8); the 30-candidate cap (`docs/PACKET-FORMAT.md`).

The authoritative rule text is in `docs/LABELLING-GUIDE.md` and `docs/PACKET-FORMAT.md`; if a tool and a document
disagree, report it rather than working around it.

## Receipts

Eligibility uses the cumulative builder roots `0805_Claude_Opus55_S46INT` (Claude) and
`0914_Codex_GPT-6_N20CodexInt46` (Codex), plus their parent/fork descendants. A must use a harness other than every builder
root's (currently neither Claude nor Codex). R may use any harness but must be outside every builder root and distinct from A
in both ancestry directions. Succession adds roots without removing predecessors. `admit.ts` uses exact registry identities;
missing/ambiguous records or lineage columns, missing ancestors, cycles and exhausted traversal yield PENDING. Attestations do
not replace registry evidence. These five kit tools check labels and packets; they do not establish actor eligibility.

`docs/ADMISSION-PROTOCOL.md` defines the receipts. A records each tool's `--json` result in
`admission/A-RECEIPT.json` (`checks.validatePacket`, `checks.checkOffsets`, `checks.checkValues`,
`checks.queryDates`), each as `{ "ok": <exit code 0 on every run>, "runs": int, "problems": int }`, together with the
`sha256-files --relative-to <outer shell>` output for its files. R re-runs the same tools on A's files and records them
under `recheck` in `admission/ADMISSION.json`.
