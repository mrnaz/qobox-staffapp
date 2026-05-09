import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import ShiftTimer from '../components/ShiftTimer';

// Map post_scope → theme color group (matching client app's NoticeboardList)
const SCOPE_PALETTE = {
    classes:      'azure',
    client_clubs: 'turquoise',
    staff_teams:  'emerald',
    global:       'purple',
    courses:      'teal',
};

const stripHtml = (html = '') =>
    html
        .replace(/<\/(p|div|li|br|h[1-6])>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n+/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

const relativeTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

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
    const [siteId, setSiteId] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);

    const [sessions, setSessions] = useState([]);
    const [events, setEvents] = useState([]);
    const [notices, setNotices] = useState([]);
    const [openShift, setOpenShift] = useState(null);
    const [pickedNotice, setPickedNotice] = useState(null);
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
            setSiteId(siteIdValue);
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
                const [tt, cal, nb, rl] = await Promise.allSettled([
                    api.getStaffTimetable(staff.id, { start_date: todayStr, end_date: tomorrowStr }),
                    api.getCalendarEvents({ from: todayStr, to: tomorrowStr, staff_id: staff.id, org_id: orgId }),
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
                if (nb.status === 'fulfilled') {
                    const list = nb.value?.noticeboard || nb.value?.data || nb.value || [];
                    setNotices(Array.isArray(list) ? list : []);
                }
                if (rl.status === 'fulfilled') {
                    // Top-level `open_shift` is set when the user has an active
                    // (checked-in but not checked-out) shift. Per-row open_shift
                    // fields exist too — fall back to scanning the data list.
                    let open = rl.value?.open_shift || null;
                    if (!open && Array.isArray(rl.value?.data)) {
                        const item = rl.value.data.find((s) => s.has_open_shift || (s.actual_start && !s.actual_end));
                        if (item?.has_open_shift) {
                            open = {
                                id: item.open_shift_id,
                                actual_start: item.open_shift_actual_start,
                                actual_start_utc: item.open_shift_actual_start_utc,
                                rostered_start_full_date: item.open_shift_rostered_start_full_date,
                                rostered_start_time: item.open_shift_rostered_start_time,
                                rostered_end_time: item.open_shift_rostered_end_time,
                            };
                        } else if (item) {
                            open = item;
                        }
                    }
                    setOpenShift(open);
                }
            } catch (err) {
                console.error('Dashboard load error', err);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [staff, orgId, siteId]
    );

    useEffect(() => { loadToday(); }, [loadToday]);
    // Refresh when returning to Dashboard (e.g. after check-in/out from Roster)
    useFocusEffect(useCallback(() => { loadToday({ refresh: true }); }, [loadToday]));

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
        <>
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

            {/* Running shift banner */}
            {openShift ? (
                <TouchableOpacity
                    onPress={() => router.push('/(main)/roster')}
                    activeOpacity={0.85}
                    style={[styles.runningCard, {
                        borderColor: colors.success || colors.primary,
                        backgroundColor: (colors.success || colors.primary) + '18',
                    }]}
                >
                    <View style={[styles.runningDot, { backgroundColor: colors.success || colors.primary }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.runningLabel, { color: colors.success || colors.primary }]}>
                            On shift
                        </Text>
                        <Text style={[styles.runningSub, { color: colors.textSecondary }]}>
                            Started {openShift.actual_start || openShift.rostered_start_time || ''}
                            {openShift.rostered_end_time ? ` · ends ${openShift.rostered_end_time}` : ''}
                        </Text>
                    </View>
                    <ShiftTimer
                        startTimeUtc={openShift.actual_start_utc || openShift.actual_start}
                        style={[styles.runningTimer, { color: colors.textPrimary }]}
                    />
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
            ) : null}

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

            {/* Notices */}
            <Section title="Notices" colors={colors}>
                {notices.length === 0 && !isLoading ? (
                    <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                        <Ionicons name="megaphone-outline" size={28} color={colors.textSecondary} />
                        <Text style={[styles.emptyCardTitle, { color: colors.textPrimary }]}>
                            No notices
                        </Text>
                        <Text style={[styles.emptyCardText, { color: colors.textSecondary }]}>
                            Announcements will appear here.
                        </Text>
                    </View>
                ) : (
                    notices.map((n) => {
                        const paletteKey = SCOPE_PALETTE[n.post_scope] || 'indigo';
                        const palette = colors[paletteKey];
                        return (
                            <TouchableOpacity
                                key={n.id}
                                onPress={() => setPickedNotice(n)}
                                activeOpacity={0.8}
                                style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                            >
                                <View style={styles.noticeHeader}>
                                    <Avatar uri={n.photo} name={n.author_name} size={36} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.noticeAuthor, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {n.author_name || 'Unknown'}
                                        </Text>
                                        <Text style={[styles.noticeTime, { color: colors.textSecondary }]}>
                                            {relativeTime(n.scheduled || n.created_at)}
                                        </Text>
                                    </View>
                                    {n.chip_label ? (
                                        <View style={[styles.chip, {
                                            backgroundColor: palette?.background || colors.primary + '22',
                                            borderColor: palette?.border || colors.primary,
                                        }]}>
                                            <Text style={[styles.chipText, { color: palette?.text || colors.primary }]} numberOfLines={1}>
                                                {n.chip_label}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                                {n.title ? (
                                    <Text style={[styles.noticeTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                        {n.title}
                                    </Text>
                                ) : null}
                                <Text style={[styles.noticeBody, { color: colors.textSecondary }]} numberOfLines={2}>
                                    {stripHtml(n.body || '')}
                                </Text>
                            </TouchableOpacity>
                        );
                    })
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

        {/* Notice detail */}
        <Modal
            visible={!!pickedNotice}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setPickedNotice(null)}
        >
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setPickedNotice(null)} style={styles.modalCloseBtn}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        Notice
                    </Text>
                    <View style={{ width: 32 }} />
                </View>
                {pickedNotice ? (() => {
                    const paletteKey = SCOPE_PALETTE[pickedNotice.post_scope] || 'indigo';
                    const palette = colors[paletteKey];
                    return (
                        <ScrollView contentContainerStyle={styles.modalBody}>
                            <View style={styles.noticeHeader}>
                                <Avatar uri={pickedNotice.photo} name={pickedNotice.author_name} size={36} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.noticeAuthor, { color: colors.textPrimary }]}>
                                        {pickedNotice.author_name || 'Unknown'}
                                    </Text>
                                    <Text style={[styles.noticeTime, { color: colors.textSecondary }]}>
                                        {relativeTime(pickedNotice.scheduled || pickedNotice.created_at)}
                                    </Text>
                                </View>
                            </View>
                            {pickedNotice.chip_label ? (
                                <View style={[styles.chip, styles.chipModal, {
                                    backgroundColor: palette?.background || colors.primary + '22',
                                    borderColor: palette?.border || colors.primary,
                                }]}>
                                    <Text style={[styles.chipText, { color: palette?.text || colors.primary }]}>
                                        {pickedNotice.chip_label}
                                    </Text>
                                </View>
                            ) : null}
                            {pickedNotice.title ? (
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                    {pickedNotice.title}
                                </Text>
                            ) : null}
                            <Text style={[styles.modalBodyText, { color: colors.textPrimary }]}>
                                {stripHtml(pickedNotice.body || '')}
                            </Text>
                        </ScrollView>
                    );
                })() : null}
            </View>
        </Modal>
        </>
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

    // Running shift banner
    runningCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    runningDot: {
        width: 10, height: 10, borderRadius: 5,
    },
    runningLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    runningSub: { fontSize: 11, marginTop: 2 },
    runningTimer: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },

    // Notices
    noticeCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        gap: 8,
    },
    noticeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    noticeAuthor: { fontSize: 13, fontWeight: '600' },
    noticeTime: { fontSize: 11, marginTop: 1 },
    chip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        maxWidth: 140,
    },
    chipText: { fontSize: 11, fontWeight: '600' },
    noticeTitle: { fontSize: 14, fontWeight: '600' },
    noticeBody: { fontSize: 12, lineHeight: 17 },

    // Notice detail modal
    modalContainer: { flex: 1 },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    modalCloseBtn: { padding: 6, width: 32, alignItems: 'center' },
    modalHeaderTitle: { fontSize: 15, fontWeight: '700' },
    modalBody: { padding: 20, gap: 12 },
    chipModal: { alignSelf: 'flex-start', maxWidth: '100%' },
    modalTitle: { fontSize: 20, fontWeight: '700' },
    modalBodyText: { fontSize: 14, lineHeight: 22 },
});
