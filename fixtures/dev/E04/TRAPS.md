# E04 traps

Ashgrove Park Event Permit Ordinance (City of Ashgrove, fictional). Family: park permits. Dev fixture, `dev-builder-authored`.
States: S0 [2026-06-01, 2026-08-01), S1 [2026-08-01, 2026-11-01), S2 [2026-11-01, 2027-06-01).
Queries: 2026-05-31 and 2027-06-01 (not in force), 06-01, 07-01, 08-01, 09-16, 11-01, 2027-02-15.

| Trap | Where (sections, amendments) | Queries (asOf) | Expected handling |
|---|---|---|---|
| T4 | `sunsetExclusive` 2027-06-01; commencement 2026-06-01 after enactment 2026-05-04 | 2026-05-31, 2027-06-01 | One `no_rows` line each |
| T6 | Sec. 3(c) "may not"; Sec. 4(b) "is not required to" | S0 for Sec. 3(c); all in-force queries for Sec. 4(b) | `must_not`; `need_not` (modality span "is not required to", predicate starts after "to") |
| T13 | A1 and A2 both effective 2026-08-01, both target Sec. 3, neither carries `order` (conflict) | 08-01, 09-16, 11-01, 2027-02-15 | Neither applied; Sec. 3 text stays as in S0; every field of all four Sec. 3 slots is `amendment_conflict`. A3 (effective 2026-11-01) targets Sec. 3 and Sec. 5; Sec. 3 is already tainted, so A3 is skipped and Sec. 5 is tainted `dependency_tainted` from S2 (`E04/sec-5/1` lines also tagged T13) |
| T18 | Sec. 3(a) "A permit holder shall post the permit at the event entrance and shall keep a copy at the first aid tent." | all in-force queries | Two slots `E04/sec-3/1` and `E04/sec-3/2` with the same clauseSpan and actor span; the first action ends before "and shall" |

Other: Sec. 2(a) absolute deadline ("not later than March 15, 2027"); Sec. 4(a) `before_event` ("before the event begins",
`dueDate: null`); Sec. 6 short title -> `negative`, `non_operative`. S1 and S2 text equals S0 (only taints change).
