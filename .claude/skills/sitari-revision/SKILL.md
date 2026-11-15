---
name: sitari-revision
description: Step-by-step workflow for implementing an approved SITARI client revision across PCs and cloud sessions - branch and draft PR handoff, acceptance checklist, scout/routine/specialist routing, focused then full tests, diff review, checkpoint pushes, and the owner-only release boundary. Use when starting, resuming or finishing any SITARI revision.
---

# SITARI revision workflow

Load `sitari-knowledge` for architecture, data model and test map. Follow `SITARI_AGENT_SKILLS.md` for style; this skill is the procedure.

## 0. Start or resume
- **Resume:** `git fetch origin`, switch to the revision branch, read the open PR description (it is the handoff note), `git log --oneline origin/client/revisions-2026-11-16..HEAD`.
- **Start:** branch from the latest client branch: `git switch -c rev/<Rnn>-<slug> origin/client/revisions-2026-11-16`. Record branch + base SHA.
- Baseline: `node local-test/run-synthetic-tests.js`, record counts.

## 1. Pin the requirement
- Use the client's exact wording (quote it in the PR). If wording is missing or a decision would change the result, ask one focused question and stop; do not guess client-facing behavior.
- Write an acceptance checklist of observable checks (inputs -> expected display/data), including old/legacy rows, empty values, WIB date rollover, mobile, and Admin vs Public.
- Mark out-of-scope items explicitly (Buka Kunci, performance, Public rebuild unless approved).

## 2. Locate (scout, Haiku)
Dispatch `scout` with concrete identifiers and areas. Ask for path:line per hop and nearest tests. If its report is partial, finish with `git grep -n` or `.claude/skills/sitari-knowledge/scripts/code-index.mjs`, not by reading big files.

## 3. Plan
- Small, one-surface change: plan inline (list files + tests).
- Multi-surface (intake form + server + sheet + Admin UI + Public build), or ambiguous: Superpowers `writing-plans`, saved under `docs/superpowers/plans/`. Risky areas (auth, locks, IDs, uploads, Public boundary): get a `specialist` (Opus) review of the plan first.

## 4. Implement (routine, Sonnet)
- Give `routine` the acceptance checklist, file:line locations and the focused test to write first.
- Keep `nextRecordId_` copies identical, keep column order and legacy fallbacks, keep server-side locks/auth, keep the approved UI.
- Never edit `Public/` by hand; if Public must change, note "Public rebuild required at release" in the PR.

## 5. Verify
1. Focused test(s): `node local-test/run-synthetic-tests.js local-test/test/<name>.test.js`.
2. Full suite: `node local-test/run-synthetic-tests.js` - must be >= baseline, 0 fail.
3. `git diff` review: only intended files; no secrets, IDs, phone numbers, real names; no CRLF/LF churn; no generated drift.
4. Security-sensitive diff: `specialist` with Trail of Bits `differential-review` / `insecure-defaults`.
5. UI change: local preview (`node local-test/setup-local.js --from-templates`, `node local-test/server.js`, 127.0.0.1:4173 and /mobile-preview) on a PC; note what still needs a physical phone.

## 6. Checkpoint (every green step, and before leaving a PC)
- Commit one coherent unit, push the revision branch: `git push -u origin rev/<...>`.
- Open/refresh the **draft PR** into `client/revisions-2026-11-16`. Keep its description current:
  `Client wording | Acceptance checklist (ticked) | Done | Next | Tests (cmd, SHA, counts) | Release notes (Public rebuild? migration? owner checks)`.

## 7. Finish
- Mark the PR ready only when the checklist is ticked and the full suite is green. The owner merges.
- Stop. Release steps are owner-only and outside this skill: clasp push/deploy, Admin library version, `maintenance/build-public.js`, deployment updates, smoke checklist, Script Properties, live sends. The guard hook blocks them.

## Report format
Outcome first, then: files changed, focused + full test results with SHA, assumptions verified, deferred items, Git/PR state, and which subagents were used.
