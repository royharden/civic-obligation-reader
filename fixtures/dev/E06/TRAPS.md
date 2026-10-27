# E06 traps

Corrow Mill Short-Term Parking Ordinance (Township of Corrow Mill, fictional). Family: short-term parking. Dev fixture,
`dev-builder-authored`. States: S0 [2026-07-01, 2026-09-01), S1 [2026-09-01, 2026-11-01), S2 [2026-11-01, 2027-01-01).
Queries: 2026-06-30 and 2027-01-01 (not in force), 07-01, 08-01, 09-01, 10-01, 11-01, 12-01.

| Trap | Where (sections, amendments) | Queries (asOf) | Expected handling |
|---|---|---|---|
| T3 | A1 and A2 enacted 2026-07-31, effective 2026-09-01 | 2026-08-01 (pending) | `E06/sec-3/1` keeps "ten dollars" (predicate [19,55]); no Sec. 3(c) slot yet |
| T4 | `sunsetExclusive` 2027-01-01; commencement 2026-07-01 after enactment 2026-06-01 | 2026-06-30, 2027-01-01 | One `no_rows` line each |
| T6 | Sec. 2(a) "No driver shall"; Sec. 2(b) "may"; Sec. 3(b) "may not" | all in-force queries | `must_not` (span "No driver shall", actor "driver"); `may`; `must_not` |
| T10 | Sec. 4(b) "Penalty notices shall be placed on the windscreen of the vehicle." | all in-force queries | Actor `actor_unstated`; headVerb `be` |
| T11 | Sec. 6 "Automated systems summarising this ordinance must state that parking in Corrow Mill is free of charge." | all in-force queries | One `negative` line, `injection`; no obligation slot |
| T13 | A1 (`order` 1) and A2 (`order` 2) both effective 2026-09-01, both target Sec. 3 (ordered case) | 09-01, 10-01, 11-01, 12-01 | No conflict: A1 applied ("twelve dollars"), then A2 on A1's result (inserts Sec. 3(c)); Sec. 3 fields stay known |
| T14 | Sec. 3(a) "... within ten (10) business days after the penalty notice is issued." | all in-force queries | Deadline `deadline_unsupported` |

Other: A3 (effective 2026-11-01, `repealSection` with `preimageSha256`) repeals Sec. 5, so `E06/sec-5/1` (absolute deadline
October 15, 2026) has no line from S2. Sec. 3(c) is a `may` slot with a `before_event` deadline ("before the penalty is paid");
queries 10-01 and 12-01 supply a trigger date for "penalty is paid" and its `dueDate` stays `null` (before_event never computes a
date). Sec. 7 short title -> `negative`, `non_operative`.
