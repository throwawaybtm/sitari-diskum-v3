# Whole-App Phone Compatibility Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation, followed by one independent review of the completed changes.

**Goal:** Make every existing app page and dialog usable on portrait and landscape phones without changing desktop layouts or business rules.

**Architecture:** Extend the existing phone media rules to touch/no-hover landscape viewports, keeping JavaScript detection aligned. Normalize supported TLD upload MIME types when missing/generic before creating the data URI. Retain the existing GAS projects, database, forms and workflow endpoints.

**Tech Stack:** Apps Script HtmlService, HTML/CSS/JavaScript, Node test runner, local fixture server, clasp.

**Spec:** `docs/superpowers/specs/2026-11-01-all-pages-mobile.md`

## Constraints and execution ledger

- No Git repository exists. Ruling: use the authorized workspace and a ZIP snapshot of all three app projects as the reversible baseline; no branch operations are applicable.
- Publishing the existing demo projects is already authorized. No live visitor/meeting/attendance writes, WhatsApp sends, permission changes or data reset are required.
- No visual redesign; fix confirmed compatibility gaps and retain current portrait design.

## Tasks

- [x] Backup Admin, Tamu-Luar and Tamu-FO before implementation.
- [x] Add failing coverage for landscape touch agenda rendering and missing/generic MIME uploads.
- [x] Align phone CSS in all four pages and relevant JavaScript detection; preserve desktop breakpoints and responsive button captions.
- [x] Normalize supported TLD and Admin workflow/E-notula file types and data-URI MIME headers; preserve limits and rejection behavior.
- [x] Run full tests; verify portrait/landscape pages and main dialogs/forms locally, with local submission flows covered by fixtures.
- [x] Perform one independent review and fix important findings.
- [x] Publish the three existing projects, update snapshots/registry and run read-only live delivery checks.
- [x] Record verified scope, evidence and any remaining device-specific limitations.

## Verification record

Completed with device-specific limits recorded in [the validation report](../../validation/mobile/2026-11-01-all-pages-review.md). VS Code integrated browser is the default per user preference. Landscape has automated/source verification; physical touch-device checks remain a limitation. Published Admin v29, TLD v9 and TDD v6; all four deployed pages return HTTP 200 with the expected changed source markers.


