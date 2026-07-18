# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-auth.spec.ts >> Journey 1: Auth Flow >> should successfully log out and clean cookie state
- Location: playwright/tests/01-auth.spec.ts:52:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED ::1:3000
Call log:
  - → POST http://localhost:3000/api/v1/auth/logout
    - user-agent: Playwright/1.61.1 (arm64; macOS 26.5) node/23.11
    - accept: application/json
    - accept-encoding: gzip,deflate,br
    - Content-Type: application/json

```