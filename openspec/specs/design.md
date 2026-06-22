# FarmDiaries AI - Global Design Context & Architecture
### Design Style: Soft Farming Wellness / Flat-Plus Gamification

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | Global Design Context & Architecture |
| **Đường dẫn** | `openspec/specs/design.md` |
| **Phiên bản** | v5.3 - Canonical 4-tab nav + PlantScan-in-Chat confirmed |
| **Trạng thái** | Active · specs folder · Source of Truth cho định hướng thiết kế |
| **Mục tiêu** | Cung cấp bối cảnh tổng thể, ngôn ngữ mỹ thuật, kiến trúc layout, hệ component, và nguyên tắc màn hình cho toàn bộ UI. Tài liệu này không chứa implementation code chi tiết. |

---

## 1. Product Design Thesis

FarmDiaries AI là một ứng dụng chăm sóc nông trại theo hướng **wellness + productivity + habit formation**. Người dùng không chỉ ghi nhật ký hoặc kiểm tra bệnh cây; họ quay lại mỗi ngày vì ứng dụng cho cảm giác vườn của họ đang được đồng hành, chăm sóc và tiến bộ.

Ngôn ngữ thiết kế là **Soft Farming Wellness / Flat-Plus Gamification**. Giao diện dùng nền xanh lá sữa, thẻ bo tròn, viền xanh-xám dịu, bóng đổ offset tactile, top bars có blur nhẹ, màu đất ấm cho reward/warning, và mascot **Bé Thóc** làm điểm neo cảm xúc.

Phong cách phải đạt 4 mục tiêu:

1. **Trustworthy farming utility:** Dữ liệu cây trồng, chẩn đoán, nhật ký và AI advice phải rõ ràng, dễ đọc, đáng tin.
2. **Emotional companion:** Bé Thóc giúp app có cảm giác gần gũi, biết vui, lo, phân tích và ăn mừng cùng người dùng.
3. **Habit-forming loop:** XP, streak, badge, diary CTA và level-up biến tác vụ nông nghiệp hằng ngày thành hành vi có thưởng.
4. **Responsive workspace:** Mobile hoạt động như PWA thao tác bằng ngón cái; desktop/tablet mở rộng thành workspace có sidebar, top app bar và nhiều panel dữ liệu.

---

## 2. Core Visual Language

### 2.1 Aesthetic Keywords

| Category | Direction |
|---|---|
| **Mood** | Fresh, optimistic, calm, friendly, habit-forming |
| **Shape** | Rounded, pill-like, soft rectangular, no sharp edges |
| **Depth** | Flat-plus tactile depth, offset shadows, gentle raised cards |
| **Surface** | Light green canvas, white/surface cards, occasional blur top layers |
| **Mascot** | Expressive crop/seedling companion, cute but not childish |
| **Motion** | Bounce, pop, scan sweep, XP fill, subtle mascot float |

### 2.2 Color System

Use the same token family across all screens:

| Token Role | Primary Values | Usage |
|---|---|---|
| **Surface canvas** | `#F1FCF1` | App background, page canvas |
| **Surface layers** | `#FFFFFF`, `#EBF7EB`, `#E5F1E5`, `#E0EBE0`, `#DAE6DA` | Cards, nav, grouped panels, task cards |
| **Primary green** | `#006D35`, `#08A855`, `#79FC9E`, `#5ADF85` | CTA, active nav, XP fill, success, key highlights |
| **Earth/reward tones** | `#FFDF9E`, `#FABD00`, `#B98B00`, `#785900` | XP popup, streak, warning, badge, celebration |
| **Text** | `#141E17`, `#3D4A3E`, `#58605A` | Main text, secondary text, metadata |
| **Borders** | `#BCCABB`, `#6D7B6D` | Card borders, image borders, separators |
| **Error/warning** | `#BA1A1A`, `#FFDAD6`, earth warning tones | Serious errors, disease caution, treatment safety |

### 2.3 Typography

Typography uses **Nunito Sans** throughout. It should feel rounded, sturdy and friendly.

| Style | Size / Weight | Usage |
|---|---|---|
| **Display** | 36px / 900 | Onboarding headline, major page title |
| **Headline large** | 28px / 800 | Profile names, reward titles, section hero copy |
| **Headline medium** | 22px / 800 | Card titles, level labels, screen headers |
| **Body large** | 18px / 600 | Supporting onboarding text, prominent paragraph copy |
| **Body medium** | 16px / 600 | Chat messages, result descriptions, diary text |
| **Label bold** | 14px / 800 | Buttons, badges, nav labels, metadata pills |

### 2.4 Depth & Tactility

The design is not pure flat UI. It uses physical, toy-like feedback:

* Cards use `2px` soft green-gray borders and large radius from `20px` to `32px`.
* Primary buttons use bottom offset depth (`4px-6px`) and move down on press.
* Chat bubbles and action chips use offset shadows to feel tappable.
* Top bars may use `bg-white/45` with `backdrop-blur-md` to float above content.
* Full glassmorphism should be restrained: use it for app bars, hero panels, or overlays, not every text-heavy card.

---

## 3. Mascot System: Bé Thóc

Bé Thóc is the emotional anchor of FarmDiaries AI. The mascot appears as a crop/seedling/grain companion with expressive eyes, rounded shape language, and a friendly farming personality.

### 3.1 Mascot Roles

| Role | Screen Examples | Purpose |
|---|---|---|
| **Guide** | Onboarding, Home | Introduce the app and suggest the next habit action |
| **Coach** | Home, Diary, Profile | Encourage streaks, XP progress and task completion |
| **Assistant** | AI Chat | Answer questions as a trusted farming companion |
| **Analyst** | PlantScan | React to diagnosis states and explain confidence/results |
| **Celebrator** | Reward, Level Up, Badge Unlock | Make achievement moments emotionally rewarding |

### 3.2 Mascot States

| State | Usage |
|---|---|
| **Happy** | Healthy farm, daily greeting, normal home state |
| **Worried** | Disease scan, low confidence, missed care task, warning |
| **Excited** | Diary completed, XP gained, task success |
| **Analytical** | AI thinking, scan analysis, treatment advice |
| **Celebrating** | Level up, badge unlock, streak milestone |
| **Sleeping / Calm** | Night mode, idle state, low-priority moments |

Mascot usage rule: if Bé Thóc is present, it must serve a communication purpose. Do not use the mascot as random decoration.

---

## 4. App Architecture

### 4.1 Navigation Model

> **Canonical decision (v5.3 — FINAL):** The app has **4 tabs** on mobile BottomNavBar and desktop SideNavBar. There is NO standalone Scan tab.

| Tab | Icon | Role |
|---|---|---|
| **Home** | `home` | Daily habit dashboard, mascot garden, streak, next action |
| **Diary** | `book` | Instagram-style farm journal — list, create, detail |
| **AI Pet** | `smart_toy` | Conversational AI assistant with integrated camera scan |
| **Profile** | `person` | Level, XP, streak calendar, badges, accessory shop, settings |

**PlantScan** is NOT a tab. It lives as a camera icon (`📷`) inside the AI Pet chat input bar. Tapping it opens a fullscreen camera viewfinder modal on top of the chat screen (same tab). The scan result is injected into the chat thread as a special card. This keeps the mental model simple: "I'm asking the AI — if I see something, I shoot it directly."

**Shop** is a tappable section card inside Profile → opens as a bottom sheet overlay. Not a tab.

The BottomNavBar shows exactly 4 icon+label items. Active tab uses `primary-container` fill.

### 4.2 Mobile Architecture

Mobile is optimized for PWA use and thumb interaction:

* Fixed or sticky **TopAppBar** for identity, notifications and quick status.
* Fixed **BottomNavBar** with active tab shown by `primary-container` fill.
* Content max width typically `800px`, centered for large phones/tablets.
* Bottom spacing must account for nav and safe area.
* Primary CTA must be reachable near the lower half of the screen when possible.

### 4.3 Desktop / Tablet Architecture

Desktop should not simply stretch mobile screens:

* Use a persistent **SideNavBar** for primary navigation.
* Use a **TopAppBar** for title, page context, notifications and actions.
* Use wider grids and multi-panel layouts for farm status, insights, diary history and AI outputs.
* Preserve the playful emotional layer while making data-heavy screens feel organized and productive.

### 4.4 Shared Layout Skeleton

Every screen should follow this hierarchy:

1. **Global shell:** surface canvas, navigation and app-level bars.
2. **Screen header:** title, context, date/status badge or greeting.
3. **Primary content:** hero, scan preview, chat thread, diary list or profile summary.
4. **Action layer:** primary CTA, quick actions, chips or bottom input.
5. **Feedback layer:** mascot dialogue, progress, warning, reward, toast or celebration.

---

## 5. Component Families

This document defines component families conceptually. Implementation details belong in source code, not this spec.

### 5.1 Layout Components

| Component | Responsibility |
|---|---|
| **AppCanvas** | Provides page surface, responsive shell, safe-area handling and background atmosphere |
| **TopAppBar** | Shows app identity, page context and global actions with soft blur treatment |
| **BottomNavBar** | Mobile primary navigation with filled active state |
| **SideNavBar** | Desktop navigation with brand block, active route and app status |

### 5.2 Surface Components

| Component | Responsibility |
|---|---|
| **SurfaceCard** | Default solid card for text-heavy content and results |
| **GlassPanel** | Light blur panel for top layers, hero sections or overlays |
| **DialogBubble** | Mascot or chat speech bubble with rounded asymmetric corners |
| **MediaFrame** | Image/scan container with rounded corners, border and optional overlay |

### 5.3 Interaction Components

| Component | Responsibility |
|---|---|
| **PressableButton** | Primary/secondary actions with tactile bottom offset |
| **ActionChip** | Small quick actions such as save, reminder, tips |
| **ChatInputBar** | Fixed AI input with attachment button, text input and send action |
| **ProgressBar** | XP, confidence and completion visualization |

### 5.4 Gamification Components

| Component | Responsibility |
|---|---|
| **XpSummary** | Level, XP count and progress to next level |
| **StreakPill / StreakCalendar** | Daily habit tracking and streak visualization |
| **BadgeShelf** | Unlocked/locked achievements and farming titles |
| **RewardMoment** | XP popup, mascot celebration, level-up and continue CTA |

---

## 6. Screen-Level Guidance

### 6.1 Onboarding / Welcome (SCR-01)

Purpose: introduce FarmDiaries AI as a supportive farming companion.

Required qualities:

* Center Bé Thóc prominently with gentle bounce or float.
* Use a soft green patterned or atmospheric background.
* Keep copy short: promise daily growth, AI support and farm habit building.
* Put sign-in or continue action in a rounded bottom panel.
* CTA should feel tactile and trustworthy, not corporate.

### 6.1B Onboarding Setup Flow (SCR-01B/C/D) — First-time only

Purpose: collect minimal required context so core features work correctly from day one.

Required qualities:

* Three-step wizard presented as a bottom-sheet stack after first successful login.
* **Step 1 (SCR-01B) — Farm Setup:** Text field for farm name + multi-select chip group for primary crop types (Lúa, Bưởi, Cà phê, Rau màu, Other). Bé Thóc in `happy` state gestures toward the input.
* **Step 2 (SCR-01C) — Zalo Connect (Optional):** Explain Zalo notification benefits. Two CTAs: "Kết nối Zalo" (calls `GET /api/v1/auth/zalo`) and "Bỏ qua, làm sau" (sets `zalo_notification_enabled = false`). Show permission rationale copy.
* **Step 3 (SCR-01D) — Push Notification Permission:** Show browser/PWA permission prompt wrapped in a friendly pre-permission screen with Bé Thóc explaining the value. Accept → request Web Push permission. Skip → proceed.
* Progress dots at the top of each step sheet. Back chevron closes the current sheet and returns to the prior step.
* Skipping Zalo and notifications is allowed; users can enable them later from Profile.

### 6.2 Home

Purpose: guide the user to the most important daily farming action.

Required qualities:

* Greeting, streak status and current level/XP must be visible quickly.
* Bé Thóc should speak or visually imply the next best action.
* Primary CTA should be diary completion or the most urgent care task.
* Small task cards can include watering check, PlantScan, AI assistant and diary.

### 6.3 AI Pet Chat (SCR-05)

Purpose: make farming advice feel conversational, practical and saveable. PlantScan is embedded here, not in a separate tab.

Required qualities:

* Header identifies the assistant context: "Tri Kỷ AI" with Bé Thóc avatar showing current mood state.
* User messages use green-highlight bubbles with strong rounded corners and offset depth.
* Bé Thóc responses use white/surface bubbles, avatar, name label and speech pointer.
* **Camera icon in input bar** — left of the text input. Tap opens fullscreen camera viewfinder modal (SCR-05C) that overlays the chat without leaving the tab.
* **Scan result card** — injected into the chat thread like an AI message: thumbnail + disease name + confidence bar + PHI warning (if any) + quick action chips.
* AI answers should include quick action chips: [Ghi nhật ký], [Đặt nhắc nhở], [Lưu lời khuyên].
* Chat input stays fixed above BottomNav on mobile: [📷 Camera] [text field] [Send].
* SSE streaming: AI response text appears character by character.

### 6.4 PlantScan

Purpose: turn plant diagnosis into a clear, actionable result.

Required qualities:

* Scan preview uses a large rounded media frame.
* Analysis state may use a scan sweep overlay or progress motion.
* Bé Thóc appears near the result with an emotional state matching diagnosis severity.
* Result card must show analysis status, disease summary, confidence bar and safety warning when relevant.
* Primary action saves treatment to diary; secondary action asks AI for advice.

### 6.5 Diary List (SCR-03)

Purpose: preserve farm memory and make past actions useful.

Required qualities:

* Entries should feel like clean cards with date, crop, issue/action and optional image.
* Saved AI advice and PlantScan results should link back to their source context.
* Filters should be simple: crop, date, issue type, treatment status.
* Empty state should use Bé Thóc to encourage the first diary entry.
* A prominent FAB or top-right `+` button opens the Diary Create sheet.

### 6.5B Diary Create / Edit (SCR-03B / SCR-03C)

Purpose: primary data entry point — maps directly to `CreateDiaryEntryDto` and `UpdateDiaryEntryDto`.

Required qualities:

* Presented as a full-screen bottom sheet with a sticky header (`Nhật ký mới` / `Sửa nhật ký`).
* **Form fields (in order):**
  1. Crop type — text input with dropdown autocomplete (`cropType`).
  2. Growth stage — optional text input (`growthStage`).
  3. Notes — multiline text area, placeholder: *"Hôm nay vườn thế nào?"* (`notes`).
  4. Watered toggle — icon chip row (`watered`).
  5. Fertilized toggle — icon chip row (`fertilized`).
  6. Photo upload — row of up to 4 image thumb slots. Tapping a slot opens native file picker or camera. Each image: client → `GET /api/v1/uploads/signed-url` → PUT to Cloudflare R2 → append returned URL to `photoUrls[]`.
  7. Weather data — auto-filled after requesting GPS permission. Shown as a read-only pill: `🌡️ 32°C · Nắng · Độ ẩm 74%`. Sent as `weather` JSONB field.
* **Pre-fill mode:** When triggered from PlantScan result (`SCR-04B → Ghi nhật ký`), `cropType`, `notes` (with disease summary), and `photoUrls` are pre-populated.
* Bottom action bar: `[Lưu nhật ký]` (primary, tactile) + `[Hủy]` (text button).
* On save success: show XP popup `+30XP`, Bé Thóc animates to `excited` for 2s, then sheet dismisses.

### 6.6 Profile / Progress (SCR-07)

Purpose: show long-term growth and reward consistency.

Required qualities:

* Profile summary includes user identity, farm region and title/badge.
* Level/XP card must be prominent with current XP, level name and progress bar to next level.
* **Streak calendar** (`StreakCalendar`) shows a scrollable 4-week grid: completed days (green fill), current day (primary border), missed days (faded), and future days (locked). Tapping a day shows the diary entry for that day.
* **Badge shelf** (`BadgeShelf`) distinguishes: unlocked (full color), highlighted/newest (glowing border), and locked (grayscale with lock icon). Badge count shown as a chip.
* **Weekly insights summary** — collapsible card showing last `weekly_insights` from InsightModule: top crop issue, recommended action, streak trend.
* **Pet state card** — shows `pet_state.streak_count`, current `mood` icon, and milestone progress (next streak milestone at 7/14/30 days).
* **Settings rows** — Zalo connect status, push notification toggle, account info, sign out.
* **Cửa hàng phụ kiện** — tappable section card (not a nav tab) that opens the Accessory Shop bottom sheet (SCR-06).

### 6.7 Reward / Level Up Celebration (SCR-08)

Purpose: celebrate achievement and reinforce habit loops.

Required qualities:

* Bé Thóc should be the hero visual in `celebrating` state with confetti/star particles.
* Displayed as a **modal overlay** on top of the current screen (not a new page). Triggered when `pet.milestone_celebrated` event fires or when `streak_count` reaches 7/14/30.
* Use XP popup, animated progress fill, streak/badge unlock card and a clear `[Tuyệt vời! Tiếp tục]` CTA.
* Confetti/stars are allowed **only** in this celebration context.
* Copy should be short, positive and specific: `+30XP`, `🔥 7 ngày liên tiếp!`, `Huy hiệu mới: Nông dân siêng năng`.
* Auto-dismiss after 4 seconds or when user taps Continue.
* The celebration modal must NOT block critical farming warnings visible behind it.

### 6.8 Chat Session List (SCR-05B)

Purpose: let users review and resume past conversations with Tri Kỷ AI.

Required qualities:

* Accessed via the AI tab when no session is active, or via a back button from an open chat.
* Displays a scrollable list of past sessions from `GET /api/v1/chat/sessions` (cursor pagination).
* Each session card shows: relative date, first message preview (truncated to 80 chars), and a crop/topic tag if available.
* **Empty state**: Bé Thóc in `happy` state with copy *"Hỏi Bé Thóc bất cứ điều gì về vườn của bạn!"* and a primary CTA `[Bắt đầu trò chuyện]`.
* Tapping a session card opens `SCR-05` (active chat) and calls `GET /api/v1/chat/sessions/:id/messages`.
* A prominent `+` or `[Chat mới]` button starts a fresh session.

### 6.9 Reminder List / Create (SCR-09 / SCR-09B)

Purpose: let users manage scheduled farm reminders independently of AI chat suggestions.

Required qualities:

* **SCR-09 (Reminder List):** Accessible from Profile → Settings row `[Nhắc nhở của tôi]` or as a deep link from chat quick actions.
  * Displays upcoming reminders in a card list: icon (💧 tưới nước / 🌿 bón phân / 📋 other), time, repeat pattern, status chip (`pending` / `delivered` / `failed`).
  * Past-due reminders shown in a separate `[Đã qua]` section.
  * FAB or top-right `+` opens SCR-09B.
* **SCR-09B (Create Reminder):** Full-screen bottom sheet.
  * **Pre-fill mode (from chat quick action):** When user taps `[⏰ Báo thức tưới nước]` in chat, the sheet opens with activity type and time pre-filled from AI-parsed intent. User confirms and taps `[Đặt nhắc nhở]` → `POST /api/v1/reminders` → sheet closes → returns to chat.
  * Fields: Activity label (text input), Date & time picker, Repeat (None / Daily / Weekly), Channel preference (Push / Zalo).
  * On save: show success toast `Đã đặt nhắc nhở lúc 08:00` and increment reminder count on Profile badge.

---

## 7. Motion Architecture

Motion must clarify state and reinforce habit, not distract.

| Motion | Usage |
|---|---|
| **Mascot float/bounce** | Onboarding, Home, idle emotional moments |
| **Button press** | All primary and secondary interactive controls |
| **XP fill** | Diary completion, reward, profile progress |
| **Reward pop** | XP gain, badge unlock, level up |
| **Scan sweep** | PlantScan analyzing state |
| **Chat input compression** | Focused AI input or send action |

Motion constraints:

* Keep idle loops subtle and slow.
* Celebration motion is temporary and contextual.
* Buttons should react immediately.
* Respect reduced-motion preferences.
* Avoid continuous background drifting on normal productivity screens.

---

## 8. Aesthetic Integrity Rules

### Do

* Use fresh green surfaces, warm earth accents and rounded tactile UI.
* Keep cards readable with solid or high-opacity surfaces for text-heavy content.
* Use blur mainly for app bars, overlays and atmospheric panels.
* Make primary actions obvious and habit-oriented.
* Use Material Symbols consistently for system icons.
* Use Bé Thóc to communicate emotion, guidance or state.
* Design desktop as a real workspace with sidebar and multi-panel structure.

### Don't

* Do not use cyberpunk AI visuals, purple neon gradients or sci-fi HUD effects.
* Do not make every card transparent; readability wins over visual effect.
* Do not use harsh black brutalist borders or black offset shadows.
* Do not use mascot art as meaningless decoration.
* Do not let gamification hide important farm warnings or diagnosis content.
* Do not stretch mobile screens directly into desktop layouts.
* Do not add constant confetti, floating stars or background motion outside reward moments.

---

## 9. Accessibility & Product Quality

1. Text over translucent or blurred surfaces must maintain strong contrast.
2. Touch targets should be at least `44px` high on mobile.
3. Bottom navigation and chat input must respect safe-area insets.
4. Disease warnings and treatment safety notes must be visually distinct from positive reward states.
5. AI advice should offer clear next actions, especially save-to-diary and reminders.
6. Mascot state should never be the only signal for critical information.
7. Images and scan previews need meaningful alt/context labels when possible.
8. Desktop layouts should improve comprehension, not only increase density.

---

## 10. Design Compliance Checklist

Before a screen is accepted, verify:

1. It follows the fresh green + earth accent palette.
2. It uses Nunito Sans with bold, rounded hierarchy.
3. It uses rounded cards, tactile buttons and soft borders consistently.
4. It has the correct navigation behavior for mobile and desktop.
5. It includes Bé Thóc when emotional guidance or state feedback is useful.
6. It supports the habit loop through CTA, XP, streak, diary save or progress.
7. It keeps farming data and warnings readable and trustworthy.
8. It uses motion only where it communicates feedback or celebration.
9. It avoids old flat-only, cyberpunk, brutalist and generic app styling.
10. It can be implemented consistently from shared layout, surface, interaction and gamification components.

---

*FarmDiaries AI - Global Design Context v5.3*
*Source of Truth · Soft Farming Wellness · Bé Thóc Companion · Flat-plus Habit Architecture*
*Navigation canonical (FINAL): 4 tabs (Home / Diary / AI Pet / Profile) · PlantScan inside AI Pet · Shop inside Profile*
