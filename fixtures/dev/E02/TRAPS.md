# E02 traps

Fenwick Hollow Book Kiosk Ordinance (Village of Fenwick Hollow, fictional). Family: library kiosks. Dev fixture,
`dev-builder-authored`. States: S0 [2026-04-01, 2026-07-01), S1 [2026-07-01, 2026-10-01), S2 [2026-10-01, 2027-04-01).
Queries: 2026-03-31 and 2027-04-01 (not in force), 04-01, 05-16, 07-01, 08-16, 10-01, 12-31.

| Trap | Where (sections, amendments) | Queries (asOf) | Expected handling |
|---|---|---|---|
| T2 | Sec. 3(a) "Except as provided in Sec. 5, ..."; A2 repeals Sec. 5, effective 2026-10-01 | all in-force queries | Before the repeal the clause-level exception resolves (modality `must`); from S2 the modality is `crossref_repealed`; other fields stay known |
| T4 | `sunsetExclusive` 2027-04-01; commencement 2026-04-01 after enactment 2026-03-10 | 2026-03-31, 2027-04-01 | One `no_rows` line each |
| T5 | Sec. 4(a) "Except as provided in Sec. 6, the Library Board shall inspect each kiosk ..."; A1 inserts Sec. 6(b) "The Library Board need not inspect a kiosk that is housed inside the Village Hall." (effective 2026-07-01) | all in-force queries | `E02/sec-4/1` keeps its values in every state (labels never decide applicability); new slot `E02/sec-6/1` (`need_not`) appears from S1 |
| T6 | Sec. 3(c) "may not"; Sec. 6(b) "need not" | all in-force queries (Sec. 6(b) from S1) | `must_not`; `need_not` |
| T7 | Sec. 3(b) relative deadline with no trigger date on some queries | 04-01, 07-01, 10-01 | `dueDate: null`; 05-16, 08-16, 12-31 give a trigger date for "damage is found" |
| T15 | Sec. 3(a): identical text in S1 and S2 while its exception target is repealed | 07-01, 08-16 (S1) and 10-01, 12-31 (S2) | Modality `must` in S1, `crossref_repealed` in S2 (same quote, changed value) |

Other: Sec. 2 purpose clause (contains "may") -> `negative`, `purpose`; Sec. 7 short title -> `negative`, `non_operative`. Sec. 5 and
Sec. 6(a) contain no trigger word and no cross-reference (so Sec. 3(a) and Sec. 4(a) resolve in one hop). Sec. 4(a) has an absolute
deadline (`on or before December 1, 2026`). A1 (`insertAfter`) and A2 (`repealSection`) carry `preimageSha256`.
