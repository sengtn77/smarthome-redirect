# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An OAuth redirect bridge for the SmartHome eWelink app. eWelink redirects the browser to the hosted `index.html` with `?code=…&region=…&state=…`. The page reads `state` (JSON set by the app: `{r: returnUrl, n: nonce}`) and forwards the whole query string to the app's deep link. Only the `exp`, `exps` and `smarthome` URL schemes are allowed; anything else shows "Invalid login response."

This is a security-sensitive path: it handles OAuth authorization codes and chooses a redirect target. Treat any change to the redirect logic as consequential.

## Commands

No build, lint or test commands exist yet. They are added by the first task (see `.seng/config.yaml`, `verify.*`). Node 24 is available locally, so `node --test` is the intended test runner.

## Architecture

A single static file, `index.html`, with an inline script. There is no server and no dependencies.

## AI SDLC
This repo follows the seng AI SDLC (seng-harness + seng-orch plugins).
- Feature work goes through `/seng-orch:make <#issue>`; never commit to the default branch.
- Only issues labelled `agent-ready` (design approved by a lead) are built by agents.
- Work is done when it meets the Definition of Done: CI green, coverage ≥ 80%, two-stage agent review passed, human peer approval, squash-merged with `/seng-orch:make-clean`.
- Session records in `.seng/sessions/` are audit evidence: commit them, never hand-edit gate lines.
