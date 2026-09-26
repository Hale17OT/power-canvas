# Experiment authentication recovery

The 23 September 2026 recovery diagnosed a **profile store mismatch after the rebrand**. The existing PowerCanvas MSAL profile `experiment` and protected cache were present in the historical user `.powerforge/auth` store. The `.powercanvas/auth` store was absent. V2.1's missing-profile result accurately described the new path, but not the historical store.

No profile was created, copied, renamed, selected, deleted or rebound. The discovery fix retains the historical store only when the entire canonical store is absent. A canonical store, including one missing the requested alias, always wins: there is no per-alias fallback, cross-store merging, first-profile selection or PAC-active-profile substitution. Access failures do not count as absence. Profile filenames must match their declared alias. Credential caches stay in OS-protected storage; silent refresh may update that protected cache normally.

## Independent identities

* PowerCanvas project environment binding: `experiment-default`.
* PowerCanvas named MSAL authentication profile: `experiment`.
* PAC active profile observed: `PowerCanvasReadback` (Public, User, UNIVERSAL).

PAC's profile is independently authenticated and is not used by the Dataverse provider. Its organization and tenant match the configured target; its application URL differs from the bound API URL. That difference is recorded, not used to rewrite the target. Sanitized user and immutable IDs are kept only in ignored local evidence.

PAC was not on PATH. The existing repository-local PAC executable initially failed because the system .NET runtime was 8 while that PAC requires .NET 10. The already-installed repository-local .NET runtime was then supplied through child-process `DOTNET_ROOT`/`DOTNET_ROOT_X64`. No installation, global environment change or PAC profile selection occurred. Both `pac auth list` and `pac auth who` then succeeded. No raw-token command was used.

## Read-only auth doctor

```text
powercanvas --project <project> auth doctor --environment <binding-alias>
  --pac <existing-pac-executable>
  --dotnet-root <existing-runtime-directory>
  --expected-principal <optional-Dataverse-user-GUID>
  --out output/auth-recovery/<fresh-file>.json
```

The doctor returns `READY`, `PROFILE_MISSING`, `PROFILE_ENUMERATION_FAILED`, `PROFILE_TARGET_MISMATCH`, `AUTHENTICATION_FAILED`, `ENVIRONMENT_MISMATCH`, `PRINCIPAL_MISMATCH`, `SOLUTION_MISSING`, `SOLUTION_MISMATCH`, `PUBLISHER_MISMATCH` or `OWNERSHIP_UNVERIFIED` (and `BINDING_MISSING` for missing configuration). Store selection and PAC runtime availability are reported separately. PAC is informational; failure of that independent tool does not prove PowerCanvas's named MSAL profile is unhealthy.

The command uses the existing silent token/target verification path, which checks tenant and cached home-account identity before discovery and WhoAmI. It never invokes interactive authentication. An optional expected Dataverse principal gives an additional explicit user-ID gate. It reads only the exact unmanaged solution and its publisher, checks names/prefix/options and verifies stable remote IDs and live owned properties against the existing project/target ownership receipts. It does not discover or provision certification resources, mutate tenant metadata, or grant access.

An exclusive output write refuses to overwrite older evidence. Evidence contains only projected inventory fields, target IDs, safe error codes, verification results and timestamps. It excludes raw PAC output, home-account/cache identifiers, tokens, passwords, secrets, cookies, certificates and private keys; the evidence guard rejects credential-shaped content. This is not a credential migration utility.

## Observed verification

PowerCanvas successfully found the original `experiment` profile, silently authenticated, discovered the exact configured Default environment and passed WhoAmI. The historical `pfx_PowerForgeExperiment` solution is unmanaged and has the expected stable solution/publisher IDs. `PowerForgeExperimentPublisher`, prefix `pfx`, and option-value prefix `73142` match source and receipts. No new publisher or solution was created.

The first doctor run exposed a diagnostic distinction: live ownership properties match their receipts, but desired source has an unapplied solution display-label change. Source says **PowerCanvas Experiment**; live and receipt say **PowerForge Experiment**. The doctor now reports this as `sourceDifferences`, rather than falsely classifying it as missing ownership. A regression test still blocks actual remote-label drift. No source, baseline or tenant label was changed. The existing native planner and Default-environment mutation policy remain authoritative for this difference before any future apply.

Authentication recovery is independent of V2.1 certification. A READY auth doctor permits the next read-only V2.1 preflight; it does not establish a reviewed certification plan or authorize resolving the source branding difference through a tenant update.

The final live doctor returned **READY**, `verified: true`, with ownership verified against receipt revision 37. Sanitized local evidence is in `output/auth-recovery/experiment-profile-20260923-verified.json` (ignored; not a distributable fixture). The earlier diagnostic artifact is retained separately. Final state: **AUTHENTICATION RECOVERED — V2.1 LIVE PREFLIGHT READY**.

## Tests and scope

Tests cover missing/correct/wrong-target profiles, a different matching candidate that is never selected, tenant/principal/environment mismatches, enumeration failures, canonical/legacy store precedence, runtime mismatch, GET-only solution/publisher checks, receipt identity, remote drift versus source changes, secret rejection and PF-AUTH-001 routing. All tests use synthetic metadata.

Validation: `npm run check` passed lint, type checking, build and **728 tests**, with **7 skipped**. `npm run agent:eval` passed **25 routing cases** and **4 result-interpretation cases**, and verified all **24 packaged skill files** against their authoritative sources. Live read-only evidence is separate from those synthetic tests.

Local profiles created/updated/selected/rebound: **0 / 0 / 0 / 0**. Tenant tables, columns, apps, roles, flows and business data changed: **0 each**. V2.1 certification was not resumed. No capability maturity was promoted.

Microsoft's supported [PAC authentication commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/auth) were used only for `auth list` and `auth who`. PowerCanvas's profile resolution is implemented by this repository, not by those PAC commands.
