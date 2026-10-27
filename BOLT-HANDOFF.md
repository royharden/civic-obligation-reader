# Civic Obligation Reader — activation handoff

**Local source construction only.** No remote, import, deployment, provider call, migration or runtime validation has occurred. Dirty Mode remains active; owner authorization to close it precedes the steps below. The nested workspace folder is not part of the imported app: this inner repository is the application root.

| Resource | Implemented source and intended setup | Readiness |
|---|---|---|
| Frontend | React 18 / TypeScript / Vite; `src/main.tsx`; six bundled fictional dev packets; B0 executes locally | Source built; browser and production build unverified |
| Database target | Bolt Database; fresh target intended, no existing connection or applied baseline known | Not provisioned. Inspect migration tracking before applying anything |
| Migration | `supabase/migrations/20261101000001_rulings.sql`: append-only owner-scoped ruling metadata | Not applied. Select/insert authenticated owner only; no anonymous read/write or update/delete grants |
| Remote content | Hashes, verdict, note, superseded event, owner and time only | Source and machine field values remain local. User notes must avoid sensitive content |
| Auth | supabase-js magic-link sign-in and sign-out; email auth, Site URL and redirect allowlist require owner setup | Source only; email delivery and sessions unverified |
| Browser configuration | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Names only. Missing configuration selects useful local mode and blocks browser fetch |
| Local persistence | Browser localStorage append-only event history; explicit local/remote save controls | Storage failures surface; no silent fallback or merge |
| Edge functions | **Not required** | No deployed model endpoint in this MVP |
| Storage buckets / Realtime / background jobs | Not required | No resources to provision |
| Live providers | Local evaluation scripts only; `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MODEL_BASE_URL` | Owner-local access pending. Never expose provider secrets with a `VITE_` prefix |
| Evaluation admission | Independent A/R appointments, receipts and sealed files outside repo; measured dev pilot via `npm run eval:models -- --run-kind measured --pilot-id <unique-id>`; hash-bound selection, frozen experiment and one-use edition | Pending owner gates. Builder lineage never authors hidden data; model template remains disabled |
| Spend | USD 40 app-lifetime ceiling; template dev/sealed caps both zero; shared append-only lifetime ledger/lock plus allocation ledgers outside repo | New pilot/experiment does not reset the ceiling. No access or permission to run now |
| Dependencies / commands | Node >=22.6; `npm install` then commit lockfile; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | None executed; no lockfile exists yet |
| Acceptance | Keyless offline journey; dates/amendments/unknowns; exports; two-user RLS isolation and signed-out rejection | All runtime checks deferred; see `docs/DEFERRED-VALIDATION.md` |
| Publication | No push, remote, import or publish authorized in this construction run | Owner action required |

Future inspection prompt, only after owner authorization:

> Inspect this application root and its deferred validation list. Preserve the React interface and Bolt Database choice. First install pinned dependencies and generate a lockfile, then resolve concrete type/lint/test/build failures. Verify the keyless browser journey with external network blocked. Before any database action inspect the actual target and migration tracking, apply only the pending ruling migration on an approved fresh target, configure email authentication and browser public configuration, and exercise authenticated two-user isolation plus anonymous rejection. Edge functions, buckets and jobs are not required. Keep evaluation providers local and disabled until the owner supplies access and approves a frozen experiment within the total ceiling. Do not publish. Report actual checks, deployed resources and remaining owner steps separately.
