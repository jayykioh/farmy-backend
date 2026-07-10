## 1. Core Logic Refactoring

- [x] 1.1 Extract `calculateNewStreak(currentPet, actionDate)` as a private shared method in `PetService`.
- [x] 1.2 Refactor `updateAfterDiaryCreated` in `PetService` to use the new `calculateNewStreak` method.
- [x] 1.3 Implement `updateAfterTaskCompleted(userId, completedAt)` in `PetService` that reuses `calculateNewStreak` but grants task-specific XP (10 XP).

## 2. Reminder Completion Update

- [x] 2.1 Update `ReminderService.complete()` to add an idempotency check (`status === 'delivered'` or `status === 'completed'`). If already completed, return the reminder early.
- [x] 2.2 Update `ReminderService.complete()` to call `PetService.updateAfterTaskCompleted` instead of `updateMoodOnReminderCompleted`.
- [x] 2.3 Remove or deprecate the old `updateMoodOnReminderCompleted` method in `PetService` if it's no longer used.

## 3. Testing

- [x] 3.1 Add unit tests for `calculateNewStreak` covering same-day (no increment), next-day (increment), and broken streak (reset) scenarios.
- [x] 3.2 Add unit tests for `updateAfterTaskCompleted` covering milestone mood changes (e.g., streak multiple of 3 triggers 'excited' mood).
- [x] 3.3 Add unit tests for `ReminderService.complete()` to verify idempotency (double-clicking returns early, doesn't grant XP twice).

