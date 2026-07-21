# Staff "Today" section — design

**Date:** 2026-07-22
**App:** qobox-staffapp (Expo / React Native, expo-router)
**Status:** Approved design, pending spec review

## Goal

Replace the dashboard's inline "Today" list with a compact **TODAY** counts box
(Classes / Calendar Events / PTM Meetings). Tapping the box opens a dedicated
**Today** page that expands each of the three into a full list.

One small backend change (PTM attendee count — see "Backend change"). Everything
else uses data sources that already exist.

## Decisions (from brainstorming)

1. **Dashboard layout:** the inline class/event list under "Today" is **replaced**
   by the compact counts box. The On-shift card and Notices are untouched.
2. **PTM rows:** show student full name, attendee count, time, and location. The
   attendee count requires a small backend change (see "Backend change").
3. **Row taps:** all rows on the Today page are **display-only** for v1.

## Data sources

All filtered to **today in the device-local timezone**, using the same
`isOnDay(iso, day)` check the dashboard uses today.

| Data | Endpoint | Key fields used |
|------|----------|-----------------|
| Classes | `GET staff/{staff_id}/timetable?start_date&end_date` (`api.getStaffTimetable`) | `class.title`, `class.photo`, `room.name`, `session_start`, `session_end` |
| Calendar events | `GET calendar/events/query?from&to&staff_id&org_id` (`api.getCalendarEvents`) | `title`, `start_at`, `all_day`, `location_description`, `location_building`, `location_room` |
| PTM meetings | `GET staff/{staff_id}/ptms?start_date&end_date` (**new** `api.getStaffPtms`) | `student.full_name`, `attendees_count` (**new field**), `timeslot.ptm_start`, `location` (booking location relation), booking `location_name` |

Date range passed to each: `start_date/from = today`, `end_date/to = tomorrow`
(mirrors the dashboard's existing "extend end to next day" note), then the
results are filtered client-side to today so all three lists agree on "today".

## Architecture

### 1. Data layer
- **`app/constants/endpoints.js`** — add `GET_STAFF_PTMS: 'staff/{staff_id}/ptms'`.
- **`app/services/api.js`** — add:
  ```js
  async getStaffPtms(staffId, params = {}) {
      return this.get(endpoints.GET_STAFF_PTMS.replace('{staff_id}', staffId), params);
  }
  ```
  Response shape: `{ ptms: [...] }`.
- **`app/hooks/useTodayAgenda.js`** (new `hooks/` dir) — single source of the
  three today-filtered lists, so the dashboard and the Today page never
  duplicate fetch/filter logic.
  - Signature: `useTodayAgenda(staffId, orgId)` →
    `{ classes, events, ptms, loading, refresh }`.
  - Fetches the three endpoints with `Promise.allSettled` — a failure in one
    never blanks the others (matches the dashboard's current resilience).
  - Applies the device-local `isOnDay` filter to each list before returning.
  - `classes`/`events` reuse the same normalization the dashboard uses today
    (`tt.value?.timetable || tt.value?.data || tt.value`, etc.).

### 2. Dashboard — `app/(main)/index.js`
- The **Today** section body becomes one tappable counts card
  (`TouchableOpacity` → `router.push('/today')`):

  ```
  TODAY
  ┌────────────────────────────────┐
  │  🎓  {classes}  Classes         │
  │  📅  {events}   Calendar Events │
  │  💬  {ptms}     PTM Meetings    │
  └────────────────────────────────┘
  ```
  Icons (Ionicons): `school-outline`, `calendar-outline`, `chatbubbles-outline`.
- Counts come from `useTodayAgenda`. While `loading`, counts render `–`; after
  load, real integers (including `0`, which is shown, not hidden).
- **Removed** from the dashboard: the inline `sessions.map(...)` / `events.map(...)`
  rows and their "Nothing on your plate" empty card. The On-shift card and the
  Notices section stay exactly as they are (their loaders — `openShift`,
  `notices` — are independent of `useTodayAgenda`).

### 3. Today page — new route `app/today/`
- `app/today/_layout.js` — `<Stack screenOptions={{ headerShown: false }} />`
  (matches `app/class/_layout.js`, `app/student/_layout.js`).
- `app/today/index.js`:
  - `SafeAreaView edges={['top']}` + custom header: `chevron-back` →
    `router.back()`, title **"Today"** (matches the student/class detail screens).
  - Consumes `useTodayAgenda`; `ScrollView` with `RefreshControl` → `refresh()`.
  - Three `Section`s:
    - **CLASSES** — avatar (`class.photo`, fallback initials) + `class.title`,
      subtitle = `room.name`, time right-aligned (`formatTime(session_start)`).
    - **CALENDAR** — `title`; line `📅 {all_day ? 'All day' : formatTime(start_at)}`;
      location line `📍 {location_description || [location_building?.name, location_room?.name].filter(Boolean).join(', ')}` (omitted when empty).
    - **PTMs** — person avatar + `{student.full_name} ({attendees_count} attendees)`;
      location line `📍 {location?.location_name || [location?.building?.name, location?.room?.name].filter(Boolean).join(' | ') || location_name}`; time `{formatTime(timeslot.ptm_start)}`.
      Attendee text: pluralize (`1 attendee` / `N attendees`); omit the `(…)` when count is 0/absent.
  - Each section has its own empty state ("No classes today", "No calendar
    events today", "No PTM meetings today").

### 4. Navigation
- `/today` is a pushed Stack screen reached only from the dashboard box; it is
  **not** added to the bottom tab bar.

## Backend change (qobox — PTM attendee count)

Add a participant count to the PTM payload so the app can show "(N attendees)".

- **`app/Repositories/Staff/StaffRepository.php` → `get_ptms`**: add
  `->withCount('participants')` to the `PtmBooking` query (alongside the existing
  `->with(['student', 'timeslot', 'location'])`). `PtmBooking->participants()` is
  an existing `hasMany(PtmBookingParticipant::class)`.
- **`app/Transformers/Staff/Administration/MyPtmBookingsTransformer.php`**: add
  `'attendees_count' => (int) ($data->participants_count ?? 0),`.

"Attendees" = rows in `ptm_booking_participants` for the booking. This is
additive (a new field); no existing consumer of the transformer is affected.

## Component boundaries

- `useTodayAgenda` — *what:* returns today's three lists + loading/refresh.
  *depends on:* `api`, `datetime.isOnDay`. Testable/inspectable in isolation.
- Dashboard counts card — pure presentation of three integers + a nav action.
- Today page sections — pure presentation of the three arrays.

## Edge cases
- **Empty day:** box shows `0 / 0 / 0`; Today page shows three empty states.
- **Partial failure:** if one endpoint fails, its count/list is empty; the other
  two still render (`Promise.allSettled`).
- **"Today" consistency:** PTMs are filtered client-side on `timeslot.ptm_start`,
  so a backend date-range quirk can't make the box and the page disagree.
- **Loading:** counts show `–` until the first load resolves.

## Field-shape verification (implementation step)
The PTM `location` relation shape and the calendar `location_building`/
`location_room` object shape are inferred from the backend transformers. During
implementation, confirm the exact nested keys against one live `/ptms` and one
`/calendar/events/query` response and adjust the fallback chains above if needed.
The chains are written defensively (optional chaining + fallbacks) so a missing
key degrades to a shorter line rather than a crash.

## Out of scope
- Row tap navigation / detail screens for classes, events, PTMs.
- A dedicated "grade" concept for classes (no such field exists; subtitle = room).
- Any change to Notices, the On-shift card, or the bottom tab bar.

## Verification
- `babel-preset-expo` parse check on every new/changed file.
- Manual: seed a PTM for today so the box reads e.g. `3 / 2 / 1`, then open the
  Today page and confirm all three sections render with correct times/locations.
- No Jest in the project → no automated test (consistent with the codebase).
