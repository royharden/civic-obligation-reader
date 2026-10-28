# Resume after Roy's RAM hold

**Current instruction: stop after documentation closeout. Do not start Docker, install dependencies or restart validation now. Roy will relaunch the integrator when RAM is free.** This supersedes the earlier Round 2 permission for new install/runtime operations; it does not erase the checks already completed. Dirty Mode remains open. Spend: **USD 0 of USD 40**.

## Done

- M1–M7 source construction and bounded independent code reviews completed. Extractor v2 fixes supported actor boundaries, passive `put`, deadline precedence and stale v1 rulings.
- Dependencies and lockfile were installed earlier with scripts disabled. Final typecheck, lint, production build and **301 tests in 34 files** passed before this hold.
- The final E01 localhost journey passed 10 assertions. DEV author-kit checks passed 26/26; six packets and 343 DEV label lines passed offline schema validation; synthetic admission checks passed 16/16. Code-only DEV evaluation ran without model calls.
- Cumulative admission roots include 0805, 0914 and 0950; builder descendants cannot become independent A/R. Real admission and hidden data remain untouched.
- The last verified cleanup stopped only owned Vite/browser resources and released the app's port claims. No Docker stack was started by this run.

Exact historical receipts and limits are in [DEFERRED-VALIDATION.md](DEFERRED-VALIDATION.md). Local checks establish neither remote readiness nor the independent model-comparison claim.

## Held and why

| Work | Why held |
|---|---|
| Any new install, Docker start, dev server or validation batch | Roy's current RAM hold; wait for his relaunch and applicable authorization |
| Isolated Supabase/Bolt Database, migration, two-user RLS and email authentication | No supplied approved target or test accounts; migration needs Supabase `auth.users`, roles and `auth.uid()`, not an arbitrary PostgreSQL container |
| Live model pilot and sealed comparison | No supplied keys/accounts, literal models, verified prices or real schedule approval; executable experiment stays disabled |
| Hidden authorship, blind relabelling and G1 admission | No eligible independent A/R appointed; this INT and its descendants cannot stand in; independence PENDING — Roy |
| J arm / public TypeSafe disclosure | J stays `not_run`; working neutral wording is local-only pending factual confirmation |
| Push, remotes, publication and deployment | Not authorized; local commits only |

Known parser limits remain in [LIMITATIONS.md](LIMITATIONS.md). No additional keyless implementation package is queued.

## Exact frontend install/check steps — later only

These are handoff commands, **not actions to run during this hold**. Existing passing checks do not need repeating merely because the seat restarts. Reinstall only if the later environment needs it.

```powershell
Set-Location -LiteralPath 'C:\Users\Roy Harden\OneDrive\PJ-OD\Bolt.New\civic-obligation-reader\civic-obligation-reader'
git status --porcelain
$freeGiB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
if ($freeGiB -le 3) { throw 'Stop: more than 3 GiB free RAM required before installation.' }
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test -- --maxWorkers=1 --minWorkers=1
npm run build
npm run eval -- --split dev --run-kind measured
```

Stop on an error; do not hide an install failure by enabling lifecycle scripts. Preserve the lockfile and all previous results. The final command is DEV code-arm evaluation only, not the model pilot. A later localhost journey also requires an actual `agent-ports` claim/check, loopback bind and external requests blocked; the outer `agentops/round2-browser-checks.ps1` requires its owned browser session to be opened separately first.

## Docker path — conditional, later only

**The frontend needs no Docker. This repo contains no Dockerfile, Compose file or Supabase CLI configuration. There is therefore no ready repo-native Docker start command.** Prefer a Roy-supplied isolated Supabase-compatible target if that is his choice. The commands below are a conditional checklist for a later authorized local target, not a claim that its missing infrastructure already exists.

Before filling the placeholders, the later integrator must obtain an approved complete Supabase-compatible Compose definition and actual image pins. Inspect it for loopback-only published ports, project/instance/owner labels on every resource, persistent-volume ownership, no privileged services, and no home, credential or Docker-socket mounts. It must supply the real Supabase auth dependencies needed by the migration. Do not fabricate service keys, substitute a bare PostgreSQL image or create accounts to make this checklist pass.

1. Read the canonical `agent-ports` skill and claim an actual S46 instance. The following uses a fresh instance name; preserve the ports/env assignments it returns rather than guessing numbers:

   ```powershell
   python 'C:\Users\Roy Harden\OneDrive\PJ-OD\skills\skills-bts\agent-ports\scripts\ports.py' claim --project S46 --instance resume-rls --kind verify --services web,api,db --owner '<PLACEHOLDER_RESUME_CALLSIGN>'
   python 'C:\Users\Roy Harden\OneDrive\PJ-OD\skills\skills-bts\agent-ports\scripts\ports.py' check S46/resume-rls
   ```

2. After Roy's relaunch, verify Kaiser-Pro and free RAM, then inspect existing local images. Do not start Docker Desktop/WSL, pull images or bypass an unavailable daemon under an old grant:

   ```powershell
   if ($env:COMPUTERNAME -ine 'KAISER-PRO') { throw 'Stop: local Docker authorization was Kaiser-Pro only.' }
   $freeGiB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
   if ($freeGiB -le 3) { throw 'Stop: more than 3 GiB free RAM required before Docker.' }
   docker image ls --digests
   docker image inspect '<PLACEHOLDER_APPROVED_IMAGE_DIGEST>' --format '{{.Id}}'
   ```

   Inspect **every** image in the approved stack. A missing image/configuration or additional permission is a recorded hold, not an invitation to pull/build it.

3. Only with the approved definition, completed safety/ownership inspection, still-valid grant and all images present:

   ```powershell
   docker compose -f '<PLACEHOLDER_SUPABASE_COMPOSE_FILE>' -p '<PLACEHOLDER_COMPOSE_PROJECT>' config --quiet
   python 'C:\Users\Roy Harden\OneDrive\PJ-OD\skills\skills-bts\agent-ports\scripts\ports.py' check S46/resume-rls
   $freeGiB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
   if ($freeGiB -le 3) { throw 'Stop: RAM fell below the Docker floor.' }
   docker compose -f '<PLACEHOLDER_SUPABASE_COMPOSE_FILE>' -p '<PLACEHOLDER_COMPOSE_PROJECT>' up -d --pull never --no-build
   docker compose -f '<PLACEHOLDER_SUPABASE_COMPOSE_FILE>' -p '<PLACEHOLDER_COMPOSE_PROJECT>' ps
   python 'C:\Users\Roy Harden\OneDrive\PJ-OD\skills\skills-bts\agent-ports\scripts\ports.py' observe S46/resume-rls
   ```

4. Verify the exact approved target and migration history. The following read-only checks must show the expected database/user, `auth.users`, `auth.uid()` and authenticated/anon roles. If `public.rulings` already exists, reconcile its migration history before proceeding; do not reset/drop it:

   ```powershell
   docker exec '<PLACEHOLDER_SUPABASE_DB_CONTAINER>' psql -X -v ON_ERROR_STOP=1 -U '<PLACEHOLDER_SUPABASE_DB_ADMIN_USER>' -d '<PLACEHOLDER_SUPABASE_DB_NAME>' -c "select current_database(), current_user, to_regclass('auth.users'), to_regclass('public.rulings'); select to_regprocedure('auth.uid()'); select rolname from pg_roles where rolname in ('anon','authenticated');"
   ```

   Only after target/migration review establishes that this migration is pending, run from the inner root:

   ```powershell
   Get-Content -LiteralPath 'supabase\migrations\20261101000001_rulings.sql' -Raw | docker exec -i '<PLACEHOLDER_SUPABASE_DB_CONTAINER>' psql -X -v ON_ERROR_STOP=1 -U '<PLACEHOLDER_SUPABASE_DB_ADMIN_USER>' -d '<PLACEHOLDER_SUPABASE_DB_NAME>'
   ```

   If authentication requires additional access, obtain it from Roy; never read credential files or invent credentials. This SQL migration alone is not a proof of RLS. Follow the exact authenticated two-user, signed-out and supersedes checks in `DEFERRED-VALIDATION.md`; privileged SQL cannot replace those client checks. Record a separate result for email auth and remote-error handling. Never touch `ss-demo-local-pg` (55490) or `m1-r03-rv2-db` (21800); never shut down Docker or WSL globally or remove volumes.

## Placeholders and questions for Roy on relaunch

The 15 access/model/approval markers, their future consumers and actual values needed remain fully inventoried in [ACTIVATION-PLACEHOLDERS.md](ACTIVATION-PLACEHOLDERS.md) and outer `HANDOFF.md`. All are documentation-only. No credential, account, literal model pin, price or approval has been invented.

Additional infrastructure placeholders introduced only by this conditional runbook:

| Placeholder | Needed later |
|---|---|
| `<PLACEHOLDER_RESUME_CALLSIGN>` | Actual registry callsign of the relaunched owner, not this retired seat by assumption |
| `<PLACEHOLDER_SUPABASE_COMPOSE_FILE>` | Absolute path to a reviewed, approved, complete Supabase-compatible Compose definition; none supplied |
| `<PLACEHOLDER_COMPOSE_PROJECT>` | Actual compose project name from the instance claim, consistently applied in the definition |
| `<PLACEHOLDER_APPROVED_IMAGE_DIGEST>` | Each approved image's actual locally present immutable reference; inspect every stack image |
| `<PLACEHOLDER_SUPABASE_DB_CONTAINER>` | Actual owned database container reported by the approved stack |
| `<PLACEHOLDER_SUPABASE_DB_ADMIN_USER>` | Actual authorized migration identity on that target |
| `<PLACEHOLDER_SUPABASE_DB_NAME>` | Actual database name verified against the target approval |

Questions held for Roy, with no response required during this stop:

- On relaunch, use a supplied isolated Supabase/Bolt target or authorize preparation of a local Supabase stack? If local, which complete configuration and already-present image pins are approved?
- Which real database/auth test identities and provider access may the next integrator use? Which literal model IDs, dated prices and full pilot/sealed schedule receive actual approval within the USD 40 lifetime ceiling?
- Who will serve as eligible independent author A and blind relabeller R? Builder lineage and its children cannot serve; human independence stays pending.
- What factual TypeSafe wording is correct if J or a public disclosure is ever requested? Until then keep the neutral local wording and J `not_run`.
- Any push/publish/deploy or public-license decision remains separately with Roy; none is requested or exercised by this handoff.

Spend ledger at stop: **USD 0 of USD 40; no live calls, paid resources or supplied keys/accounts.** Preserve app-lifetime reservations; log date, amount and purpose of any future authorized spend in outer `HANDOFF.md`.
