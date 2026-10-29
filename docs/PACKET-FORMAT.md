# S46 Packet Format

Format: `s46.packet.v1`. Readers: the builder, hidden-set author A, relabeller R. This document is self-contained for A and R:
it restates the packet contract, its validation rules, the operation semantics and the file layout. How states are formed from a
packet (boundaries, conflicts, taint) is in `docs/LABELLING-GUIDE.md` section 10; labels are in its sections 3–12. The machine form
of this contract is `schema/packet.schema.json`; where the schema cannot express a rule (duplicate keys, cross-field checks), the
text below governs.

## 1. Packet

```
Packet      = { schemaVersion: "s46.packet.v1", enactment: Enactment }
Enactment   = { id, title, fictionalProvenance, enactedOn, commencesOn, sunsetExclusive, sections: Section[], amendments: Amendment[] }
fictionalProvenance = { author, attestation, license: "CC0-1.0" }
Section     = { sectionId, path, heading, text }
Amendment   = { amendmentId, enactedOn, effectiveOn, order?, instructionText, affectedSectionIds: string[],
                operations: Operation[] | "unstructured" }
Operation   = { op: "replaceText",   sectionId, old, new, preimageSha256? }
            | { op: "insertAfter",   sectionId, anchor, text, preimageSha256? }
            | { op: "addSection",    afterSectionId, section: Section }
            | { op: "repealSection", sectionId, preimageSha256? }
```

- `id`: the enactment id; by convention the folder name (`E01`..`E06` dev, `H01`..`H10` hidden).
- `fictionalProvenance.author`: the author's AgentNamer callsign; `attestation`: a one-sentence originality statement ("Original
  fiction written for S46; no copied text."); `license`: exactly `"CC0-1.0"`.
- Dates are strings `YYYY-MM-DD` (valid Gregorian dates). `sunsetExclusive` is a date or `null` (no sunset).
- `sections` are the **base** top-level sections. `sectionId` matches `^sec-\d+$`; `path` is the display path `Sec. N` (`"Sec. 3"`,
  by convention the same number as the id); `heading` is a short title; `text` is the section body. Subdivisions `(a)` and `(1)`
  live inside `text` (guide section 2).
- `amendmentId`: a short id, unique in the packet (examples use `A1`, `A2`, ...). `order` (optional) is an integer used only to
  order amendments that share an `effectiveOn` (guide section 10). `instructionText` is the human-written instruction, kept for
  display; it is never parsed. `operations` is a non-empty array, or the string `"unstructured"` when the amendment has prose
  only (an unstructured amendment is never applied and taints its targets `amendment_unapplied`).
- `affectedSectionIds`: the amendment's **target set**, declared by the author.

**Op targets.** `replaceText`, `insertAfter` and `repealSection` target `sectionId`. `addSection` targets the new
`section.sectionId`; its `afterSectionId` is used only for display order.

## 2. Validation (a packet failing any rule is rejected as invalid; nothing is processed)

1. **Strict JSON.** Duplicate keys in any object are rejected (a custom parser checks this; ordinary JSON parsing would hide it).
   Unknown keys at any level are rejected. Nesting depth (objects and arrays) greater than 8 is rejected. Strings containing a lone
   UTF-16 surrogate are rejected.
2. **Literals.** `schemaVersion` = `"s46.packet.v1"`; `license` = `"CC0-1.0"`; `op` is one of the four names; `operations` is
   `"unstructured"` or a non-empty array; `old`, `anchor` and the `text` of `insertAfter` are non-empty; `preimageSha256` is 64
   lowercase hex characters.
3. **Ids.** `sectionId` matches `^sec-\d+$` and `path` matches `^Sec\. \d+$` (base and added sections). No duplicate base
   `sectionId`; no `sectionId` added by more than one `addSection`; no duplicate `amendmentId`. `enactment.id` and `amendmentId`
   match `^[A-Za-z][A-Za-z0-9_-]{0,63}$`; `order` is a non-negative integer; `title`, section `text` and `instructionText` are
   non-empty.
4. **Targets.** `affectedSectionIds` is non-empty and repeats no id, for every amendment. Every op target is listed in its amendment's
   `affectedSectionIds`; otherwise the packet is invalid (not merely tainted). Every id in `affectedSectionIds` and every
   `afterSectionId` is a base section id or is added by some `addSection` in the packet; otherwise invalid. (A target that exists
   in the packet but is absent when the amendment is applied, for example repealed earlier, is an ordinary operation failure,
   not a validation error.)
5. **Dates.** All dates valid `YYYY-MM-DD`; `sunsetExclusive > commencesOn` when not null. For every amendment:
   `effectiveOn ≥ commencesOn`; `effectiveOn < sunsetExclusive` when the sunset is not null; `enactedOn ≥ enactment.enactedOn`.
   (`effectiveOn < amendment.enactedOn` is allowed: it marks a retroactive amendment, which is never applied.)
6. **Caps.** Packet file ≤ 128 KiB (131,072 bytes of UTF-8); sections ≤ 12 (base plus added); amendments ≤ 6; states ≤ 7
   (states = 1 + distinct `effectiveOn` values other than `commencesOn`); candidate clauses ≤ 30 per query (counted by the reader
   with the guide's candidate rule). Authoring sizes are much smaller (`docs/AUTHOR-PACKET.md`).
7. **Text.** Strings are kept byte-exact: no trimming, Unicode normalisation or line-ending conversion. Use `\n` line breaks only
   (CRLF and unusual Unicode belong to unit tests, not to authored packets).

Conventions used everywhere: offsets are **section-local UTF-16 code-unit, half-open** `[start, end)`; hashes are **SHA-256 over
the UTF-8 bytes, lowercase hex** (64 characters).

## 3. Operation semantics

An amendment's operations run **in array order on a copy** of the current state, and are **atomic**: if any operation fails, none
of that amendment's changes is kept (the guide's section 10 says which taint follows).

| Op | Succeeds when | Effect |
|---|---|---|
| `replaceText` | target present; `old` non-empty and occurs exactly once in the target's current text; preimage matches if given | the single occurrence of `old` is replaced by `new`, **verbatim** (`new` may be `""`, which deletes) |
| `insertAfter` | target present; `anchor` non-empty and occurs exactly once; preimage matches if given | `text` is inserted **verbatim** immediately after the end of `anchor` (include any leading space yourself) |
| `addSection` | `section.sectionId` absent from the current state | the section is added; it is displayed after `afterSectionId` if that section is present in the current state, else at the end |
| `repealSection` | target present; preimage matches if given | the section is removed from the state (no file in later states) |

- "Occurs exactly once" counts every start position where the string matches the current text exactly (UTF-16 code units; no
  case folding, no whitespace folding; overlapping matches count). "Current text" includes the changes made by earlier
  operations of the same amendment.
- **preimageSha256** = sha256 of the UTF-8 bytes of the target section's **full text immediately before this amendment's first
  operation on that section**. It is checked only when present. If several operations of one amendment touch the same section,
  each `preimageSha256` they carry refers to that same pre-amendment text, not to an intermediate result. It catches an amendment
  written against the wrong state.
- Operations never renumber sections or subdivisions.

## 4. Files

### 4.1 Enactment folder

```
<enactmentId>/
  packet.json                          the packet (UTF-8, no BOM)
  states/<stateId>/<sectionId>.txt     hand-written consolidated text, one file per section present in that state
  gold.jsonl                           expected lines (guide section 12)
  TRAPS.md                             which traps this enactment plants and where (docs/TRAPS.md section 4)
```

Locations: dev `fixtures/dev/E01..E06/` (inner repo); hidden `heldout-sealed/H01..H10/` (outer shell, author A only); R's own
work `relabel-sealed/H01..H10/` (outer shell, R only; `states/` plus R's own `gold.jsonl`, see `docs/RELABELLER-PACKET.md`).

### 4.2 State files

- `stateId` folders are `S0`, `S1`, ... as defined in the guide (section 10). Every state has a folder, even when its text equals
  the previous state's (for example a state that only adds a taint).
- One file per section **present** in the state (repealed sections have no file; added sections appear from the state where they
  are added). Tainted sections are present, with their text as last applied.
- The file holds **exactly** the section's text bytes in UTF-8: no BOM, no trailing newline unless the text itself ends with one,
  `\n` line breaks only. A file's content must equal what the operations produce, but it is **written by hand**, never generated.
- In the inner repo `.gitattributes` marks `fixtures/** -text`, so git never converts these bytes. Outside the repo, use an editor
  setting that preserves LF and adds no final newline.

## 5. Example

`X01` is an illustration only (it is not a dev or hidden enactment). Its states and labels are worked through in the guide
(sections 11 and 12.1).

```json
{
  "schemaVersion": "s46.packet.v1",
  "enactment": {
    "id": "X01",
    "title": "Quillmere Mobile Vendor Ordinance (example)",
    "fictionalProvenance": {
      "author": "<author callsign>",
      "attestation": "Original fiction written for S46; no copied text.",
      "license": "CC0-1.0"
    },
    "enactedOn": "2026-01-10",
    "commencesOn": "2026-02-01",
    "sunsetExclusive": "2027-02-01",
    "sections": [
      { "sectionId": "sec-1", "path": "Sec. 1", "heading": "Definitions",
        "text": "In this ordinance, \"vendor\" means a person who sells prepared food from a mobile cart." },
      { "sectionId": "sec-2", "path": "Sec. 2", "heading": "Permits",
        "text": "(a) A vendor shall renew the vendor permit within thirty (30) calendar days after the date the permit expires.\n(b) A vendor may not park a food cart in Quillmere Square.\n(c) Renewal applications shall be filed with the Village Clerk." },
      { "sectionId": "sec-3", "path": "Sec. 3", "heading": "Exemptions",
        "text": "A vendor need not renew a permit that is surrendered." },
      { "sectionId": "sec-4", "path": "Sec. 4", "heading": "Short title",
        "text": "This ordinance may be cited as the Quillmere Mobile Vendor Ordinance." }
    ],
    "amendments": [
      { "amendmentId": "A1", "enactedOn": "2026-03-01", "effectiveOn": "2026-04-01",
        "instructionText": "In Sec. 2(a), strike \"thirty (30)\" and insert \"forty-five (45)\".",
        "affectedSectionIds": ["sec-2"],
        "operations": [
          { "op": "replaceText", "sectionId": "sec-2", "old": "thirty (30)", "new": "forty-five (45)",
            "preimageSha256": "d71a1a7265b6842cba35b88ba56b32be9ab9f2442750517a669dfac079fda068" }
        ] },
      { "amendmentId": "A2", "enactedOn": "2026-05-01", "effectiveOn": "2026-07-01",
        "instructionText": "Sec. 3 is amended to exempt seasonal vendors from renewal.",
        "affectedSectionIds": ["sec-3"],
        "operations": "unstructured" },
      { "amendmentId": "A3", "enactedOn": "2026-08-15", "effectiveOn": "2026-06-01",
        "instructionText": "In Sec. 1, after \"mobile cart\" insert \" or a food truck\".",
        "affectedSectionIds": ["sec-1"],
        "operations": [
          { "op": "insertAfter", "sectionId": "sec-1", "anchor": "mobile cart", "text": " or a food truck" }
        ] }
    ]
  }
}
```

The preimage hash of A1 is the sha256 of Sec. 2's base text (the text in state S0). Resulting states (guide section 10):

| State | Interval | Text changes | Taints | Files |
|---|---|---|---|---|
| S0 | 2026-02-01 – 2026-03-31 | base text | none | `states/S0/sec-1.txt` .. `sec-4.txt` |
| S1 | 2026-04-01 – 2026-05-31 | Sec. 2(a) reads "forty-five (45)" | none | four files; only `sec-2.txt` differs from S0 |
| S2 | 2026-06-01 – 2026-06-30 | none (A3 is retroactive, never applied) | Sec. 1 `retroactive_unsupported` | four files, same text as S1 |
| S3 | 2026-07-01 – 2027-01-31 | none (A2 is unstructured) | Sec. 1 as S2; Sec. 3 `amendment_unapplied` | four files, same text as S1 |

Further operation shapes:

```json
{ "op": "addSection", "afterSectionId": "sec-2",
  "section": { "sectionId": "sec-5", "path": "Sec. 5", "heading": "Fees", "text": "A vendor shall pay a renewal fee of forty dollars." } }
{ "op": "repealSection", "sectionId": "sec-3", "preimageSha256": "<sha256 of Sec. 3's text before this amendment>" }
```

An `addSection` amendment lists the new id (`"sec-5"`) in its `affectedSectionIds`; a later amendment may then target `sec-5`.
