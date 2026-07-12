## Context

Idempotency guarantees that a network retry does not duplicate side effects. Concurrent retries risk overwriting or deleting R2 images mid-flight, and Mongo transaction commit gaps risk isolating execution states. We must achieve **Effectively-once business processing + idempotent image storage + compensating R2 cleanup** using a compound unique execution index and atomic lease takeovers.

## Goals / Non-Goals

**Goals:**
- Effectively-once semantics: Mongo Transaction guarantees atomic DiaryLog and Pet/Streak commits.
- Atomic execution reservation: Prevent concurrency races using an `IdempotencyExecution` lock with `leaseUntil`, `heartbeatAt`, and atomic takeovers.
- Exact Canonical Hash matching with frontend to guarantee payload integrity.
- Safe R2 cleanup: Delete R2 objects ONLY if the current request holds the `ownerToken`.

## Decisions

1. **Atomic Idempotency Reservation & Compound Index**
   - *Rationale*: We introduce an `idempotency_executions` collection with a compound unique index on `{ userId: 1, idempotencyKey: 1 }`. This scopes keys to the user, preventing global conflicts.
   - *Schema*: Includes `requestHash`, `status` (`processing`|`completed`|`failed`), `ownerToken`, `leaseUntil`, `heartbeatAt`, `attemptCount`, and `uploadedKeys` (array of R2 paths).

2. **Lease Takeover & Retry Behavior**
   - *Rationale*: If a lock is `processing` but `leaseUntil` is expired, a new request (with same hash) can perform an atomic takeover (generate new `ownerToken`, renew lease). If it's `failed` (same hash), it also takes over. If hash mismatches in any state -> 409.

3. **Transaction Scope (Effectively-once)**
   - *Rationale*: Updating the `IdempotencyExecution` to `completed` MUST occur inside the EXACT SAME `session.withTransaction()` as the `DiaryLog` insert and `Pet/Streak` updates. This eliminates the commit gap.

4. **Owner-Safe R2 Cleanup**
   - *Rationale*: If the transaction fails, the cleanup worker checks `execution.ownerToken === currentOwnerToken`. If true, it deletes the paths in `uploadedKeys`. This prevents a stalled request from deleting images uploaded by a successful retry.
