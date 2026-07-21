# Staff "Today" Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Staff dashboard's inline "Today" list with a compact counts box (Classes / Calendar Events / PTM Meetings) that opens a dedicated Today page expanding all three.

**Architecture:** A shared `useTodayAgenda` hook fetches today's classes, calendar events, and PTM meetings (device-local filtered, `Promise.allSettled`). The dashboard renders counts from it; a new pushed `/today` route renders the full lists. One backend task repairs the broken `staff/{staff}/ptms` endpoint and adds two fields.

**Tech Stack:** Expo / React Native (Hermes), expo-router, Ionicons; Laravel 10 / PHP (qobox backend), PostgreSQL.

## Global Constraints

- Two repos: **backend** = `/Users/anelkujovic/Documents/Projects/qobox` (Laravel); **app** = `/Users/anelkujovic/Documents/Projects/qobox-staffapp` (Expo). Commit each in its own repo.
- **No Jest** in the app → verification is `babel-preset-expo` parse + explicit manual check. Backend verification is `php artisan tinker`.
- Dates from the backend are **site-local wall-clock strings**; parse/format only with the existing helpers in `app/utils/datetime.js` (`parseWallClock`, `formatClock`, `isToday`) — never `new Date(str)` (Hermes rejects several shapes).
- "Today" = device-local day, via `isToday(...)`.
- Do **not** modify: the Notices section, the On-shift card, or the bottom tab bar.
- Attendee text pluralizes: `1 attendee` / `N attendees`; the `(…)` is omitted when the count is 0 or absent.
- App parse check command (run from app root):
  `node -e "require('@babel/core').transformFileSync(process.argv[1],{presets:['babel-preset-expo']});console.log('PARSE OK')" <file>`

---

## File map

**Backend (qobox):**
- Modify: `app/Models/PtmBooking.php` — add `building()`, `room()` relations.
- Modify: `app/Repositories/Staff/StaffRepository.php` — fix transformer import + `get_ptms` query.
- Modify: `app/Transformers/Staff/Administration/MyPtmBookingsTransformer.php` — `location_label` + `attendees_count`.

**App (qobox-staffapp):**
- Modify: `app/constants/endpoints.js` — add `GET_STAFF_PTMS`.
- Modify: `app/services/api.js` — add `getStaffPtms`.
- Create: `app/hooks/useTodayAgenda.js` — the shared data hook.
- Modify: `app/(main)/index.js` — replace Today list with the counts box.
- Create: `app/today/_layout.js`, `app/today/index.js` — the Today page.

---

## Task 1: Repair + extend the PTM endpoint (backend)

**Files:**
- Modify: `/Users/anelkujovic/Documents/Projects/qobox/app/Models/PtmBooking.php`
- Modify: `/Users/anelkujovic/Documents/Projects/qobox/app/Repositories/Staff/StaffRepository.php`
- Modify: `/Users/anelkujovic/Documents/Projects/qobox/app/Transformers/Staff/Administration/MyPtmBookingsTransformer.php`

**Interfaces:**
- Produces: `GET /api/v1/staff/{staff_id}/ptms?start_date&end_date` → `{ ptms: [ { id, student:{full_name,...}, timeslot:{ptm_start, ptm_start_formatted,...}, attendees_count:int, location_label:string, require_student_present, ... } ] }`.

- [ ] **Step 1: Add `building()` and `room()` relations to `PtmBooking`**

In `app/Models/PtmBooking.php`, add these methods inside the class (next to `participants()`). `Building`/`Room` are in `App\Models` (same namespace):

```php
    public function building()
    {
        return $this->belongsTo(Building::class);
    }

    public function room()
    {
        return $this->belongsTo(Room::class);
    }
```

- [ ] **Step 2: Fix the transformer import in `StaffRepository`**

In `app/Repositories/Staff/StaffRepository.php`, replace the broken import:

```php
use App\Transformers\Staff\Forms\MyPtmBookingsTransformer;
```

with the one that actually exists:

```php
use App\Transformers\Staff\Administration\MyPtmBookingsTransformer;
```

- [ ] **Step 3: Fix the `get_ptms` query (fix staff filter, drop broken `location`, eager-load real relations + count)**

`ptm_bookings` has **no `staff_id` column** (only `ptm_staff_id`), so the current
`where('staff_id', ...)` throws a SQL error — filter through the `ptm_staff`
relation instead (`PtmBooking->ptm_staff()` → `PtmStaff.staff_id`).

In `app/Repositories/Staff/StaffRepository.php`, in `get_ptms(...)`, replace the query body:

```php
        $bookings = PtmBooking::where('staff_id', $staff['id'])
            ->whereHas('timeslot', function ($q) use ($start_date, $end_date) {
                $q->whereBetween('ptm_start', [$start_date, $end_date]);
            })
            ->with(['student', 'timeslot', 'location'])
            ->get();
```

with:

```php
        $bookings = PtmBooking::whereHas('ptm_staff', function ($q) use ($staff) {
                $q->where('staff_id', $staff['id']);
            })
            ->whereHas('timeslot', function ($q) use ($start_date, $end_date) {
                $q->whereBetween('ptm_start', [$start_date, $end_date]);
            })
            ->with(['student', 'timeslot.ptm_session.site', 'building', 'room'])
            ->withCount('participants')
            ->get();
```

- [ ] **Step 4: Add `location_label` + `attendees_count` to the transformer**

In `app/Transformers/Staff/Administration/MyPtmBookingsTransformer.php`, replace the trailing `'location' => $data['location']` line:

```php
            'location' => $data['location']
```

with:

```php
            'attendees_count' => (int) ($data->participants_count ?? 0),
            'location_label' => $data->location_name
                ?: collect([$data->building?->name, $data->room?->name])->filter()->implode(' | '),
```

(Ensure the preceding line still ends with a comma and the array/closing brace stays valid.)

- [ ] **Step 5: Verify the endpoint no longer 500s and returns the new fields**

Run (from `/Users/anelkujovic/Documents/Projects/qobox`), using a staff id that has bookings (e.g. 15 or 25 from `ptm_bookings`):

```bash
php artisan tinker --execute="
\$staff = App\Models\Staff::find(15);
\$rows = app(App\Repositories\Staff\StaffRepository::class)->get_ptms(\$staff, '2000-01-01', '2100-01-01');
echo json_encode(array_map(fn(\$r) => [
    'student' => \$r['student']['full_name'] ?? null,
    'attendees_count' => \$r['attendees_count'] ?? 'MISSING',
    'location_label' => \$r['location_label'] ?? 'MISSING',
], \$rows), JSON_PRETTY_PRINT);
"
```

Expected: no exception; JSON array where each row has integer `attendees_count` and a non-`MISSING` `location_label` (e.g. `"Basement Floor | Room 1"`).

- [ ] **Step 6: Commit (backend repo)**

```bash
cd /Users/anelkujovic/Documents/Projects/qobox
git add app/Models/PtmBooking.php app/Repositories/Staff/StaffRepository.php app/Transformers/Staff/Administration/MyPtmBookingsTransformer.php
git commit -m "fix(ptm): repair staff /ptms endpoint + add attendees_count & location_label"
```

---

## Task 2: App — PTM endpoint + api method

**Files:**
- Modify: `app/constants/endpoints.js`
- Modify: `app/services/api.js`

**Interfaces:**
- Produces: `api.getStaffPtms(staffId, { start_date, end_date })` → `{ ptms: [...] }`.

- [ ] **Step 1: Add the endpoint constant**

In `app/constants/endpoints.js`, in the "My Timetable" / staff area (right after `GET_STAFF_TIMETABLE`), add:

```js
    // PTM meetings for a staff member (date range)
    GET_STAFF_PTMS: 'staff/{staff_id}/ptms',
```

- [ ] **Step 2: Add the api method**

In `app/services/api.js`, right after `getStaffTimetable`, add:

```js
    async getStaffPtms(staffId, params = {}) {
        return this.get(endpoints.GET_STAFF_PTMS.replace('{staff_id}', staffId), params);
    }
```

- [ ] **Step 3: Parse check**

```bash
cd /Users/anelkujovic/Documents/Projects/qobox-staffapp
node -e "require('@babel/core').transformFileSync(process.argv[1],{presets:['babel-preset-expo']});console.log('PARSE OK')" app/services/api.js
```

Expected: `PARSE OK`.

- [ ] **Step 4: Commit**

```bash
git add app/constants/endpoints.js app/services/api.js
git commit -m "feat(api): add getStaffPtms endpoint"
```

---

## Task 3: App — `useTodayAgenda` hook

**Files:**
- Create: `app/hooks/useTodayAgenda.js`

**Interfaces:**
- Consumes: `api.getStaffTimetable`, `api.getCalendarEvents`, `api.getStaffPtms` (Task 2); `isToday` from `app/utils/datetime`.
- Produces: `useTodayAgenda(staffId, orgId)` → `{ classes: any[], events: any[], ptms: any[], loading: boolean, refresh: () => Promise<void> }`, each list filtered to device-local today.

- [ ] **Step 1: Create the hook**

Create `app/hooks/useTodayAgenda.js`:

```js
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import api from '../services/api';
import { isToday } from '../utils/datetime';

const fmtDateForApi = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// First array-valued property among `keys`, else `v` if it's already an array.
const pickArray = (v, ...keys) => {
    for (const k of keys) if (Array.isArray(v?.[k])) return v[k];
    return Array.isArray(v) ? v : [];
};

// Loads today's classes, calendar events, and PTM meetings for a staff member,
// each filtered to today in the device-local timezone. A failure in one source
// never blanks the others (Promise.allSettled). Refetches whenever the consuming
// screen regains focus; `refresh` is exposed for pull-to-refresh.
//
// Shared by the dashboard (counts) and the Today page (full lists) so the
// today-filtering logic lives in exactly one place.
export default function useTodayAgenda(staffId, orgId) {
    const [classes, setClasses] = useState([]);
    const [events, setEvents] = useState([]);
    const [ptms, setPtms] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!staffId) {
            setClasses([]); setEvents([]); setPtms([]); setLoading(false);
            return;
        }
        setLoading(true);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const from = fmtDateForApi(today);
        const to = fmtDateForApi(tomorrow);

        const [tt, cal, pt] = await Promise.allSettled([
            api.getStaffTimetable(staffId, { start_date: from, end_date: to }),
            api.getCalendarEvents({ from, to, staff_id: staffId, org_id: orgId }),
            api.getStaffPtms(staffId, { start_date: from, end_date: to }),
        ]);

        setClasses(
            tt.status === 'fulfilled'
                ? pickArray(tt.value, 'timetable', 'data').filter((s) => isToday(s.session_start || s.start))
                : []
        );
        setEvents(
            cal.status === 'fulfilled'
                ? pickArray(cal.value, 'events', 'data').filter((e) => isToday(e.start_at || e.start_date || e.start))
                : []
        );
        setPtms(
            pt.status === 'fulfilled'
                ? pickArray(pt.value, 'ptms', 'data').filter((p) => isToday(p.timeslot?.ptm_start))
                : []
        );

        setLoading(false);
    }, [staffId, orgId]);

    useEffect(() => { load(); }, [load]);
    useFocusEffect(useCallback(() => { load(); }, [load]));

    return { classes, events, ptms, loading, refresh: load };
}
```

- [ ] **Step 2: Parse check**

```bash
node -e "require('@babel/core').transformFileSync(process.argv[1],{presets:['babel-preset-expo']});console.log('PARSE OK')" app/hooks/useTodayAgenda.js
```

Expected: `PARSE OK`.

- [ ] **Step 3: Commit**

```bash
git add app/hooks/useTodayAgenda.js
git commit -m "feat(hooks): add useTodayAgenda (today classes/events/ptms)"
```

---

## Task 4: App — Dashboard counts box

Replaces the inline class/event list in the Today section with a tappable counts box. Keeps the On-shift card and Notices exactly as-is.

**Files:**
- Modify: `app/(main)/index.js`

**Interfaces:**
- Consumes: `useTodayAgenda` (Task 3); `useRouter` (already imported).

- [ ] **Step 1: Import the hook**

Add near the other imports in `app/(main)/index.js` (after `import ShiftTimer ...`):

```js
import useTodayAgenda from '../../hooks/useTodayAgenda';
```

- [ ] **Step 2: Use the hook; stop loading classes/events in `loadToday`**

Inside `DashboardScreen`, after `const router = useRouter();` add:

```js
    const { classes: todayClasses, events: todayEvents, ptms: todayPtms, loading: agendaLoading } =
        useTodayAgenda(staff?.id, orgId);
```

Then in `loadToday`, remove the timetable + calendar calls and their result handling — keep only notices (`nb`) and roster-log (`rl`). Replace the `Promise.allSettled([...])` block and the two `if (tt...)`, `if (cal...)` blocks so the settled array is:

```js
                const [nb, rl] = await Promise.allSettled([
                    api.getDashboardNoticeboard({ limit: 5, page: 1 }),
                    siteId
                        ? api.getMyShifts({
                              staff_id: staff.id,
                              site_id: siteId,
                              page: 1,
                              limit: 1,
                              show_past_shifts: 'true',
                          })
                        : Promise.resolve({ open_shift: null }),
                ]);
```

Delete the now-unused `isOnDay` helper inside `loadToday` and the `today`/`tomorrow`/`todayStr`/`tomorrowStr` locals **only if** nothing else in `loadToday` uses them (after removing tt/cal, they are unused — remove them). Remove the `sessions`/`events` `useState` declarations and their setters' remaining references.

- [ ] **Step 3: Remove dead module-level helpers/state**

Delete from `app/(main)/index.js` (now unused after Step 2): the `sessions` and `events` state, the `formatTime` helper, the `eventColor` helper, and `fmtDateForApi` if no longer referenced. Keep `relativeTime`, `stripHtml` (Notices use them) and `formatShiftStart`, `normalizeTimeLabel`, `ShiftTimer`, `Avatar` (On-shift card + Notices use them).

- [ ] **Step 4: Replace the Today section body with the counts box**

In the `return`, the `<Section title="Today">` currently contains the On-shift `openShift` card followed by the loading/empty/`sessions.map`/`events.map` block. **Keep the On-shift card**; replace everything after it (the `isLoading && sessions.length === 0 ...` ternary through its close) with:

```jsx
                <TouchableOpacity
                    onPress={() => router.push('/today')}
                    activeOpacity={0.85}
                    style={[styles.todayBox, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                >
                    {[
                        { icon: 'school-outline', count: todayClasses.length, label: 'Classes' },
                        { icon: 'calendar-outline', count: todayEvents.length, label: 'Calendar Events' },
                        { icon: 'chatbubbles-outline', count: todayPtms.length, label: 'PTM Meetings' },
                    ].map((row) => (
                        <View key={row.label} style={styles.todayRow}>
                            <Ionicons name={row.icon} size={22} color={colors.textPrimary} style={styles.todayIcon} />
                            <Text style={[styles.todayCount, { color: colors.textPrimary }]}>
                                {agendaLoading ? '–' : row.count}
                            </Text>
                            <Text style={[styles.todayLabel, { color: colors.textPrimary }]}>{row.label}</Text>
                        </View>
                    ))}
                </TouchableOpacity>
```

- [ ] **Step 5: Add the counts-box styles**

Add to the `StyleSheet.create({ ... })` in `app/(main)/index.js`:

```js
    todayBox: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
    todayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    todayIcon: { width: 30 },
    todayCount: { fontSize: 18, fontWeight: '700', width: 34 },
    todayLabel: { fontSize: 16, fontWeight: '500' },
```

- [ ] **Step 6: Parse check**

```bash
node -e "require('@babel/core').transformFileSync(process.argv[1],{presets:['babel-preset-expo']});console.log('PARSE OK')" "app/(main)/index.js"
```

Expected: `PARSE OK`. Also confirm no lingering references: `grep -n "sessions\|formatTime\|eventColor" "app/(main)/index.js"` returns nothing (other than unrelated words).

- [ ] **Step 7: Commit**

```bash
git add "app/(main)/index.js"
git commit -m "feat(dashboard): replace Today list with tappable counts box"
```

---

## Task 5: App — Today page

**Files:**
- Create: `app/today/_layout.js`
- Create: `app/today/index.js`

**Interfaces:**
- Consumes: `useTodayAgenda` (Task 3); `Avatar` component; `formatClock` from `app/utils/datetime`.

- [ ] **Step 1: Create the Stack layout**

Create `app/today/_layout.js`:

```js
import { Stack } from 'expo-router';
import React from 'react';

export default function TodayLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create the Today screen**

Create `app/today/index.js`:

```jsx
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import useTodayAgenda from '../hooks/useTodayAgenda';
import { formatClock } from '../utils/datetime';

const pluralAttendees = (n) => (n === 1 ? '1 attendee' : `${n} attendees`);

const eventLocation = (ev) =>
    ev.location_description ||
    [ev.location_building?.name, ev.location_room?.name].filter(Boolean).join(', ');

export default function TodayScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = React.useState(null);
    const [orgId, setOrgId] = React.useState(null);

    React.useEffect(() => {
        (async () => {
            const [s, org] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('organisationId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setOrgId(org);
        })();
    }, []);

    const { classes, events, ptms, loading, refresh } = useTodayAgenda(staff?.id, orgId);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Today</Text>
                <View style={styles.iconBtn} />
            </View>

            <ScrollView
                contentContainerStyle={styles.container}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.primary} />
                }
            >
                {loading && classes.length === 0 && events.length === 0 && ptms.length === 0 ? (
                    <ActivityIndicator color={colors.primary} style={{ paddingVertical: 32 }} />
                ) : (
                    <>
                        <Section title="Classes" colors={colors} empty="No classes today" count={classes.length}>
                            {classes.map((it, i) => {
                                const title = it.class?.title || it.class_title || it.title || 'Class';
                                return (
                                    <Row key={`c-${it.id ?? i}`} colors={colors}
                                        avatar={<Avatar uri={it.class?.photo} name={title} size={40} />}
                                        title={title}
                                        subtitle={it.room?.name || it.room_name}
                                        right={formatClock(it.session_start || it.start)}
                                    />
                                );
                            })}
                        </Section>

                        <Section title="Calendar" colors={colors} empty="No calendar events today" count={events.length}>
                            {events.map((ev, i) => {
                                const loc = eventLocation(ev);
                                return (
                                    <View key={`e-${ev.id ?? i}`} style={[styles.block, { borderColor: colors.border }]}>
                                        <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>
                                            {ev.title || ev.name || 'Event'}
                                        </Text>
                                        <View style={styles.metaRow}>
                                            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                                {ev.all_day ? 'All day' : `Today @ ${formatClock(ev.start_at || ev.start_date || ev.start)}`}
                                            </Text>
                                        </View>
                                        {loc ? (
                                            <View style={styles.metaRow}>
                                                <Ionicons name="location-outline" size={14} color={colors.success || colors.primary} />
                                                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{loc}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </Section>

                        <Section title="PTMs" colors={colors} empty="No PTM meetings today" count={ptms.length}>
                            {ptms.map((p, i) => {
                                const name = p.student?.full_name || 'Student';
                                const count = Number(p.attendees_count) || 0;
                                const heading = count > 0 ? `${name} (${pluralAttendees(count)})` : name;
                                return (
                                    <Row key={`p-${p.id ?? i}`} colors={colors}
                                        avatar={<Avatar name={name} size={40} />}
                                        title={heading}
                                        subtitle={p.location_label}
                                        right={formatClock(p.timeslot?.ptm_start)}
                                        stacked
                                    />
                                );
                            })}
                        </Section>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function Section({ title, children, colors, empty, count }) {
    return (
        <View style={{ marginBottom: 20 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title.toUpperCase()}</Text>
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                {count === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{empty}</Text>
                ) : children}
            </View>
        </View>
    );
}

function Row({ avatar, title, subtitle, right, colors, stacked }) {
    return (
        <View style={styles.row}>
            {avatar}
            <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
                {subtitle ? (
                    <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
                ) : null}
                {stacked && right ? (
                    <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{right}</Text>
                ) : null}
            </View>
            {!stacked && right ? (
                <Text style={[styles.rowRight, { color: colors.textPrimary }]}>{right}</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 8,
    },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    container: { padding: 16, paddingBottom: 40 },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowTitle: { fontSize: 15, fontWeight: '600' },
    rowSub: { fontSize: 12, marginTop: 2 },
    rowRight: { fontSize: 14, fontWeight: '600' },
    block: { paddingVertical: 12, gap: 4 },
    blockTitle: { fontSize: 15, fontWeight: '600' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 12 },
    emptyText: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
});
```

- [ ] **Step 3: Parse check both files**

```bash
node -e "require('@babel/core').transformFileSync(process.argv[1],{presets:['babel-preset-expo']});console.log('PARSE OK')" app/today/_layout.js
node -e "require('@babel/core').transformFileSync(process.argv[1],{presets:['babel-preset-expo']});console.log('PARSE OK')" app/today/index.js
```

Expected: `PARSE OK` for both.

- [ ] **Step 4: Manual verification**

Seed today data for a staff member (e.g. Vanesa, staff 9) — at least one class, one calendar event, and one PTM booking for today — then in the app: open the dashboard, confirm the TODAY box shows the three counts, tap it, and confirm the Today page shows CLASSES / CALENDAR / PTMs with correct times, room/location, and `(N attendees)` on PTM rows. Confirm empty sections show their empty text.

- [ ] **Step 5: Commit**

```bash
git add app/today/_layout.js app/today/index.js
git commit -m "feat(today): add Today page (classes, calendar, PTMs)"
```

---

## Self-review notes
- **Spec coverage:** counts box (Task 4), Today page 3 sections (Task 5), PTM attendees+location (Task 1+5), shared hook / device-local today / allSettled (Task 3), backend repair (Task 1). All covered.
- **Type consistency:** `useTodayAgenda` returns `{ classes, events, ptms, loading, refresh }` — consumed with those exact names in Tasks 4 & 5. `getStaffPtms(staffId, params)` defined in Task 2, used in Task 3. Backend `attendees_count`/`location_label` produced in Task 1, consumed in Task 5.
- **Calendar location** (`location_building`/`location_room` object shape) is the one inferred field — Task 5 uses optional chaining so a mismatch degrades gracefully; confirm during Step 4.
