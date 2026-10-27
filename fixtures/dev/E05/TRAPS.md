# E05 traps

Pellam Ridge Dog Licence Ordinance (Borough of Pellam Ridge, fictional). Family: dog-licence renewals. Dev fixture,
`dev-builder-authored`. States: S0 [2026-03-01, 2026-05-01), S1 [2026-05-01, 2026-07-01), S2 [2026-07-01, open).
Queries: 2026-02-28 (not in force), 03-01, 03-31, 05-01, 05-31, 07-01, 07-31.

| Trap | Where (sections, amendments) | Queries (asOf) | Expected handling |
|---|---|---|---|
| T6 | Sec. 2(c) "An owner need not license a guide dog." | all in-force queries | `need_not`, never `may` |
| T8 | Sec. 2(a) "... within thirty (35) calendar days after the licence expires." | all in-force queries | Deadline `conflicting_figures` |
| T9 | A2 (effective 2026-07-01) deletes the Sec. 1(b) definition of "handler" (`replaceText` with `new: ""`) | all in-force queries | `E05/sec-3/2` actor `{id:"handler"}` in S0/S1, `actor_undefined` in S2 |
| T12 | A1 (effective 2026-05-01) is a structured `replaceText` on Sec. 4 whose `old` ("fifteen dollars") does not occur in Sec. 4 | 05-01, 05-31, 07-01, 07-31 | Operation fails; nothing applied; Sec. 4 text stays as in S0; every field of `E05/sec-4/1` and `E05/sec-4/2` is `amendment_unapplied` |
| T15 | Sec. 3(b) "A handler shall carry ..." identical in S1 and S2 while its actor's definition is removed | all in-force queries | Actor known in S1, `actor_undefined` in S2 (same quote, changed value) |
| T19 | Sec. 3(a) "Except as provided in Sec. 5, ..."; Sec. 5 reads "... under Sec. 6." (a second hop) | all in-force queries | Modality `reference_depth` in every state; actor, action and absolute deadline stay known |

Other: Sec. 6 is an ordinary `may` slot (the second hop's target; it contains no reference). Sec. 7 short title -> `negative`,
`non_operative`. No relative deadline in this enactment, so every query's `triggerDates` is `{}`. A2 carries `preimageSha256`.
