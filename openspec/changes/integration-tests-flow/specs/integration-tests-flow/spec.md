## ADDED Requirements

### Requirement: End-to-End User Journey Test Coverage
Hệ thống PHẢI có một kịch bản tích hợp xuyên suốt tự động (Automated E2E Test) xác nhận rằng quy trình ghi nhận hoạt động (Farm/Diary) liên kết chặt chẽ với quy trình tư vấn AI (RAG/Chat), đảm bảo không có rào cản tương tác giữa các module độc lập.

#### Scenario: User logs an activity and asks AI about it
- **GIVEN** a clean testing environment with a seeded user account
- **WHEN** the user logs in to receive an authentication token
- **AND** creates a Farm Plot and starts a Crop Diary
- **AND** logs a specific daily activity (e.g. "Fertilizing with compost")
- **AND** subsequently asks the AI assistant "What fertilizer did I use recently?"
- **THEN** the system must retrieve the context via RAG
- **AND** the mocked AI response must successfully return based on the assembled RAG context
- **AND** all created entities (Plot, Diary, Log, Chat Session) must be cleanly removed after the test.
