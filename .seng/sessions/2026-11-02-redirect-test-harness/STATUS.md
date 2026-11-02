# Status: Add a test harness for the redirect logic

Branch: feat/1-test-harness
Session: .seng/sessions/2026-11-02-redirect-test-harness

## Gates
- Verification: PASSED
- Spec review: PASSED
- Quality review: APPROVED

## Decisions
<!-- date — decision — who (agent or human) -->
2026-11-02 — Module loading: ES module src/redirect.js loaded by <script type="module"> (Gate 1 design decision on issue #1) — sengtn77
2026-11-02 — Plan approved after advocate round 2 (NEEDS_ACKNOWLEDGMENT): (1) index.html redirect script moves to module + src/redirect.js, (2) new CI workflow with SHA-pinned actions, (3) no fallback if src/redirect.js fails to load (fails closed), (4) host must serve src/ next to index.html with JS MIME type, redirect URL unchanged; smoke test on deployed site needed before merge — approved by sengtn77 (explicit answer in session)
2026-11-02 — Advocate round 1 BLOCK (location.replace try/catch dropped, CI hardening, version skew) fixed in PLAN.md by architect — agents
2026-11-02 — Advocate low notes to apply: T4 log says unparseable-URL rows reflect spec/Node not every browser; page-glue adapter may prefix "use strict"; CLAUDE.md notes file:// no longer works — agents

## TDD log
<!-- one entry per task: RED / GREEN / REFACTOR command + exit code + key output lines -->

### T1 — characterization harness + valid targets (builder)
- RED: `node --test` exit 1 — 3 failed (deliberate extra suffix on expected `resolved`; only the suffix differed)
- GREEN: `node --test` exit 0 — tests 3, pass 3, fail 0
- REFACTOR: `node --test` exit 0 — tests 3, pass 3, fail 0

### T2 — targets that already contain `?` (builder)
- RED: `node --test` failed on both new rows (deliberately wrong expectation without the `&` join); exit code not captured by the builder (zsh PIPESTATUS), failing assertions shown in its output
- GREEN: `node --test` exit 0 — tests 5, pass 5, fail 0
- REFACTOR: `node --test` exit 0 — tests 5, pass 5, fail 0

### T3 — error paths and allow-list edges (builder)
- RED: `node --test; echo exit=$?` exit=1 — quirk row failed (deliberately wrong expectation `exp://WRONG`)
- GREEN: `node --test` exit=0 — tests 20, pass 20, fail 0
- REFACTOR: no change; `node --test` exit=0 — tests 20, pass 20, fail 0

### T4 — unparseable-URL page-level rows (builder) — BEFORE-extraction evidence
- RED: `node --test; echo exit=$?` exit=1 — tests 24, pass 21, fail 3 (rows without `page: 'invalid'`; actual 'invalid')
- GREEN: `node --test` exit=0 — tests 24, pass 24, fail 0, against the original inline script in index.html (unparseable rows show the invalid text). This is the "before" run.
- REFACTOR: no change; `node --test` exit=0 — 24/24
- Note: unparseable-URL rows reflect the WHATWG URL spec / Node, not necessarily every browser.

### T5 — extract resolveTarget into src/redirect.js (builder)
- RED: `node --test; echo exit=$?` exit=1 — ERR_MODULE_NOT_FOUND for src/redirect.js
- GREEN: `node --test` exit=0 — tests 47, pass 47, fail 0 (inline-script adapter on `page`, function adapter on `resolved`)
- REFACTOR: none needed (first full run was GREEN, not re-run)

### T6 — module glue in index.html, retarget characterization (builder) — AFTER-extraction evidence
- RED: `node --test; echo exit=$?` exit=1 — page-glue adapter: index.html had no `<script type="module">`
- GREEN: `node --test` exit=0 — tests 47, pass 47, fail 0; same case table, unchanged rows, function adapter (`resolved`) + page-glue adapter (`page`)
- REFACTOR: none; `node --test` exit=0 — 47/47

### T7 — verify commands in .seng/config.yaml (builder)
- RED: `verify.test` and `verify.coverage` were empty strings before the change
- GREEN: `node --test; echo exit=$?` exit=0 (47/47); `node --test --experimental-test-coverage; echo exit=$?` exit=0 — src/redirect.js 100% lines/branches/funcs

### T8 — CI workflow .github/workflows/test.yml (builder)
- Pinned actions/checkout v7.0.1 = 3d3c42e5aac5ba805825da76410c181273ba90b1; actions/setup-node v7.1.0 = 949feb2413d6458794dcd2491c4babbbce0c15c1 (orchestrator re-verified both via `gh api`)
- YAML parses (ruby YAML exit 0). CI green is verified at PR time.

### T9 — CLAUDE.md Commands/Architecture/Deployment notes (scribe)
- Doc change applied (explicitly requested in the /make request); `node --test` still green

### Validator
- Added 6 tests (5000-input seeded differential test vs verbatim original logic; 500-input differential test of index.html glue; edge cases). Result PASSED, no bugs found.
- `node --test --experimental-test-coverage` exit 0 — tests 53, pass 53, fail 0; src/redirect.js 100%

## Reviews
<!-- each review round: reviewer, verdict, findings summary -->

### Round 1 — spec-reviewer (stage 1): PASSED
- R1-R5, NF1-NF3 MET (R4/R5 by inspection; CI green verified at PR time). No required changes.
- Recommended: run verify commands (done in Verification); lead to approve extra differential/edge tests (test/redirect.test.js, validator-added, strengthen NF2) or ask removal; optional CLAUDE.md harness description.

### Round 1 — quality-reviewer (stage 2): APPROVED
- No blocking findings. Advisory (not applied): (1) CLAUDE.md should say to update `IMPORT_LINE` in test/redirect.test.js with any import URL change, and briefly describe the test harness; (2) test name "object r with custom toString" has no such input (add `{ toString: 1 }` or rename); (3) src/redirect.js:19 use `catch {}` plus a one-line comment.

## Verification
<!-- final verification commands, exit codes, output -->

Final fresh run (build/lint/typecheck are empty = not applicable):
- `node --test` → exit 0 — tests 53, pass 53, fail 0
- `node --test --experimental-test-coverage` → exit 0 — tests 53, pass 53, fail 0; src/redirect.js 100% lines / 100% branches / 100% funcs (all files 100%); threshold 80%
