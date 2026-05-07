import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';

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

export default function CalendarScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [staff, setStaff] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [organisationId, setOrganisationId] = useState(null);
    const [month, setMonth] = useState(startOfMonth(new Date()));
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

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
                const list = res?.events || res?.data || res || [];
                setEvents(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Calendar load error', err);
                setError(err.body?.message || err.message || 'Failed to load calendar.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [staff, organisationId, month]
    );

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    // Group events by their start date — backend returns `start_at` field
    const grouped = useMemo(() => {
        const map = new Map();
        const startOf = (ev) => ev.start_at || ev.start_date || ev.start || ev.date;
        const sorted = [...events].sort((a, b) => {
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
    }, [events]);

    if (profileLoaded && !staff?.id) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Ionicons name="person-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No profile loaded. Please sign in again.
                    </Text>
                </View>
            </View>
        );
    }

    const today = new Date();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.bar, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMonth(startOfMonth(new Date()))}>
                    <Text style={[styles.label, { color: colors.textPrimary }]}>{fmtMonth(month)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
            </View>

            {isLoading && events.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && events.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : grouped.length === 0 ? (
                <ScrollView
                    contentContainerStyle={styles.center}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                >
                    <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} />
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
                            <View key={day.toISOString()} style={styles.dayBlock}>
                                <View style={styles.dayHeader}>
                                    <Text style={[styles.dayHeaderText, { color: isToday ? colors.primary : colors.textPrimary }]}>
                                        {dateHeader(day)}
                                    </Text>
                                    {isToday ? (
                                        <View style={[styles.todayPill, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
                                            <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
                                        </View>
                                    ) : null}
                                </View>
                                {items.map((ev, i) => {
                                    const accent = eventColor(ev.color, colors);
                                    return (
                                        <View
                                            key={`${ev.id ?? i}-${day.toISOString()}`}
                                            style={[styles.eventRow, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
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
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </View>
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
    navBtn: { padding: 6 },
    label: { fontSize: 14, fontWeight: '600' },
    list: { padding: 16, paddingBottom: 32 },
    dayBlock: { marginBottom: 16 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    dayHeaderText: { fontSize: 14, fontWeight: '700' },
    todayPill: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, borderWidth: 1 },
    todayText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    eventRow: {
        flexDirection: 'row',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginTop: 6,
    },
    accent: { width: 4, borderRadius: 2 },
    eventTitle: { fontSize: 14, fontWeight: '600' },
    eventTime: { fontSize: 12 },
    eventTag: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
