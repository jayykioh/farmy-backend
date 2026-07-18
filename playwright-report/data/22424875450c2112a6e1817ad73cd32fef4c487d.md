# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-chat-rag.spec.ts >> Journey 3: AI Chat (RAG) + SSE Streaming >> should stream chat completion using server-sent events (SSE)
- Location: playwright/tests/03-chat-rag.spec.ts:14:7

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