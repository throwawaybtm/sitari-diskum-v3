---
name: sitari-knowledge
description: SITARI DISKUM v3 app knowledge - architecture, Google Sheets data model, code map, tests, deployment topology and invariants. Use before answering questions about how SITARI works or before planning any SITARI change, instead of reading large source files.
---

# SITARI knowledge base

SITARI DISKUM v3 is a Google Apps Script (GAS) web app for the Dinas Koperasi dan Usaha Mikro Kota Batam: guest book (Buku Tamu) for internal TDD and external TLD visits, visit workflow, meetings (rapat) and attendance (presensi), SPPD evidence, E-Notula and PDFs. Google Sheets is the database, Drive holds uploads. UI language is Bahasa Indonesia, time zone Asia/Jakarta (WIB).

Status: development and test deployments are on the owner's personal account. Public access is for testing only. Not released or handed over to the client.

## Load only what the task needs

| Need | Read |
|---|---|
| Surfaces, data flow, auth, build/deploy, invariants | `references/architecture.md` |
| Sheet names, columns, column indexes | `references/data-model.md` |
| Which file does what, size, where to start | `references/code-map.md` |
| Which tests cover an area, how to run them | `references/tests.md` |
| Which repo doc to open, and which are historical | `references/docs-index.md` |
| Live function list with line numbers (incl. JS inside .html) | `node .claude/skills/sitari-knowledge/scripts/code-index.mjs [files] [--grep pattern]` |

The references are a map, not the source of truth. Line numbers drift: confirm with `git grep -n` or the code-index script before citing or editing. When the map and the code disagree, the code wins; update the reference in the same PR.

## Never
- Read the six private config files or `.clasprc.json`; they are gitignored and deny-listed.
- Print deployment IDs, script IDs, Script Property values, phone numbers or real employee/visitor data.
- Run clasp write commands, rebuild `Public/`, or touch live Sheets/Drive/Fonnte without explicit owner approval.
