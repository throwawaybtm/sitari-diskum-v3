# Synthetic regression baseline

Run the portable suite from the repository root with `node local-test/run-synthetic-tests.js`.
Pass test paths as arguments for focused runs.

The runner copies tracked working files and new test support into an OS temporary
directory. It reads sanitized templates for the ignored tests, then generates the
ten ignored configuration/test inputs inside that disposable directory. Existing
private configuration is never read or overwritten. The directory is removed after
the child test process exits. Application sources in the checkout stay unchanged.

The fixture module fabricates 70 employees across eight normalized units, including
11 missing NIPs, nine LO flags, nine merged-unit members and legacy IDs 80/81.
Names, NIPs, phone numbers, workloads and hierarchy examples are synthetic.
Tests use shared employee/PIC references. The runner substitutes only leadership
identity constants in temporary application copies, preserving algorithms and
the organizational metadata used by the existing UI consistency tests.

Deployment defaults are a test-only configuration with fail-closed defaults and
explicit verified development-mode handling. These tests validate the shared
authorization and notification implementations with that configuration. They do
not attest to the contents of ignored deployment configuration on any machine.

HTTP integration tests run against loopback. A child-process preload blocks
external fetch calls. Apps Script notification transports remain VM mocks, with
existing tests verifying both mock delivery and disabled-send behavior.

Remediation sequence

1. Preserve the fresh checkout on a separate local fixture branch.
2. Supply deterministic employee, PIC and deployment inputs in the temporary tree.
3. Replace identity-dependent test literals with shared fixture references.
4. Move TDD test dates after the November 5 cutoff and assert the empty-store count.
5. Exercise New York Sheets Date cells and Jakarta ISO instants, including DST.
6. Run focused tests, the complete suite, then review the test-only diff.

The runner preserves failures in application regression assertions. In particular,
safe-ID integration is a separate change and its max-ID/flush contract must pass
through the actual intake implementation before this suite can be fully green.
