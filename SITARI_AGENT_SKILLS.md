# SITARI Agent Working Guide

Use this file as concise operating instructions for an AI coding agent working on SITARI DISKUM v3. It summarizes practices used in the prior session. It does **not** reproduce or claim to reproduce any proprietary skill, course, prompt, or original wording.

## Operating stance

Be empirical, minimal, and safe:

- inspect before editing;
- state assumptions and verify important ones;
- prefer the smallest coherent change that satisfies the request;
- keep unrelated behavior stable;
- use tests and diffs as evidence;
- stop before external or production-impacting actions unless explicitly authorized.

These principles are consistent with the practical coding style often associated with Andrej Karpathy: understand the system, reduce complexity, keep feedback loops short, avoid speculative abstraction, and make failures observable. The label is descriptive, not a quotation or official methodology.

## Workflow

### 1. Orient

Read `AGENTS.md`, the handoff, the relevant spec/request, and the nearest code/tests. Confirm branch, HEAD, status, and the expected test baseline. Treat repository files and commands as the source of truth when they conflict with a handoff.

**Done when:** the requested behavior, constraints, affected surface, and current baseline are explicit.

### 2. Shape the task

Translate the client request into a short checklist of observable acceptance criteria. Separate active scope from tempting follow-ups. Ask one focused question only when a missing decision would materially change the result; otherwise make and record a reversible assumption.

**Done when:** success can be checked without interpreting intent again.

### 3. Build a tight feedback loop

Find the smallest test or reproducible check that covers the behavior. For defects, reproduce first. For features, prefer a focused failing test when practical. Avoid broad refactors before the behavior is understood.

**Done when:** there is a fast signal that distinguishes the old behavior from the requested behavior.

### 4. Implement minimally

Change the fewest appropriate modules. Follow existing names, boundaries, and patterns. Keep security and authorization server-side. Remove accidental complexity, but do not redesign neighboring systems without scope and evidence.

**Done when:** acceptance criteria pass and no unrelated surface was changed.

### 5. Verify in layers

Run the focused check, related tests, then the full regression suite. Inspect the complete diff for logic mistakes, unrelated formatting, generated artifacts, secrets, private data, and line-ending churn. Report exact commands and results.

**Done when:** current evidence supports every completion claim.

### 6. Checkpoint safely

Commit one coherent unit with a descriptive message. Before pushing, review outgoing commits and secret/private-file exposure. Use ordinary fast-forward synchronization. Keep deployment, live messaging, resource mutation, merges, and force pushes behind explicit approval.

**Done when:** local state is recoverable and the remote is changed only as authorized.

## Superpowers-style habits

Use structured modes only when they earn their cost:

- **Brainstorming:** for ambiguous new behavior; converge on acceptance criteria before coding.
- **Systematic debugging:** reproduce, gather evidence, isolate the layer, form one hypothesis, test it, then fix the cause.
- **Test-first development:** use a red/green/refactor loop for behavioral changes when a useful test can express the requirement.
- **Written plans:** for multi-step or risky work; keep each step small, checkable, and tied to a file/test.
- **Parallel agents:** only for genuinely independent research or implementation tasks with clear ownership; reconcile results before editing shared surfaces.
- **Review:** compare the final diff against both the request and repository conventions.
- **Verification before completion:** never substitute confidence for fresh test output and diff inspection.

Do not invoke ceremony mechanically. A one-file, obvious change may need only inspection, one focused edit, and proportionate verification.

## SITARI safety boundaries

- Treat gitignored configuration, Fonnte credentials, employee data, phone numbers, and deployment identifiers as private.
- Use fixtures/mocks for notification tests; do not send live messages during development.
- Preserve Apps Script server-side authorization and lock enforcement.
- Treat `Public/` synchronization as an approved release activity, not a routine feature edit.
- Do not run `clasp push`, deploy GAS, alter Google resources, reset live data, merge, force-push, or publish without explicit approval.
- Keep Admin unlock and performance auditing deferred until the user/client reactivates them.
- Preserve repository line endings; investigate broad CRLF/LF diffs before proceeding.

> Verify these SITARI-specific boundaries against the cloned repository's current `AGENTS.md`, manifests, scripts, and documentation. The handoff may age; the repository is authoritative.

## Compact prompting pattern

Give the agent five things, in this order:

```text
Goal: <one observable outcome>
Context: <branch/commit and relevant modules>
Constraints: <security, privacy, deployment, and out-of-scope boundaries>
Verification: <focused check plus full suite or proportionate equivalent>
Deliverable: <code/report/commit/push status and concise evidence>
```

Example:

```text
Goal: Implement the next approved SITARI client revision exactly as specified.
Context: Start from client/revisions-2026-11-10 at b78d2de; read AGENTS.md and SITARI_ANTIGRAVITY_HANDOFF.md first.
Constraints: Preserve R01–R04, server-side locks, private configs, and Fonnte safety. No Admin unlock, performance audit, Public rebuild, deployment, merge, or force push.
Verification: Run the smallest relevant tests first, then node --test local-test/test/*.test.js. Review the full diff for secrets and unrelated changes.
Deliverable: Summarize changed behavior/files, exact test results, repo-specific assumptions verified, and remaining release-only work.
```

## Reporting standard

Lead with the outcome. Include:

- what behavior changed;
- files or surfaces affected;
- focused and full verification results;
- assumptions or repository details that were verified;
- anything intentionally deferred;
- Git state and whether any remote/external action occurred.

Use exact evidence and concise language. If a check was not run or a detail was not verified, say so plainly.
