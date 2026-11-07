# Responsive actions implementation plan

> **For agentic workers:** Use executing-plans; follow TDD for each task.

**Goal:** Acknowledge clicks immediately and eliminate redundant reads/refreshes.
**Architecture:** Preserve Apps Script and HTML/CSS. Render loading shells before RPCs; use request tokens for cancellation. Reuse one spreadsheet handle per workflow read, read rooms separately, update browser lists from save results, and fetch archive sources with at most two requests in flight.
**Tech Stack:** Apps Script, browser JavaScript, Node test runner.
**Spec:** docs/validation/2026-10-31-performance-review.md, approved by user “lets go”.

## Constraints

Preserve desktop/mobile appearance, fresh authorization, workflow version checks, server booking conflict checks, document ordering and completeness. Do not cache mutable approvals or visitor lists across GAS projects. No deployment in this local implementation step. No Git repository: use source ZIP backup and working files rather than worktrees/commits.

## Tasks

- [x] 1. Immediate EDIT/manual attendance modal feedback; cancellation and late responses cannot reopen/overwrite a closed or newer modal. Error stays visible with close available.
- [x] 2. Workflow reads reuse spreadsheet and read only room master; preserve legacy fallback and public roster restrictions. Room modal reuses a single in-flight/result room request; failure is retryable.
- [x] 3. Update changed visitor row/report/recent data from successful save; refresh dashboard statistics and calendar only when relevant. Avoid broad three-request refreshes for notification/evidence updates. Merge newer saved data into older successful responses; ignore older failures that would erase saved data.
- [x] 4. Archive downloads use concurrency two, preserve original page order and explicit failures; show download progress.
- [x] 5. Full suite, before/after audit, local HTTP smoke checks; independent review and important findings addressed. Source ready for later GAS push.

## Review focus

Closing during loading, failed room request retry, notification save during initial data load, finish action with photo requiring two writes, archive errors and source order.

## Progress

Backup created before code changes. Task interfaces: workflow data remains compatible; targeted refresh consumes authoritative save response; archive loader signature preserved. No schema changes.

Final verification: `node --test local-test/test/*.test.js` → 113/113 passing. `node docs/validation/performance/audit.cjs` → immediate feedback PASS, booked workflow 1 open/5 reads versus 4/7 baseline. All four local pages HTTP200, room endpoint200/5rooms; eight inline Admin scripts compile.

Independent review: one Important finding (stale visitor-fetch failure clears newer saved data). Reproduced RED in `performance.test.js`, fixed revision guards, full suite GREEN. Additional archive late-progress failure reproduced RED and fixed, full suite GREEN. No further Critical/Important findings reported.

Implementation decisions: retain public roster response shape and existing manual-attendance workflow payload for compatibility; optimize shared reads first. Use session-scoped room reuse with fresh booking checks on save. No schema changes, cross-project visitor cache, static CSS rebuild, or deployment in this step. Broader startup/asset profiling remains follow-up work rather than part of this focused pass.

Preview server started because it was not running: http://127.0.0.1:4173/ (PID8608). No data reset or live database writes performed.
