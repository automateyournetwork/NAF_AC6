# Secure Build Checklist

**Project:** Backbone, rebuilt through Spec Kit (branch `speckit-rebuild`)
**Reviewer:** Claude Code (build agent), for the owner's review
**Date:** 2026-11-10

Backbone is a static browser game. It has no backend, no accounts, no network calls, no secrets and no user data. Most of the owner's secure-build standard does not apply; the rows below say which rules do and what was done in the rebuilt code. The checks named here were run on 2026-11-10.

| Rule | Applies? | Status |
| --- | --- | --- |
| SEC-01–05 (identity, sessions, authorization) | No: nothing to sign in to | Not applicable |
| SEC-06 (no secrets in the repo) | Yes | No secret exists in the project. `gitleaks detect --no-git` (8.30.1) over the working tree on 2026-11-10: no leaks found. No pre-commit secret scanner is installed: accepted exception, see below. |
| SEC-07–10 (secret storage, rotation, logging, responses) | No: no secrets | Not applicable |
| SEC-11, SEC-12 (schema validation, allowlists) | Yes, for everything that comes from outside the code | **URL switches:** `parseSwitches` in `src/ui/settings.ts` accepts eight named switches with fixed values and ignores everything else. **Typed seed:** must match `^[A-Za-z0-9-]{1,24}$` (`SEED_PATTERN` in `src/ui/scores.ts`). **Typed cost:** digits only, then the simulation's own range check. **Stored scores and settings:** `validScores` and `loadMotion` keep only well-formed values and drop the rest. **Content files:** `src/content/load.ts` validates tuning, region, palette and text at start-up and stops with a message on a bad file. **Player actions:** every command passes `validate` in `src/sim/world.ts`. Covered by `tests/unit/scores.test.ts`, `tests/unit/content.test.ts`, `tests/unit/world.test.ts` and the end-to-end test that stores a damaged score entry. |
| SEC-13 (parameterized queries) | No: no database | Not applicable |
| SEC-14 (encode at the sink) | Yes | All dynamic text is written with `textContent`. A search of `src/` and `index.html` finds no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. `tools/frr_check.py` runs Docker with argument lists, never through a shell. |
| SEC-15 (uploads) | No | Not applicable |
| SEC-16–20 (transport and storage encryption) | No data is sent or stored beyond scores on the device | Not applicable. Whoever hosts the game should serve it over HTTPS. |
| SEC-21–25 (logging, audit, alerts) | No | Not applicable |
| SEC-26 (dependency scanning) | Yes | `npm audit` on 2026-11-10: 0 vulnerabilities in 45 packages. Not in CI: there is no CI. Accepted exception, see below. |
| SEC-27 (pinned versions, lockfile) | Yes | Seven build-time dependencies, each an exact version in `package.json`; `package-lock.json` is committed. The shipped game has no runtime dependency. `tools/run-ts.mjs` runs the project's TypeScript tools through the pinned Vite, so no unpinned runner is fetched. |
| SEC-28, SEC-29 (signing, SBOM) | Low value for a static demo | Not done. See exceptions. |
| SEC-30–33 (containers, network, images) | No containers ship | Not applicable. `tools/frr_check.py` runs FRR containers with `--privileged` on the developer's machine only, for a lab check, and removes them and their networks afterwards; after each of the four runs of 2026-11-10 none was left. |

Also checked: the build has no reference to another host (`tests/e2e/offline.spec.ts`), and the test and tool servers bind to 127.0.0.1 only.

## Documented Exceptions

The owner accepted all three on 2026-11-09, with no expiry, for the hand-built v1. Nothing in the rebuild changes what they cover: the game still has no secrets, no backend and no runtime dependency. The agent cannot accept risk on the owner's behalf; these entries record his decision, and he may want to confirm that it carries over to the rebuilt code.

| Rule ID | Reason | Risk Accepted By | Expiry |
| --- | --- | --- | --- |
| SEC-06 | No pre-commit secret scanner hook. A one-off gitleaks scan of the rebuilt working tree found nothing. | Elliot Conner (owner), 2026-11-09 | None |
| SEC-26 | No CI, so dependency scanning is manual (`npm audit`). | Elliot Conner (owner), 2026-11-09 | None |
| SEC-28, SEC-29 | No artifact signing or SBOM for a static workshop example. `package-lock.json` lists every build dependency. | Elliot Conner (owner), 2026-11-09 | None |
