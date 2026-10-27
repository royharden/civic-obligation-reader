# Civic Obligation Reader

> **Fictional enactments only. This reader explains the text you supply. It is not legal advice and does not say how any
> law applies to anyone.**
> Unadmitted regression build: independent admission (G1) is pending and no measured result exists.

That banner text is shown at the top of every view once the UI exists.

## What this is

You pick or paste one short packet. A packet holds an original, fictional enactment (for example an ordinance of the
made-up "Town of Larkspur Bend") with structured amendments. You choose an "as of" date. The app lists who **must**,
**must not**, **may** or **need not** do what, and by when. Every row quotes the exact words of the provisions in force
on that date. Every field is either a value or `unknown` with a reason from a closed list.

It explains supplied text. It is not legal advice, not a compliance or reminder tool, and it does not decide whether a
provision applies to anyone. All enactments are invented; none is a real law.

## Status: Dirty Mode construction (2026-10-27)

This repository is being built under a static-only construction run. As of this commit:

- **Nothing has been installed, built, type-checked, linted, tested or run.** Test files, where they exist, are
  authored but not executed.
- **There is no lockfile.** `package.json` pins exact versions; `npm install` (which creates `package-lock.json`) is
  deferred.
- **No result exists.** There are no measured numbers anywhere in this repository, and none should be quoted.
- **Gate G1 (independent admission) is PENDING.** The independent hidden-set author (A) and blind relabeller (R) have
  not been appointed. Without them the project's claim cannot be tested; the build is an unadmitted regression build.
- **Spend: $0.** Model arms (M1a, M1b, H, J) are built later as adapters and replay paths only; their status is
  `not_run`.
- Every deferred check, with the exact command to run later, is listed in
  [docs/DEFERRED-VALIDATION.md](docs/DEFERRED-VALIDATION.md).

## Preregistered claim (unmeasured)

On held-out, independently authored fictional enactments, scored per (enactment, as-of date) query, the default
pipeline has a wrong-version rate (per assertion and per query) no higher than, a higher end-to-end tuple F1 (actor,
modality, deadline) than, no lower action fidelity than, and no lower slot recall than one model pass given the same
original text, amendment operations and date. A tie or a loss will be published. Nothing here has been measured.

## What exists now (milestone M1 tooling)

| Path | Purpose |
|---|---|
| `schema/packet.schema.json` | JSON Schema (2020-12) for a packet (`s46.packet.v1`). |
| `schema/gold.schema.json` | JSON Schema (2020-12) for one line of `gold.jsonl` (`s46.gold.v1`). |
| `tools/author-kit/` | Standalone checkers for authors and relabellers (Node built-ins only; see its README). |
| `tools/admit.ts` | Read-only G1 checker: prints `GO`, `NO-GO` or `PENDING` with reasons. |
| `docs/` | Labelling guide, packet format, trap catalogue, author/relabeller packets, admission protocol, deferred checks. |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html` | Scaffold for later milestones (not installed). |

## Planned layout

```
docs/       labelling guide, packet format, traps, A/R packets, admission protocol, deferred validation, limitations
schema/     packet.schema.json, gold.schema.json
tools/      author-kit/ (standalone), admit.ts
fixtures/   dev/E01..E06 (packet.json, states/<stateId>/<sectionId>.txt, gold.jsonl, TRAPS.md), MANIFEST.json, replay/authored/
src/        core/ (pure TypeScript version engine and extractor), ui/, state/, export/, lib/, main.tsx
eval/       arms/, providers/, prompts/, scorer and sealed-run tooling, experiment.json
scripts/    eval.ts, eval-heldout.ts
supabase/   migrations/ (rulings table with row-level security)
tests/      unit and component tests, coverage-matrix.json
```

Hidden (held-out) enactments, the relabeller's labels and the admission receipts live outside this repository and are
never committed here.

## Commands (later; none has been run)

```
npm install            # creates package-lock.json (deferred)
npm run typecheck
npm run lint
npm test
npm run admit          # G1 status: GO | NO-GO | PENDING
npm run dev -- --port <port claimed through agent-ports>
```

Author-kit commands run on plain Node 22.6 or later without any install; see
[tools/author-kit/README.md](tools/author-kit/README.md).

## Licence

Code: MIT (see [LICENSE](LICENSE)). Fixture texts: CC0-1.0, original and fictional.
