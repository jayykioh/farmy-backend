## 1. Schema & Executions Collection

- [x] 1.1 Create `idempotency_executions` schema: `userId`, `idempotencyKey`, `requestHash`, `status` (`processing`|`completed`|`failed`), `ownerToken`, `leaseUntil`, `heartbeatAt`, `attemptCount`, `uploadedKeys`, `responseData`.
- [x] 1.2 Create compound unique index on `{ userId: 1, idempotencyKey: 1 }`. (DiaryLog partial index `{ user_id, idempotency_key }` should also be created).
- [x] 1.3 Create atomic lock manager logic (insert new, handle `processing` active, implement Atomic Takeover for expired lease or `failed` status).

## 2. API Contract & Shared Hash Fixture

- [x] 2.1 Update DiaryHistory endpoint to ensure it exposes `logId` and `idempotencyKey` so the FE can deduplicate.
- [x] 2.2 Implement Canonical Hash matching the strict definition (6 fields: `diaryId`, `activityType`, `content`, `diaryDate`, `cropType`, `imageDigests`). Apply NFC, ISO UTC, A-Z sort.
- [x] 2.3 Create a shared unit test using a cross-repo JSON fixture.

## 3. Service Layer Transaction & Safe R2 Cleanup

- [x] 3.1 `DiaryLogService.createIdempotent()`: Validate Hash -> Acquire/Takeover execution lock.
- [x] 3.2 If lock acquired: Upload to R2 -> Save paths to `uploadedKeys` -> Open Mongo `session.withTransaction()`.
- [x] 3.3 Inside transaction: Insert Diary, update Pet, AND update execution lock to `completed`. Commit.
- [x] 3.4 If transaction fails: Delete R2 objects via `uploadedKeys` ONLY IF `execution.ownerToken === currentOwnerToken`. Update execution lock to `failed`. Rollback session.

## 4. Test Matrix (Backend)

- [x] 4.1 Test: backend computes canonical hash matching the shared JSON fixture on the exact 6 fields.
- [x] 4.2 Test: compound unique index `{ userId, idempotencyKey }` prevents global collision but allows different users to use the same UUID.
- [x] 4.3 Test: `processing` lock with active lease returns `IDEMPOTENCY_IN_PROGRESS`.
- [x] 4.4 Test: `processing` lock with EXPIRED lease triggers atomic takeover (new ownerToken, proceeds to upload).
- [x] 4.5 Test: missing `Idempotency-Key` or `X-Request-Hash` returns 400.
- [x] 4.6 Test: R2 cleanup ONLY executes if the current request's `ownerToken` matches the DB record's `ownerToken`.
- [x] 4.7 Test: transaction commit includes the execution lock `completed` update (no commit gap).
- [x] 4.8 Test: replica set Mongo environment is configured in test setup for transaction support.
