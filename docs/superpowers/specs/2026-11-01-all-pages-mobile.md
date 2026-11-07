# Whole-app phone compatibility

Preserve the approved compact portrait layouts and desktop appearance while making Admin, TLD, TDD, Presensi and their dialogs usable on phones in portrait and landscape. Continue the existing shared database/workflow and deployment setup.

Confirmed gaps: width-only phone media rules stop at 768px, so landscape touch phones can receive desktop styling and the wrong agenda renderer; TLD rejects supported files when browser File.type is empty/generic and submits a generic data-URI MIME type.

Use narrow-viewport styling below 768px, plus touch/no-hover styling below 1024px. Keep CSS, agenda rendering and tab navigation on the same rule. Preserve readable form text, touch targets, hidden scrollbar tracks and all validation/workflow rules. Infer missing/generic upload MIME types only for the existing supported file extensions; continue rejecting unsupported MIME types and files over 5 MiB.

Verify all four page routes and key forms/dialogs with local fixtures; use read-only checks against deployments. Camera hardware and real-device Safari cannot be proven with desktop browser checks and must be reported accurately.
