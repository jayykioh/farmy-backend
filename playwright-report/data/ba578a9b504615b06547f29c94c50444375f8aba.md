# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-farm-core.spec.ts >> Journey 2: Farm Core CRUD >> should create a farm plot
- Location: playwright/tests/02-farm-core.spec.ts:16:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED ::1:3000
Call log:
  - → POST http://localhost:3000/api/v1/auth/login
    - user-agent: Playwright/1.61.1 (arm64; macOS 26.5) node/23.11
    - accept: application/json
    - accept-encoding: gzip,deflate,br
    - Content-Type: application/json
    - content-length: 55

```