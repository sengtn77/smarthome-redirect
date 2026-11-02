# Add a test harness for the redirect logic

Source: https://github.com/sengtn77/smarthome-redirect/issues/1
Created: 2026-11-02

## Requirements
R1. The redirect decision is a pure function `resolveTarget(search) -> string | null` in `src/redirect.js` (ES module).
    Acceptance: unit tests import and call it under `node --test` without a browser.
R2. `index.html` uses that function via `<script type="module">`; the page behaves exactly as before for every input.
    Acceptance: characterization tests written first against the current inline logic pass before and after the extraction.
R3. Tests cover: valid `exp`, `exps`, `smarthome` targets; a target with and without an existing `?`; missing, empty and malformed `state`; non-JSON `state`; disallowed schemes (`https:`, `javascript:`, `data:`); a missing `r`.
    Acceptance: each case has a test; error paths return the invalid-response result (`null`).
R4. `.seng/config.yaml` `verify.test` = `node --test` and `verify.coverage` = `node --test --experimental-test-coverage`; coverage >= 80%.
    Acceptance: both commands exit 0 locally.
R5. A GitHub Actions workflow runs the same commands on pull requests.
    Acceptance: CI is green on the PR.
NF1. Zero dependencies, no build step (Node built-in test runner).
NF2. Security: OAuth-code path. Allowed schemes stay exactly `exp`, `exps`, `smarthome`; no behavior change, no tightening of validation.
NF3. CLAUDE.md Commands/Architecture sections updated.

## Design

**Brownfield.** The repo is one static file, `index.html`, whose inline classic script (an IIFE)
holds all the logic. There is no `package.json`, no `src/`, no `test/`, no CI. The design keeps the
page's observable behavior identical and only moves the decision into a testable pure function.
The module-loading choice (static `import` in `<script type="module">` of ES module
`src/redirect.js`) is a recorded Gate 1 decision in `STATUS.md` and is not revisited here.

**Behavior to preserve exactly (NF2).** The current logic, given `query = location.search`:
1. `state = JSON.parse(new URLSearchParams(query).get('state'))`. Missing `state` -> `get` returns
   `null` -> `JSON.parse(null)` returns `null` -> `null.r` throws -> invalid. Empty `state` ->
   `JSON.parse('')` throws -> invalid. Non-JSON / malformed JSON throws -> invalid.
2. `target = String(state.r)`. Missing `r` -> `"undefined"` -> fails the regex -> invalid. Non-object
   JSON (e.g. `5`, `"x"`, `true`) -> `.r` is `undefined` -> invalid. Coercion quirk: `r` as an array
   `["exp://x"]` stringifies to `exp://x` and is **accepted**; this must stay.
3. Allow-list: `/^(exp|exps|smarthome):\/\//` (case-sensitive, anchored at start only, requires `//`).
   So `EXP://x`, ` exp://x` (leading space), `exp:x`, `https://…`, `javascript:…`, `data:…` are invalid.
4. Result: if `target` has no `?` -> `target + query` (query includes its leading `?`); otherwise
   `target + '&' + query.slice(1)`. A target ending in a bare `?` yields `…?&code=…`; preserve it.
5. **`location.replace(...)` is inside the `try`.** Browsers throw a `SyntaxError` `DOMException`
   synchronously when the URL cannot be parsed (e.g. `exp://a b` — space in an opaque host;
   `exp://[` — bad IPv6 host; `exp://h:99999` — port out of range). That throw is caught and the
   page shows the invalid text. So the page outcome for those inputs is **invalid**, even though
   they pass the scheme regex.
6. Any thrown error -> invalid. Invalid -> `document.body.textContent = 'Invalid login response.'`;
   valid -> `location.replace(result)` succeeds and nothing else happens.

**New shape.**
- `src/redirect.js` exports `resolveTarget(search)`: steps 1-4 above, returning the URL string, or
  `null` from a catch-all `try/catch` on any invalid path. It is pure: no DOM, no `location`, and it
  does **not** URL-parse the result. Documented contract (in a JSDoc comment on the function):
  "returns the candidate redirect URL, or `null` if invalid; the result may still be rejected by
  `location.replace` (unparseable URL), and the caller must treat that throw as invalid." For
  `exp://a b` etc. `resolveTarget` legitimately returns a string. Module code is strict mode; none of
  steps 1-4 change under strict mode.
- `index.html` replaces the classic script with module glue that mirrors the original's structure,
  keeping `location.replace` inside the `try` and the fallback after it:
  ```html
  <script type="module">
    import { resolveTarget } from './src/redirect.js';
    (() => {
      try {
        const target = resolveTarget(location.search);
        if (target !== null) {
          location.replace(target);
          return;
        }
      } catch (e) {}
      document.body.textContent = 'Invalid login response.';
    })();
  </script>
  ```
  Keep the two explanatory comments. The `<p>` text and everything else in the page is unchanged.
- `package.json` (new, minimal): `{"name": "smarthome-redirect", "private": true, "type": "module"}`.
  No dependencies, no scripts. It makes Node treat `src/*.js` and `test/*.js` as ESM
  deterministically (no reliance on syntax detection, no typeless-package warnings). Browsers ignore it.

**Test strategy (R2, R3).** A single test file `test/redirect.test.js` holds the case table and
the adapters.

Case table rows: `{ name, search, resolved, page }`.
- `resolved`: expected `resolveTarget(search)` result (string or `null`).
- `page` (optional): expected page outcome, `{ replaced: <url> }` or `'invalid'`. If omitted it is
  derived from `resolved` (`null` -> `'invalid'`, string -> `{ replaced: resolved }`).
- Page-level rows (unparseable URLs) set `resolved` to the string and `page: 'invalid'`. This is the
  only place where the two expectations differ.

Adapters:
- **Fake browser environment** (shared by the page adapters): `location = { search, replace(u) }`
  where `replace` first does `new URL(u)` (Node's WHATWG URL parser, same algorithm as browsers) and
  re-throws a `SyntaxError` on failure, mirroring the browser's `DOMException`; only on success does
  it record `u`. `document = { body: {} }`. Plus `URLSearchParams`. The adapter returns
  `{ replaced: u }` or `'invalid'` (when `document.body.textContent === 'Invalid login response.'`)
  and asserts exactly one of the two happened (never both, never neither).
- **Inline-script adapter (before extraction, page-level).** Reads `index.html`, extracts the
  classic `<script>` body, runs it with `node:vm` in the fake environment. Checked against `page`
  for **every** row, including the unparseable-URL rows.
- **Function adapter.** Calls `resolveTarget(search)` from `../src/redirect.js`. Checked against
  `resolved` for every row.
- **Page-glue adapter (after extraction, page-level).** Extracts the `<script type="module">` body
  from `index.html`, asserts the import line is exactly
  `import { resolveTarget } from './src/redirect.js';`, strips that line, and runs the rest with
  `node:vm` in the fake environment with the real `resolveTarget` injected into the context.
  Checked against `page` for every row.

Retargeting: when `index.html` switches to the module script, the inline-script adapter is replaced
by the page-glue adapter; the case table is not edited. The table passing against the inline-script
adapter (before) and against the function + page-glue adapters (after) is the R2 evidence. Log both
runs in the TDD log.

Characterization RED: these tests describe existing behavior, so they pass on first real run. The
RED step for T1 is the test failing because the harness does not exist yet (or a deliberately
wrong expectation, then corrected); record which in the TDD log.

**Verification / CI (R4, R5).** `.seng/config.yaml`: `verify.test: "node --test"`,
`verify.coverage: "node --test --experimental-test-coverage"`. Node 24's default test glob finds
`test/redirect.test.js`. Coverage reports `src/redirect.js` (expected 100%); the vm-executed HTML
snippets are not counted, which is fine. New workflow `.github/workflows/test.yml`: trigger
`pull_request`; top-level `permissions: contents: read`; one job on `ubuntu-latest`;
`actions/checkout` and `actions/setup-node` pinned to full 40-char commit SHAs with a trailing
version comment (e.g. `uses: actions/checkout@<sha> # v4.x.y`), `node-version: 24`; then run
`node --test` and `node --test --experimental-test-coverage`. No install step (zero deps).

**Files.**
| File | Change |
|---|---|
| `package.json` | add (minimal, `"type": "module"`) |
| `test/redirect.test.js` | add (case table + adapters) |
| `src/redirect.js` | add (`resolveTarget`) |
| `index.html` | change classic inline script -> module glue (try/catch preserved) |
| `.seng/config.yaml` | set `verify.test`, `verify.coverage`; drop the "no tests yet" comment |
| `.github/workflows/test.yml` | add |
| `CLAUDE.md` | update Commands and Architecture |

Integration points: `index.html` -> `./src/redirect.js` (static relative import, same origin as the
hosted page); CI -> the two `verify` commands. No diagram needed.

## Tasks

T1. Characterization harness + valid targets without `?` (R2, R3)
   - Files: `package.json` (new), `test/redirect.test.js` (new).
   - Build the fake browser environment (with `new URL`-validating `location.replace`), the
     inline-script adapter, and the case table with `resolved`/`page` columns. Rows: `exp://`,
     `exps://`, `smarthome://` targets with no `?`, each with
     `?code=C&region=R&state=<encodeURIComponent(JSON)>`; `resolved` = `target + search`.
   - Test: `node --test` -> rows pass against the inline-script adapter; adapter asserts exactly
     one outcome.

T2. Characterize targets that already contain `?` (R2, R3)
   - Files: `test/redirect.test.js`.
   - Rows: `exp://host/path?x=1` -> `exp://host/path?x=1&code=…`; target ending in bare `?` ->
     `…?&code=…` (quirk preserved).
   - Test: new rows pass against the inline-script adapter.

T3. Characterize error paths and allow-list edges (R2, R3, NF2)
   - Files: `test/redirect.test.js`.
   - Rows, all `resolved: null`: no `state` param; `state=` (empty); malformed JSON (`{"r":`);
     non-JSON (`abc`); `state=null`; non-object JSON (`5`); object without `r`; `r` = `https://…`,
     `javascript:alert(1)`, `data:text/html,…`; `EXP://x` (uppercase); ` exp://x` (leading space);
     `exp:x` (no `//`); empty search string.
   - Quirk row, accepted: `r` = `["exp://x"]` -> `resolved: 'exp://x' + search`.
   - Test: all rows pass against the inline-script adapter.

T4. Characterize unparseable-URL page-level rows (R2, NF2)
   - Files: `test/redirect.test.js`.
   - Rows with `resolved` = the concatenated string and `page: 'invalid'`: `r` = `exp://a b`,
     `exp://[`, `exp://h:99999`.
   - Also a unit test for the fake itself: `replace('exp://a b')` throws and records nothing.
   - Test: rows pass against the inline-script adapter (the original's `try` catches the throw).
     Record this full green run as the "before" evidence.

T5. Extract `resolveTarget` into `src/redirect.js` (R1)
   - Files: `src/redirect.js` (new), `test/redirect.test.js`.
   - RED: add the function adapter checking `resolved` for every row; fails on missing module.
   - GREEN: implement `resolveTarget` per Design steps 1-4 with the JSDoc contract (may return a
     string that `location.replace` rejects; caller treats the throw as invalid).
   - Test: whole table passes against the inline-script adapter (`page`) and the function adapter
     (`resolved`), including the unparseable rows returning strings.

T6. Switch `index.html` to the module script and retarget characterization (R2, NF2)
   - Files: `index.html`, `test/redirect.test.js`.
   - RED: replace the inline-script adapter with the page-glue adapter; fails because `index.html`
     has no `<script type="module">` yet.
   - GREEN: replace the classic script with the module glue in Design (`location.replace` inside
     `try`, invalid text after it).
   - Test: whole table passes against the function adapter (`resolved`) and the page-glue adapter
     (`page`), including the three unparseable rows showing the invalid text; import-line assertion
     passes. Record this as the "after" evidence.

T7. Wire verify commands and confirm coverage (R4)
   - Files: `.seng/config.yaml`.
   - Set `verify.test: "node --test"`, `verify.coverage: "node --test --experimental-test-coverage"`.
   - Test: both commands exit 0 locally; coverage output shows `src/redirect.js` line coverage >= 80%.
     Log command, exit code and coverage line in the TDD log.

T8. CI workflow (R5)
   - Files: `.github/workflows/test.yml` (new).
   - `on: pull_request`; `permissions: contents: read`; `ubuntu-latest`; `actions/checkout` and
     `actions/setup-node` pinned to full commit SHAs with a version comment; `node-version: 24`;
     steps `node --test` and `node --test --experimental-test-coverage`.
   - **Builder must look up the SHAs** (the architect had no shell): resolve the latest release tag
     of each action, e.g. `gh api repos/actions/checkout/releases/latest --jq .tag_name` then
     `gh api repos/actions/checkout/commits/<tag> --jq .sha` (same for `actions/setup-node`). Do not
     invent SHAs; record the tag and SHA used in the TDD log.
   - Test: workflow run on the PR is green (acceptance verified at PR time).

T9. Update CLAUDE.md (NF3)
   - Files: `CLAUDE.md`.
   - Commands: `node --test`, `node --test --experimental-test-coverage`, Node 24, no install step.
   - Architecture: `index.html` (module glue; `location.replace` inside `try`, invalid text
     fallback) -> `src/redirect.js` (`resolveTarget`, pure, may return a URL the browser rejects);
     `test/redirect.test.js` (case table with `resolved`/`page` + vm adapters with a
     `new URL`-validating fake `location.replace`); `package.json` exists only for
     `"type": "module"`; CI in `.github/workflows/test.yml`.
   - Deployment notes: `src/` must be published next to `index.html` (relative import
     `./src/redirect.js`). Keep the `resolveTarget` contract (name, signature, return values)
     stable; if it must change, change the import URL in `index.html` (e.g. a `?v=` cache-busting
     query) in the same commit so a cached old module cannot pair with a new page (deploy version skew).
   - Test: review only (doc change); `node --test` still green.

## Specialists
none. `debugger` only if the `node:vm` harness behaves unexpectedly (e.g. cross-realm or
context-global issues) and T1 or T6 fails for a reason that is not the intended one.

## Needs human acknowledgment
These are not decided by this plan. A human (lead) must acknowledge them before merge:
1. **Module load failure.** If `src/redirect.js` fails to load (404, network error, a browser
   without module support, a blocked MIME type), the module script never runs and the page stays on
   "Returning to the SmartHome app…". Previously such failures could not occur (inline script), and
   an invalid input showed "Invalid login response." This plan adds no fallback (static `import`
   per Gate 1). Acknowledge, or add a requirement.
2. **Hosting / redirect-URL assumptions.** The plan assumes the hosted site serves the repo so that
   `src/redirect.js` is reachable at the same origin and path as `index.html`, with a JavaScript
   MIME type, and that the OAuth redirect URL registered with eWelink still points at the same
   `index.html` (unchanged). Confirm.

## Out of scope
- Any change to validation: no new schemes, no case-insensitivity, no stricter checks on `r`
  (the array-coercion quirk and bare-`?` quirk stay), no URL parsing inside `resolveTarget`, no
  nonce (`n`) verification.
- Browser/e2e tests (Playwright, jsdom) and any dependency.
- Enforcing the 80% threshold inside the coverage command (e.g. `--test-coverage-lines=80`);
  R4 fixes the exact command.
- Lint, typecheck, formatter, build tooling, npm scripts.
- A fallback for module load failure (see "Needs human acknowledgment").
- Deployment / hosting configuration changes.
