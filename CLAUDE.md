# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An OAuth redirect bridge for the SmartHome eWelink app. eWelink redirects the browser to the hosted `index.html` with `?code=…&region=…&state=…`. The page reads `state` (JSON set by the app: `{r: returnUrl, n: nonce}`) and forwards the whole query string to the app's deep link. Only the `exp`, `exps` and `smarthome` URL schemes are allowed; anything else shows "Invalid login response."

This is a security-sensitive path: it handles OAuth authorization codes and chooses a redirect target. Treat any change to the redirect logic as consequential.

## Commands

There is no build or lint step and there are no dependencies (see `.seng/config.yaml`, `verify.*`). Node 24 is available locally.

- Test: `node --test` (tests live in `test/`, e.g. `test/redirect.test.js`)
- Coverage: `node --test --experimental-test-coverage` (Definition of Done requires ≥ 80%)

CI runs the tests via `.github/workflows/test.yml`.

## Architecture

A static page with no server and no dependencies. `index.html` has an inline `<script type="module">` that imports `resolveTarget` from `./src/redirect.js`. `resolveTarget(search)` holds the redirect decision logic: it parses `state`, allows only the `exp`, `exps` and `smarthome` schemes, and returns the target URL with the query string appended, or `null` if invalid. `index.html` calls it and performs the `location.replace`, treating a throw as invalid. `package.json` sets `"type": "module"` so Node tests can import `src/redirect.js`.

### Deployment notes

- `src/` must be published next to `index.html`; the page fails without `src/redirect.js`.
- Keep the `resolveTarget` contract stable. If it changes, update the import URL in `index.html` with a `?v=` cache-busting query (e.g. `./src/redirect.js?v=2`) in the same commit.
- Opening `index.html` via `file://` no longer works because browsers block module imports there. Serve it over HTTP (e.g. `npx serve` or `python3 -m http.server`) to test locally.

## AI SDLC
This repo follows the seng AI SDLC (seng-harness + seng-orch plugins).
- Feature work goes through `/seng-orch:make <#issue>`; never commit to the default branch.
- Only issues labelled `agent-ready` (design approved by a lead) are built by agents.
- Work is done when it meets the Definition of Done: CI green, coverage ≥ 80%, two-stage agent review passed, human peer approval, squash-merged with `/seng-orch:make-clean`.
- Session records in `.seng/sessions/` are audit evidence: commit them, never hand-edit gate lines.
