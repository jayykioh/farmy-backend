## Why

Currently, when a user completes a reminder/task, the system only grants 10 XP and sets the mascot's mood to happy. It completely bypasses the daily streak logic (`streak_count`, `last_diary_date`, `missed_days`) which is currently hardcoded only into the diary creation flow. This leads to inconsistent user experiences where completing tasks doesn't advance their streak, violating the expectation that any daily engagement maintains the streak.

## What Changes

- Extract the shared daily streak update logic out of the diary creation flow and make it a shared utility in `PetService`.
- Introduce `updateAfterTaskCompleted(userId, completedAt)` in `PetService` to grant task-specific XP while maintaining the identical VN-day streak progression logic.
- Update `ReminderService.complete()` to call this new method instead of the limited `updateMoodOnReminderCompleted`.
- Make `ReminderService.complete()` idempotent to prevent users from repeatedly gaining XP or falsely advancing streaks by clicking "complete" multiple times. We will use a silently-success approach (returning early).
- Add focused tests covering same-day completion, next-day streak increments, broken streak resets, milestone mood changes (e.g., excited), and idempotency on repeated completions.

## Capabilities

### New Capabilities
- `mascot-task-streak`: Mascot mood and streak synchronization upon task/reminder completion.

### Modified Capabilities
- (None)

## Impact

- **Backend Application Services**: `PetService` and `ReminderService` will have modified flows.
- **Data Integrity**: Prevents XP/streak farming via idempotent reminder completion.
- **Database Schema**: No changes. We will reuse `last_diary_date` to represent the "last action date" to avoid sweeping migrations.
- **User Experience**: Users will now correctly maintain and advance their streaks when completing gardening tasks, improving retention and gamification consistency.
