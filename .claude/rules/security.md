---
paths:
  - "index.html"
  - "src/**"
---

# Security rules

- No hardcoded secrets. Read them from the environment or a secret manager.
- The redirect target comes from user-controlled input (`state`). Allow-list the scheme and validate it before navigating. Never widen the allow-list without human approval.
- Never log or display the OAuth `code`, `state` or any part of the query string.
- Validate input at trust boundaries: parse `state` defensively and treat a parse failure as invalid.
- New dependencies need human approval.
- Production systems and real user data are off-limits to agents.
