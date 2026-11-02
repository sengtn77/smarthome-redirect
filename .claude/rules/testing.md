---
paths:
  - "**/*.test.js"
  - "test/**"
  - "src/**"
---

# Testing rules

- TDD: write the failing test first, and see it fail for the right reason.
- Tests are deterministic: no real network and no real clock.
- Never commit `.only` or `.skip`.
- Test error paths, especially invalid, missing or malformed `state` and disallowed URL schemes.
- Tests live in `test/` and are named `<unit>.test.js`; run them with `node --test`.
