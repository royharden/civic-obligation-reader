# Deferred deployed model endpoint

The MVP has no `propose-spans` edge function. B0 runs in the browser without a provider key. H, M1a and M1b are local evaluation adapters only; authored replays remain explicitly labelled. No browser request may carry a provider secret.

If the owner later requests a deployed endpoint, its proposed contract is an authenticated owner-only POST accepting a bounded fictional candidate clause, selected source version, allowed span schema and request ID. It returns proposed literal spans only. Deterministic code must reject out-of-clause or non-substring evidence, normalize field values and compute due dates. Server-side cost reservations, provider timeouts, input screening and no-retry behavior remain required. This document implements no endpoint and grants no deployment authority.

An `append-ruling` edge function is also deferred. The current migration and direct authenticated insert/select client enforce owner-scoped append-only metadata. A future function must verify the user identity and ownership and preserve those fields and policies; an anon public key is not owner authentication.
