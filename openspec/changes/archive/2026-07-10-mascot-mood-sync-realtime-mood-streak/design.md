## Context

Currently, the daily streak logic (`streak_count`, `last_diary_date`, `missed_days`) is tightly coupled to the diary creation flow (`DiaryService.createLog` -> `PetService.updateAfterDiaryCreated`). When a user completes a daily reminder (task), it triggers `PetService.updateMoodOnReminderCompleted`, which grants 10 XP and sets mood to happy, but does not update streak fields. Users expect completing any daily action (diary or task) to maintain their streak.

## Goals / Non-Goals

**Goals:**
- Extract shared streak progression logic into a reusable method in `PetService`.
- Update reminder completion to trigger the streak logic.
- Prevent abuse by ensuring reminder completion is idempotent.

**Non-Goals:**
- Renaming the `last_diary_date` field in the database. We will keep the field name to avoid unnecessary database migrations.
- Altering frontend display logic.

## Decisions

**Decision 1: Centralized Streak Calculation**
- We will extract the streak calculation (determining if it's the same day, next day, or a broken streak) from `updateAfterDiaryCreated` into a new private method `calculateNewStreak(currentPet, actionDate)`.
- **Rationale**: DRY principle. Both diary and task completion need exactly the same rules for VN timezone daily resets.

**Decision 2: New Entry Point for Tasks**
- Create `updateAfterTaskCompleted(userId, completedAt)` in `PetService` that reuses the shared streak calculation but grants task-specific XP (10 XP).
- **Rationale**: Keeps XP grants distinct while unifying the streak lifecycle.

**Decision 3: Idempotent Reminder Completion**
- We will add a `status` check in `ReminderService.complete()` before calling `PetService.updateAfterTaskCompleted()`. If `status === 'delivered'` or `status === 'completed'`, it returns early (silently success).
- **Rationale**: Prevents users from repeatedly calling `PATCH /api/v1/reminders/:id/complete` to farm XP. Silently returning success prevents disruptive frontend error toasts for simple network double-clicks.

## Risks / Trade-offs

- [Risk] Timezone mismatch between task completion and streak calculation → [Mitigation] Ensure `updateAfterTaskCompleted` uses the same timezone utility (VN time) as diary creation.
- [Risk] Broken Streak edge case on tasks → [Mitigation] Write comprehensive unit tests mimicking next-day and broken-streak timeframes specifically for `updateAfterTaskCompleted`.
