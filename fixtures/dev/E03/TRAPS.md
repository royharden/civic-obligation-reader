# E03 traps

Marrow Creek Private Well Sampling Ordinance (County of Marrow Creek, fictional). Family: well-water sampling. Dev fixture,
`dev-builder-authored`. States: S0 [2026-05-01, 2026-07-01), S1 [2026-07-01, 2026-08-01), S2 [2026-08-01, open).
Queries: 2026-04-30 (not in force), 05-01, 05-31, 07-01, 07-16, 08-01, 08-31.

| Trap | Where (sections, amendments) | Queries (asOf) | Expected handling |
|---|---|---|---|
| T7 | Sec. 4(a) "... within two (2) calendar days after such notice." (nothing earlier in Sec. 4 names a notice) | all in-force queries | Deadline `deadline_anchor_unresolved` |
| T10 | Sec. 4(b) "Results of a retest shall be entered in the County well register." | all in-force queries | Actor `actor_unstated`; headVerb `be` |
| T14 | Sec. 2(a) "... tested by a certified laboratory annually." | all in-force queries | Deadline `deadline_unsupported` (recurrence); the action ends before "annually" |
| (retroactive, no catalogue id) | A2 enacted 2026-09-15 with `effectiveOn` 2026-08-01, targets Sec. 3 | 08-01, 08-31 | Never applied; 2026-08-01 is still a boundary (starts S2); every field of `E03/sec-3/1` and `E03/sec-3/2` is `retroactive_unsupported`; Sec. 3 text stays as in S1. Lines carry no trap tag because the catalogue has no retroactive trap id |

Other: A1 (`addSection`, effective 2026-07-01) adds Sec. 6; its slot `E03/sec-6/1` first appears in S1 with a new id. Sec. 1(b) is a
definition containing "may" -> `negative`, `definition` (F16 opportunity). Sec. 5 short title -> `negative`, `non_operative`. Neither
amendment has a pending day (A1 is effective the day after enactment; A2 is retroactive).
