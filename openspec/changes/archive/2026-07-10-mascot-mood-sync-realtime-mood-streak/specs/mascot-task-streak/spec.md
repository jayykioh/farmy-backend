## ADDED Requirements

### Requirement: Task Completion Streak Progression
The system SHALL update the user's daily streak when they complete a task/reminder, following the same logic as diary creation.

#### Scenario: First task of the day (Streak Increment)
- **WHEN** user completes a task and they have not logged a diary or task yet today (in VN time)
- **THEN** their streak_count increments by 1, missed_days resets to 0, last_diary_date updates to today, and XP is granted

#### Scenario: Second task of the same day (XP Only)
- **WHEN** user completes a task but they already advanced their streak today
- **THEN** they gain XP and mood updates, but streak_count does not increment again

#### Scenario: Idempotent completion (No double dipping)
- **WHEN** user attempts to complete an already completed task
- **THEN** the system returns early (silently success) without granting additional XP, advancing the streak, or throwing an error.

#### Scenario: Broken streak
- **WHEN** user completes a task but missed yesterday
- **THEN** their streak_count resets to 1, missed_days resets to 0, last_diary_date updates to today

#### Scenario: Milestone mood changes
- **WHEN** task completion advances the streak to a multiple of 3
- **THEN** the pet's mood becomes 'excited'
