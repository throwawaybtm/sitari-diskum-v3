
# SITARI DISKUM — Codex Agent Instructions

## Automatic Subagent Routing

Goal: minimize Codex usage without compromising quality.

### Routine tasks
- Handle very small tasks directly.
- Delegate substantial documentation, repository inspection,
  and straightforward tests to the `routine` subagent.

### Complex tasks
- Delegate difficult debugging, architecture reviews,
  staging isolation, and security-sensitive analysis
  to the `specialist` subagent.

### Efficiency
- Avoid spawning agents unnecessarily.
- Do not duplicate analysis between agents.
- Read relevant source files rather than the entire repository.
- Run targeted tests first.
- Run the full suite when required by risk.
- Keep responses concise.

### SITARI Safety
- Preserve the client-approved UI and existing workflows.
- Never modify production Google Sheets or Drive data.
- Never deploy Apps Script without explicit approval.
- Never merge to main without approval.
- Keep private configuration and credentials out of Git.
- Maintain Admin/Public authorization boundaries.

### Delegation
- The main agent coordinates and integrates results.
- Choose subagents based on task complexity.
- Do not delegate merely to demonstrate routing.
- Report which subagent was used when applicable.
