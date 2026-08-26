import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Dimensions,
    Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Card, { CardHeader, cardBodyPadding, cardGap } from '../components/Card';

const startOfMonth = (d) => {
    const x = new Date(d);
    x.setDate(1);
    x.setHours(0, 0, 0, 0);
    return x;
};
const endOfMonth = (d) => {
    const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    x.setHours(23, 59, 59, 999);
    return x;
};
const fmtDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtMonth = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const dateHeader = (d) =>
    d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

// Backend returns color names like "Steel", "Azure", "Lime". Map to theme colors.
const eventColor = (name, theme) => {
    if (!name) return theme.primary;
    const key = String(name).toLowerCase();
    const palette = theme[key];
    if (palette && typeof palette === 'object' && palette.text) return palette.text;
    return theme.primary;
};

// ── Month-grid helpers ──────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const GRID_CELL_H = Math.round((SCREEN_W / 7) * 1.15);
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Sunday-first 6-week (42-cell) grid covering `monthDate`, matching the client
// app's calendar layout (stable height across month navigation).
const getCalendarGrid = (monthDate) => {
    const first = startOfMonth(monthDate);
    const offset = first.getDay(); // 0 = Sunday
    const cells = [];
    for (let i = 0; i < 42; i++) {
        cells.push(new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
    }
    return cells;
};

// The four built-in ("special") calendar categories the backend emits, with their
// default palette colour name. Mirrors the web app's specialCalendarEventTypes and
// CalendarEventsRepository::getColorForEventType. `category` matches the backend
// `event_category`; `key` is the toggle id used in the filter state.
const SPECIAL_EVENT_TYPES = [
    { key: 'classes',     category: 'class_sessions', label: 'Classes',     color: 'azure'  },
    { key: 'assignments', category: 'assignments',    label: 'Assignments', color: 'purple' },
    { key: 'tests',       category: 'tests',          label: 'Tests',       color: 'amber'  },
    { key: 'events',      category: 'events',         label: 'Events',      color: 'lime'   },
];
const CATEGORY_TO_KEY = SPECIAL_EVENT_TYPES.reduce((m, t) => { m[t.category] = t.key; return m; }, {});

export default function CalendarScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [organisationId, setOrganisationId] = useState(null);
    const [month, setMonth] = useState(startOfMonth(new Date()));
    const [view, setView] = useState('day'); // 'day' (agenda) | 'month' (grid)
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    // Bumped on every load() call; lets an in-flight request's response detect
    // it's been superseded by a newer month change and skip its setState.
    const loadRequestIdRef = useRef(0);

    // ── Event-type visibility filter (mirrors the main app's "Calendar Types") ──
    const [specialSelected, setSpecialSelected] = useState(
        () => SPECIAL_EVENT_TYPES.reduce((m, t) => { m[t.key] = true; return m; }, {})
    );
    const [customTypes, setCustomTypes] = useState([]); // [{ id, label, color, selected }]
    const [showUncategorized, setShowUncategorized] = useState(true);
    const [filterVisible, setFilterVisible] = useState(false);

    useEffect(() => {
        (async () => {
            const [s, org] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('organisationId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setOrganisationId(org);
            setProfileLoaded(true);
        })();
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            if (!staff?.id) return;
            // Tag this load so a later month change (which starts its own load
            // before this one resolves) can make this one's results a no-op
            // instead of clobbering the newer month's data.
            const requestId = ++loadRequestIdRef.current;
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const res = await api.getCalendarEvents({
                    // Backend (CalendarEventsController::index_query) expects
                    // `from`/`to` and `org_id` (not start/end/organisation_id).
                    from: fmtDate(startOfMonth(month)),
                    to: fmtDate(endOfMonth(month)),
                    staff_id: staff.id,
                    org_id: organisationId,
                });
                if (requestId !== loadRequestIdRef.current) return;
                const list = res?.events || res?.data || res || [];
                setEvents(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Calendar load error', err);
                if (requestId === loadRequestIdRef.current) {
                    setError(err.body?.message || err.message || 'Failed to load calendar.');
                }
            } finally {
                if (requestId === loadRequestIdRef.current) {
                    setIsLoading(false);
                    setIsRefreshing(false);
                }
            }
        },
        [staff, organisationId, month]
    );

    useEffect(() => { load(); }, [load]);

    // Load the org's custom calendar event types once (for the filter's "Custom
    // Calendars" section). Preserve selections across reloads. Non-fatal on error —
    // the filter still works for the built-in categories.
    useEffect(() => {
        if (!staff?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await api.getCalendarEventTypes({ organisation_id: organisationId });
                const list = res?.data || res?.calendar_event_types || res || [];
                if (cancelled) return;
                setCustomTypes((prev) => {
                    const prevSel = new Map(prev.map((t) => [String(t.id), t.selected]));
                    return (Array.isArray(list) ? list : []).map((t) => ({
                        id: t.id,
                        label: t.label || t.name || 'Calendar',
                        color: t.color || 'steel',
                        selected: prevSel.has(String(t.id)) ? prevSel.get(String(t.id)) : true,
                    }));
                });
            } catch (err) {
                console.warn('Calendar event types load failed', err?.message || err);
            }
        })();
        return () => { cancelled = true; };
    }, [staff, organisationId]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    // Visibility predicate driven by the filter state. Defaults to visible for
    // unknown/missing categories so nothing silently disappears.
    const isEventVisible = useCallback((ev) => {
        const cat = ev.event_category;
        // Custom calendar events (and anything uncategorised)
        if (cat === 'calendar_event' || cat == null) {
            if (ev.event_type != null && ev.event_type !== '') {
                const t = customTypes.find((c) => String(c.id) === String(ev.event_type));
                return t ? t.selected : true; // unknown / not-yet-loaded type → show
            }
            return showUncategorized;
        }
        // Built-in "special" categories (class_sessions / assignments / tests / events)
        const key = CATEGORY_TO_KEY[cat];
        if (!key) return true; // unknown category → show
        return specialSelected[key] !== false;
    }, [specialSelected, customTypes, showUncategorized]);

    const filtersActive =
        SPECIAL_EVENT_TYPES.some((t) => specialSelected[t.key] === false) ||
        customTypes.some((t) => !t.selected) ||
        !showUncategorized;

    // Group events by their start date — backend returns `start_at` field
    const grouped = useMemo(() => {
        const map = new Map();
        const startOf = (ev) => ev.start_at || ev.start_date || ev.start || ev.date;
        const sorted = [...events].filter(isEventVisible).sort((a, b) => {
            return (new Date(startOf(a)).getTime() || 0) - (new Date(startOf(b)).getTime() || 0);
        });
        sorted.forEach((ev) => {
            const dStr = startOf(ev);
            if (!dStr) return;
            const d = new Date(dStr);
            const key = fmtDate(d);
            if (!map.has(key)) map.set(key, { day: d, items: [] });
            map.get(key).items.push(ev);
        });
        return Array.from(map.values());
    }, [events, isEventVisible]);

    // Fast lookup for the month grid: date-key → that day's visible events.
    const eventsByDay = useMemo(() => {
        const m = new Map();
        grouped.forEach(({ day, items }) => m.set(fmtDate(day), items));
        return m;
    }, [grouped]);

    const grid = useMemo(() => getCalendarGrid(month), [month]);

    if (profileLoaded && !staff?.id) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Ionicons name="person-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No profile loaded. Please sign in again.
                    </Text>
                </View>
            </View>
        );
    }

    const today = new Date();
    const isCurrentMonth =
        month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

    const renderMonthView = () => (
        <ScrollView
            contentContainerStyle={styles.monthWrap}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            <View style={styles.weekHeader}>
                {WEEKDAY_LABELS.map((l) => (
                    <View key={l} style={styles.weekHeaderCell}>
                        <Text style={[styles.weekHeaderText, { color: colors.textSecondary }]}>{l}</Text>
                    </View>
                ))}
            </View>
            <Card style={styles.grid}>
                {grid.map((date, idx) => {
                    const inMonth = date.getMonth() === month.getMonth();
                    const dayEvents = eventsByDay.get(fmtDate(date)) || [];
                    const isToday = isSameDay(date, today);
                    // The rounded outline is drawn by the parent; cells only draw
                    // the inner dividers. Cells on the last column/row must not
                    // draw their outer edge — a straight hairline there gets
                    // clipped by the parent's border radius and used to leave the
                    // card's bottom corners visibly broken.
                    const lastCol = idx % 7 === 6;
                    const lastRow = idx >= grid.length - 7;
                    return (
                        <TouchableOpacity
                            key={date.toISOString()}
                            activeOpacity={0.7}
                            onPress={() => {
                                if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
                                    setMonth(startOfMonth(date));
                                }
                                setView('day');
                            }}
                            style={[
                                styles.gridCell,
                                { borderColor: colors.border },
                                lastCol && { borderRightWidth: 0 },
                                lastRow && { borderBottomWidth: 0 },
                                isToday && { backgroundColor: colors.primary + '20' },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.gridDate,
                                    { color: inMonth ? colors.textPrimary : colors.textDisabled },
                                    isToday && { color: colors.primary, fontWeight: '800' },
                                ]}
                            >
                                {date.getDate()}
                            </Text>
                            {inMonth && dayEvents.length > 0 ? (
                                <View style={[styles.gridBadge, { backgroundColor: colors.primary }]}>
                                    <Text style={[styles.gridBadgeText, { color: colors.onPrimary }]}>{dayEvents.length}</Text>
                                </View>
                            ) : null}
                        </TouchableOpacity>
                    );
                })}
            </Card>
        </ScrollView>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.bar, { borderBottomColor: colors.border }]}>
                <View style={styles.barNav}>
                    <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.navBtn}>
                        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { if (!isCurrentMonth) setMonth(startOfMonth(new Date())); }}>
                        <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>{fmtMonth(month)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.navBtn}>
                        <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.barRight}>
                    <TouchableOpacity
                        onPress={() => { if (!isCurrentMonth) setMonth(startOfMonth(new Date())); }}
                        style={[styles.iconBtn, { backgroundColor: isCurrentMonth ? colors.primary : colors.surface }]}
                        accessibilityLabel="Go to current month"
                    >
                        <Ionicons name="home" size={18} color={isCurrentMonth ? colors.onPrimary : colors.textSecondary} />
                    </TouchableOpacity>

                    <View style={[styles.viewToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <TouchableOpacity
                            style={[styles.viewToggleOption, view === 'day' && { backgroundColor: colors.primary }]}
                            onPress={() => setView('day')}
                            accessibilityLabel="Agenda view"
                        >
                            <FontAwesome name="list" size={16} color={view === 'day' ? colors.onPrimary : colors.textSecondary} />
                        </TouchableOpacity>
                        <View style={[styles.viewToggleDivider, { backgroundColor: colors.border }]} />
                        <TouchableOpacity
                            style={[styles.viewToggleOption, view === 'month' && { backgroundColor: colors.primary }]}
                            onPress={() => setView('month')}
                            accessibilityLabel="Month view"
                        >
                            <FontAwesome name="calendar" size={16} color={view === 'month' ? colors.onPrimary : colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={() => setFilterVisible(true)}
                        style={styles.navBtn}
                        accessibilityLabel="Filter event types"
                    >
                        <Ionicons
                            name={filtersActive ? 'funnel' : 'funnel-outline'}
                            size={20}
                            color={filtersActive ? colors.primary : colors.textPrimary}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading && events.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && events.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : view === 'month' ? (
                renderMonthView()
            ) : grouped.length === 0 ? (
                <ScrollView
                    contentContainerStyle={styles.center}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                >
                    <Ionicons name="calendar-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No events this month.</Text>
                </ScrollView>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                >
                    {grouped.map(({ day, items }) => {
                        const isToday = isSameDay(day, today);
                        return (
                            <Card key={day.toISOString()} style={styles.dayBlock}>
                                <CardHeader>
                                    <Text style={[styles.dayHeaderText, { color: isToday ? colors.primary : colors.textPrimary }]}>
                                        {dateHeader(day)}
                                    </Text>
                                    {isToday ? (
                                        <View style={[styles.todayPill, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
                                            <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
                                        </View>
                                    ) : null}
                                </CardHeader>
                                {items.map((ev, i) => {
                                    const accent = eventColor(ev.color, colors);
                                    return (
                                        <View
                                            key={`${ev.id ?? i}-${day.toISOString()}`}
                                            style={[
                                                styles.eventRow,
                                                i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                                            ]}
                                        >
                                            <View style={[styles.accent, { backgroundColor: accent }]} />
                                            <View style={{ flex: 1, gap: 3 }}>
                                                <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                                    {ev.title || ev.name || 'Event'}
                                                </Text>
                                                {(ev.start_at || ev.start_date || ev.start) ? (
                                                    <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                                                        {ev.all_day
                                                            ? 'All day'
                                                            : formatTime(ev.start_at || ev.start_date || ev.start)}
                                                        {!ev.all_day && (ev.end_at || ev.end_date || ev.end)
                                                            ? ` – ${formatTime(ev.end_at || ev.end_date || ev.end)}`
                                                            : ''}
                                                    </Text>
                                                ) : null}
                                                {ev.type_label || ev.event_type_name || ev.event_category ? (
                                                    <Text style={[styles.eventTag, { color: accent }]}>
                                                        {ev.type_label || ev.event_type_name || ev.event_category}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    );
                                })}
                            </Card>
                        );
                    })}
                </ScrollView>
            )}

            {/* Event-type visibility filter */}
            <Modal
                visible={filterVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setFilterVisible(false)}
            >
                <TouchableOpacity
                    style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
                    activeOpacity={1}
                    onPress={() => setFilterVisible(false)}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <Card>
                            <CardHeader>
                                <Text style={[styles.filterTitle, { color: colors.textPrimary }]}>Calendar Types</Text>
                                <TouchableOpacity onPress={() => setFilterVisible(false)} style={{ padding: 4 }}>
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </CardHeader>
                            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: 8 }}>
                                <Text style={[styles.filterSection, { color: colors.textSecondary }]}>Special Calendars</Text>
                                {SPECIAL_EVENT_TYPES.map((t) => (
                                    <FilterRow
                                        key={t.key}
                                        colors={colors}
                                        label={t.label}
                                        palette={colors[t.color]}
                                        selected={specialSelected[t.key] !== false}
                                        onToggle={() =>
                                            setSpecialSelected((s) => ({ ...s, [t.key]: !(s[t.key] !== false) }))
                                        }
                                    />
                                ))}

                                <Text style={[styles.filterSection, { color: colors.textSecondary }]}>Custom Calendars</Text>
                                {customTypes.length === 0 ? (
                                    <Text style={[styles.filterEmpty, { color: colors.textDisabled }]}>
                                        No custom calendars found.
                                    </Text>
                                ) : (
                                    customTypes.map((t) => (
                                        <FilterRow
                                            key={t.id}
                                            colors={colors}
                                            label={t.label}
                                            palette={colors[String(t.color).toLowerCase()]}
                                            selected={t.selected}
                                            onToggle={() =>
                                                setCustomTypes((list) =>
                                                    list.map((c) => (c.id === t.id ? { ...c, selected: !c.selected } : c))
                                                )
                                            }
                                        />
                                    ))
                                )}

                                <Text style={[styles.filterSection, { color: colors.textSecondary }]}>Other</Text>
                                <FilterRow
                                    colors={colors}
                                    label="Uncategorized"
                                    palette={colors.steel}
                                    selected={showUncategorized}
                                    onToggle={() => setShowUncategorized((v) => !v)}
                                />
                            </ScrollView>
                        </Card>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

function FilterRow({ colors, label, palette, selected, onToggle }) {
    const accent = palette?.text || colors.primary;
    return (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.filterRow}>
            <View
                style={[styles.filterSwatch, {
                    backgroundColor: palette?.background || colors.cardBackground,
                    borderColor: palette?.border || colors.border,
                }]}
            />
            <Text style={[styles.filterLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                {label}
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? accent : colors.textSecondary}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    barNav: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
    barRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    navBtn: { padding: 6 },
    iconBtn: { padding: 7, borderRadius: 8 },
    viewToggle: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
    viewToggleOption: { paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
    viewToggleDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
    label: { fontSize: 14, fontWeight: '600', flexShrink: 1 },

    // Month-grid view
    monthWrap: { padding: 12, paddingBottom: 32 },
    weekHeader: { flexDirection: 'row', marginBottom: 6 },
    weekHeaderCell: { width: '14.2857%', alignItems: 'center' },
    weekHeaderText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        // The full outline comes from Card (not just top/left): the bottom/right
        // edge used to come from the cells' square hairlines, which the rounded
        // clipping cut off at the corners.
    },
    gridCell: {
        width: '14.2857%',
        height: GRID_CELL_H,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        padding: 4,
        alignItems: 'center',
    },
    gridDate: { fontSize: 13, marginTop: 2 },
    gridBadge: {
        marginTop: 4,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gridBadgeText: { fontSize: 11, fontWeight: '700' },
    list: { padding: 16, paddingBottom: 32 },
    dayBlock: { marginBottom: cardGap },
    dayHeaderText: { fontSize: 14, fontWeight: '700' },
    todayPill: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, borderWidth: 1 },
    todayText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    eventRow: {
        flexDirection: 'row',
        gap: 10,
        ...cardBodyPadding,
    },
    accent: { width: 4, borderRadius: 2 },
    eventTitle: { fontSize: 14, fontWeight: '600' },
    eventTime: { fontSize: 12 },
    eventTag: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },

    // Event-type filter modal
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    filterTitle: { fontSize: 16, fontWeight: '700' },
    filterSection: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    filterEmpty: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    filterSwatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1 },
    filterLabel: { fontSize: 15, fontWeight: '500' },
});
