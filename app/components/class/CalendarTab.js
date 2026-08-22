import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconColor } from '../../utils/iconColors';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Card, { CardHeader, cardBodyPadding, cardGap } from '../Card';

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

const eventColor = (name, theme) => {
    if (!name) return theme.primary;
    const palette = theme[String(name).toLowerCase()];
    if (palette && typeof palette === 'object' && palette.text) return palette.text;
    return theme.primary;
};

const startOf = (ev) => ev.start_at || ev.start_date || ev.start || ev.session_start || ev.date;
const endOf = (ev) => ev.end_at || ev.end_date || ev.end || ev.session_end;

// "Calendar" tab — class-scoped agenda. Mirrors the client app's CalendarTab
// (class calendar) and reuses the staff Calendar screen's month/agenda layout.
export default function CalendarTab({ classId }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [month, setMonth] = useState(startOfMonth(new Date()));
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    // Bumped on every load() call; lets an in-flight request's response detect
    // it's been superseded by a newer month change and skip its setState.
    const loadRequestIdRef = useRef(0);

    const load = useCallback(
        async (opts = {}) => {
            // Tag this load so a later month change (which starts its own load
            // before this one resolves) can make this one's results a no-op
            // instead of clobbering the newer month's data.
            const requestId = ++loadRequestIdRef.current;
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const res = await api.getClassCalendar(classId, {
                    // Backend ClassesController@get_calendar reads start_date / end_date
                    // (not from/to like the global calendar endpoint).
                    start_date: fmtDate(startOfMonth(month)),
                    end_date: fmtDate(endOfMonth(month)),
                });
                if (requestId !== loadRequestIdRef.current) return;
                const list =
                    res?.events || res?.calendar || res?.sessions || res?.data || res || [];
                setEvents(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Class calendar load error', err);
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
        [classId, month]
    );

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const grouped = useMemo(() => {
        const map = new Map();
        const sorted = [...events].sort(
            (a, b) => (new Date(startOf(a)).getTime() || 0) - (new Date(startOf(b)).getTime() || 0)
        );
        sorted.forEach((ev) => {
            const dStr = startOf(ev);
            if (!dStr) return;
            const d = new Date(dStr);
            if (Number.isNaN(d.getTime())) return;
            const key = fmtDate(d);
            if (!map.has(key)) map.set(key, { day: d, items: [] });
            map.get(key).items.push(ev);
        });
        return Array.from(map.values());
    }, [events]);

    const today = new Date();

    return (
        <View style={styles.container}>
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
                    <Ionicons name="alert-circle-outline" size={32} color={iconColor('alert-circle-outline', colors)} />
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
                    <Ionicons name="calendar-outline" size={32} color={iconColor('calendar-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No sessions this month.</Text>
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
                                                    {ev.title || ev.name || ev.class_title || 'Session'}
                                                </Text>
                                                {startOf(ev) ? (
                                                    <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                                                        {ev.all_day
                                                            ? 'All day'
                                                            : formatTime(startOf(ev))}
                                                        {!ev.all_day && endOf(ev) ? ` – ${formatTime(endOf(ev))}` : ''}
                                                    </Text>
                                                ) : null}
                                                {ev.room_name || ev.room?.name ? (
                                                    <Text style={[styles.eventMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                                                        {ev.room_name || ev.room?.name}
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
    eventMeta: { fontSize: 12 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
