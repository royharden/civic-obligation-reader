# E01 traps

Larkspur Bend Mobile Food Vendor Ordinance (Town of Larkspur Bend, fictional). Family: mobile food vendors. Dev fixture,
`dev-builder-authored`; the demo fixture. States: S0 [2026-02-01, 2026-04-01), S1 [2026-04-01, 2026-06-01), S2 [2026-06-01, open).
Queries: 2026-01-31 (not in force), 02-01, 03-02, 04-01, 05-01, 06-01, 07-01.

| Trap | Where (sections, amendments) | Queries (asOf) | Expected handling |
|---|---|---|---|
| T1 | Sec. 3(a); A2 (`replaceText` "thirty (30)" -> "forty-five (45)", effective 2026-04-01). Also Sec. 4(a); A3 ("ten (10)" -> "seven (7)", effective 2026-06-01) | all in-force queries | Slot `E01/sec-3/1`: n 30 in S0, n 45 from S1, same slotId. Slot `E01/sec-4/1`: n 10 in S0/S1, n 7 in S2 |
| T3 | A1 and A2 enacted 2026-03-01, effective 2026-04-01; A3 enacted 2026-04-30, effective 2026-06-01 | 2026-03-02 (A1, A2 pending); 2026-05-01 (A3 pending) | Pending days keep the pre-amendment values: 03-02 shows n 30 and known Sec. 5 fields; 05-01 shows n 10. Tagged on `E01/sec-3/1`, `E01/sec-5/1`, `E01/sec-5/2` at 03-02 and `E01/sec-4/1` at 05-01 |
| T6 | Sec. 2(b) "may not"; Sec. 3(c) "need not"; Sec. 5(a) "No vendor shall"; Sec. 5(b) "may" | S0 for Sec. 5; all in-force queries for Sec. 2(b), 3(c) | `must_not`, `need_not` (absence of duty, not permission), `must_not` (span "No vendor shall", actor "vendor"), `may` |
| T7 | Sec. 3(a) and Sec. 4(a): resolvable anchors with no trigger date on some queries | 02-01 (both), 04-01 (Sec. 4(a)), 06-01 (both) | `dueDate: null` because `triggerDates` has no entry for the eventKey; other queries give a trigger date and a computed dueDate |
| T9 | Sec. 1 "vendor" redefined by A3 (adds "or a food truck"), effective 2026-06-01 | all in-force queries | Actor stays `{id:"vendor"}` (only the meaning changed); tagged on every slot whose actor is "vendor" while its fields are known. Also the T17 (stale ruling) set-up used by UI tests: Sec. 2(a)'s quote is unchanged S1 -> S2 while its actor's definition text changes |
| T10 | Sec. 3(b) "Renewal applications shall be filed with the Town Clerk." | all in-force queries | Actor `actor_unstated`; action "be filed with the Town Clerk", headVerb `be` |
| T12 | A1 is `"unstructured"` and targets Sec. 5, effective 2026-04-01 | 04-01, 05-01, 06-01, 07-01 | Sec. 5 text stays as in S0; every field of `E01/sec-5/1` and `E01/sec-5/2` is `amendment_unapplied` |

Other: Sec. 6 short title -> one `negative` line, `non_operative`. Amendments A2 and A3 carry `preimageSha256`. A1 and A2 share an
effective date with disjoint targets (no conflict). No sunset (no T4 tag on the pre-commencement `no_rows` line).
