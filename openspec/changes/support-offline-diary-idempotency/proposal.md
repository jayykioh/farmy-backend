## Why

To support the robust offline-first frontend architecture, the backend must implement exact idempotency semantics. A simple unique index is not enough; we must ensure atomic commits (diary + side effects), partial index compatibility for legacy records, deterministic image uploads to R2 to prevent dangling objects on retry, and request hashing to prevent key reuse conflicts.

## What Changes

- **BREAKING**: Require the `Idempotency-Key` and `X-Request-Hash` headers on `POST /api/v1/diaries/:diaryId/logs`. Return 400 if missing or invalid.
- Implement a **partial unique index** (`user_id` + `idempotency_key`) filtering for non-null string keys.
- Wrap the DiaryLog creation and all gamification/pet side-effects inside a **MongoDB Transaction** (with outbox pattern for async events).
- Implement deterministic R2 paths for images based on `idempotency_key`.
- Check `X-Request-Hash` to return 409 if a key is reused with different payload content.

## Capabilities

### New Capabilities

*(None)*

### Modified Capabilities

- `core_features_spec`: Enforce exactly-once processing, transaction boundaries for side-effects, and deterministic R2 uploads for diary logs.

## Impact

- Diary logs API (`POST /api/v1/diaries/:diaryId/logs`)
- Gamification/streak update hooks (must run in transaction)
- Image upload service (deterministic paths)
- MongoDB schema and indexes
