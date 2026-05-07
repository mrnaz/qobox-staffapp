import React, { useCallback, useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';

const fmtDateForApi = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const eventColor = (name, theme) => {
    if (!name) return theme.primary;
    const palette = theme[String(name).toLowerCase()];
    if (palette && typeof palette === 'object' && palette.text) return palette.text;
    return theme.primary;
};

export default function DashboardScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [currentSite, setCurrentSite] = useState(null);
    const [orgId, setOrgId] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);

    const [sessions, setSessions] = useState([]);
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        (async () => {
            const [s, siteIdValue, rolesJson, org] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('siteId'),
                AsyncStorage.getItem('roles'),
                AsyncStorage.getItem('organisationId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            try {
                const roles = rolesJson ? JSON.parse(rolesJson) : [];
                const match = roles.find((r) => String(r.site_id) === String(siteIdValue));
                if (match) {
                    setCurrentSite({
                        siteName: match.site_name,
                        orgName: match.org_name,
                        roleName: match.role_name,
                    });
                }
            } catch { /* ignore */ }
            setOrgId(org);
            setProfileLoaded(true);
        })();
    }, []);

    const loadToday = useCallback(
        async (opts = {}) => {
            if (!staff?.id) return;
            try {
                if (!opts.refresh) setIsLoading(true);
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                const todayStr = fmtDateForApi(today);
                const tomorrowStr = fmtDateForApi(tomorrow);

                // Backend `whereBetween('session_start', [start, end])` treats
                // start_date == end_date as a single instant (midnight in the
                // site's timezone), so we must extend `end` to the next day to
                // include all of today's sessions.
                const [tt, cal] = await Promise.allSettled([
                    api.getStaffTimetable(staff.id, { start_date: todayStr, end_date: tomorrowStr }),
                    api.getCalendarEvents({ from: todayStr, to: tomorrowStr, staff_id: staff.id, org_id: orgId }),
                ]);

                const isOnDay = (iso, day) => {
                    if (!iso) return false;
                    const d = new Date(iso);
                    return (
                        d.getFullYear() === day.getFullYear() &&
                        d.getMonth() === day.getMonth() &&
                        d.getDate() === day.getDate()
                    );
                };
                if (tt.status === 'fulfilled') {
                    const list = tt.value?.timetable || tt.value?.data || tt.value || [];
                    const todayOnly = (Array.isArray(list) ? list : []).filter((s) =>
                        isOnDay(s.session_start || s.start, today)
                    );
                    setSessions(todayOnly);
                }
                if (cal.status === 'fulfilled') {
                    const list = cal.value?.events || cal.value?.data || cal.value || [];
                    const todayOnly = (Array.isArray(list) ? list : []).filter((e) =>
                        isOnDay(e.start_at || e.start_date || e.start, today)
                    );
                    setEvents(todayOnly);
                }
            } catch (err) {
                console.error('Dashboard load error', err);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [staff, orgId]
    );

    useEffect(() => { loadToday(); }, [loadToday]);

    const onRefresh = () => {
        setIsRefreshing(true);
        loadToday({ refresh: true });
    };

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

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    })();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            {/* Welcome */}
            <View style={styles.greeting}>
                <Text style={[styles.greetingLabel, { color: colors.textSecondary }]}>{greeting},</Text>
                <Text style={[styles.greetingName, { color: colors.textPrimary }]}>
                    {staff?.fname ? staff.fname : 'Staff'}
                </Text>
                {currentSite ? (
                    <Text style={[styles.greetingSub, { color: colors.textSecondary }]}>
                        {currentSite.siteName}
                        {currentSite.orgName ? ` · ${currentSite.orgName}` : ''}
                    </Text>
                ) : null}
            </View>

            {/* Today */}
            <Section title="Today" colors={colors}>
                {isLoading && sessions.length === 0 && events.length === 0 ? (
                    <ActivityIndicator color={colors.primary} style={{ paddingVertical: 24 }} />
                ) : (
                    <>
                        {sessions.length === 0 && events.length === 0 ? (
                            <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                                <Ionicons name="cafe-outline" size={28} color={colors.textSecondary} />
                                <Text style={[styles.emptyCardTitle, { color: colors.textPrimary }]}>
                                    Nothing on your plate today
                                </Text>
                                <Text style={[styles.emptyCardText, { color: colors.textSecondary }]}>
                                    No classes or events scheduled.
                                </Text>
                            </View>
                        ) : (
                            <>
                                {sessions.map((it, i) => {
                                    const classTitle = it.class?.title || it.class_title || it.title || 'Class';
                                    const roomName = it.room?.name || it.room_name;
                                    return (
                                        <View
                                            key={`s-${it.id ?? i}`}
                                            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                                        >
                                            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
                                                <Ionicons name="school-outline" size={18} color={colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                                    {classTitle}
                                                </Text>
                                                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                                                    {formatTime(it.session_start)} – {formatTime(it.session_end)}
                                                    {roomName ? ` · ${roomName}` : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                                {events.map((ev, i) => {
                                    const accent = eventColor(ev.color, colors);
                                    return (
                                        <View
                                            key={`e-${ev.id ?? i}`}
                                            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                                        >
                                            <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
                                                <Ionicons name="calendar-outline" size={18} color={accent} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                                    {ev.title || ev.name || 'Event'}
                                                </Text>
                                                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                                                    {ev.all_day ? 'All day' : formatTime(ev.start_at || ev.start_date || ev.start)}
                                                    {ev.type_label || ev.event_type_name ? ` · ${ev.type_label || ev.event_type_name}` : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </>
                )}
            </Section>

            {/* Quick links */}
            <Section title="Jump to" colors={colors}>
                <View style={styles.quickGrid}>
                    <QuickLink label="Roster"   icon="briefcase-outline" colors={colors} onPress={() => router.push('/(main)/roster')} />
                    <QuickLink label="Timetable" icon="grid-outline"      colors={colors} onPress={() => router.push('/(main)/timetable')} />
                    <QuickLink label="Calendar" icon="calendar-outline"  colors={colors} onPress={() => router.push('/(main)/calendar')} />
                    <QuickLink label="Classes"  icon="school-outline"     colors={colors} onPress={() => router.push('/(main)/classes')} />
                </View>
            </Section>
        </ScrollView>
    );
}

function Section({ title, children, colors }) {
    return (
        <View style={{ marginBottom: 18 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
            <View style={{ gap: 8 }}>{children}</View>
        </View>
    );
}

function QuickLink({ label, icon, onPress, colors }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            style={[styles.quickItem, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
        >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
                <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20, paddingBottom: 40 },
    greeting: { marginBottom: 20 },
    greetingLabel: { fontSize: 14 },
    greetingName: { fontSize: 26, fontWeight: '700', marginTop: 2 },
    greetingSub: { fontSize: 13, marginTop: 4 },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    emptyCard: { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: 'center', gap: 6 },
    emptyCardTitle: { fontSize: 14, fontWeight: '600' },
    emptyCardText: { fontSize: 12, textAlign: 'center' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
    },
    iconWrap: {
        width: 40, height: 40, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    rowTitle: { fontSize: 14, fontWeight: '600' },
    rowSub: { fontSize: 12, marginTop: 2 },
    quickGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    quickItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexBasis: '48%',
        flexGrow: 1,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
    },
    quickLabel: { fontSize: 14, fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
