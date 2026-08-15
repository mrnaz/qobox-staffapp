import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Dimensions,
} from 'react-native';
import RenderHtml from 'react-native-render-html';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import ShiftTimer from '../components/ShiftTimer';
import Toast from '../components/Toast';
import CheckInModal from '../components/shift/CheckInModal';
import CheckOutModal from '../components/shift/CheckOutModal';
import { formatShiftStart, normalizeTimeLabel } from '../utils/datetime';
import useTodayAgenda from '../hooks/useTodayAgenda';

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

export default function DashboardScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [staff, setStaff] = useState(null);
    const [orgId, setOrgId] = useState(null);
    const [siteId, setSiteId] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);

    const { classes: todayClasses, events: todayEvents, ptms: todayPtms, loading: agendaLoading } =
        useTodayAgenda(staff?.id, orgId);

    const agendaEmpty =
        todayClasses.length === 0 && todayEvents.length === 0 && todayPtms.length === 0;

    const [notices, setNotices] = useState([]);
    const [openShift, setOpenShift] = useState(null);
    const [todayShifts, setTodayShifts] = useState([]);
    const [permissions, setPermissions] = useState({ app_checkinout: true, kiosk_checkinout: true });
    const [checkInTarget, setCheckInTarget] = useState(null);
    const [checkOutTarget, setCheckOutTarget] = useState(null);
    const [toast, setToast] = useState(null);
    const [expandedNoticeId, setExpandedNoticeId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        (async () => {
            const [s, siteIdValue, org] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('siteId'),
                AsyncStorage.getItem('organisationId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
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

                const [nb, td] = await Promise.allSettled([
                    api.getDashboardNoticeboard({ limit: 5, page: 1 }),
                    // Today's roster. Omitting show_past_shifts makes the backend
                    // return ONLY shifts rostered today in the site's timezone —
                    // 'false' would mean "today and every future shift", which is
                    // how future shifts ended up on the dashboard as "Shift today".
                    // The same response carries a top-level `open_shift` whenever
                    // one exists, with NO date filter, so a shift the user forgot
                    // to close days ago still surfaces here.
                    siteId
                        ? api.getMyShifts({
                              staff_id: staff.id,
                              site_id: siteId,
                              page: 1,
                              limit: 50,
                          })
                        : Promise.resolve({ data: [], open_shift: null }),
                ]);

                if (nb.status === 'fulfilled') {
                    const list = nb.value?.noticeboard || nb.value?.data || nb.value || [];
                    setNotices(Array.isArray(list) ? list : []);
                }
                if (td.status === 'fulfilled') {
                    // Top-level `open_shift` is set when the user has an active
                    // (checked-in but not checked-out) shift. Per-row open_shift
                    // fields exist too — fall back to scanning the data list.
                    let open = td.value?.open_shift || null;
                    if (!open && Array.isArray(td.value?.data)) {
                        const item = td.value.data.find((s) => s.has_open_shift || (s.actual_start && !s.actual_end));
                        if (item?.has_open_shift) {
                            open = {
                                id: item.open_shift_id,
                                actual_start: item.open_shift_actual_start,
                                actual_start_utc: item.open_shift_actual_start_utc,
                                rostered_start_full_date: item.open_shift_rostered_start_full_date,
                                rostered_start_time: item.open_shift_rostered_start_time,
                                rostered_end_time: item.open_shift_rostered_end_time,
                                // Needed by the check-out sheet: claimed_start is
                                // echoed back in the payload, and without the
                                // timezone the submitted time would be device-local
                                // rather than the site's. This row belongs to the
                                // same site, so its timezone is the right one.
                                claimed_start: item.open_shift_claimed_start,
                                timezone: item.timezone,
                            };
                        } else if (item) {
                            open = item;
                        }
                    }
                    setOpenShift(open);

                    const rows = Array.isArray(td.value?.data) ? td.value.data : [];
                    // Only shifts still waiting to be started belong on the
                    // "today's shift" card; an in-progress one is already
                    // represented by the On shift card, and a finished one is done.
                    setTodayShifts(rows.filter((s) => !s.actual_start && !s.absent));
                    if (td.value?.permissions) setPermissions(td.value.permissions);
                }
            } catch (err) {
                console.error('Dashboard load error', err);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [staff, siteId]
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

    return (
        <>
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            {/* Today */}
            <Section title="Today" colors={colors}>
                {/* On-shift card — it's part of today, so it lives under this heading.
                    Tapping it opens the check-out sheet, which carries the kiosk QR. */}
                {openShift ? (
                    <TouchableOpacity
                        onPress={() => setCheckOutTarget(openShift)}
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
                                Started {formatShiftStart(openShift.actual_start) || openShift.rostered_start_time || '—'}
                            </Text>
                            {openShift.rostered_end_time ? (
                                <Text style={[styles.runningSub, { color: colors.textSecondary }]}>
                                    Ends at {normalizeTimeLabel(openShift.rostered_end_time)}
                                </Text>
                            ) : null}
                        </View>
                        <ShiftTimer
                            startTimeUtc={openShift.actual_start_utc || openShift.actual_start}
                            style={[styles.runningTimer, { color: colors.textPrimary }]}
                        />
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                ) : null}

                {/* Shifts rostered for today that have not been started yet.
                    Tapping one opens the check-in sheet with its kiosk QR. */}
                {todayShifts.map((shift) => (
                    <TouchableOpacity
                        key={shift.id || `roster-${shift.staff_roster_id}`}
                        onPress={() => setCheckInTarget(shift)}
                        activeOpacity={0.85}
                        style={[styles.runningCard, {
                            borderColor: colors.border,
                            backgroundColor: colors.cardBackground,
                        }]}
                    >
                        <Ionicons name="time-outline" size={20} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.runningLabel, { color: colors.primary }]}>
                                Shift today
                            </Text>
                            <Text style={[styles.runningSub, { color: colors.textSecondary }]}>
                                {shift.rostered_start_time && shift.rostered_end_time
                                    ? `${normalizeTimeLabel(shift.rostered_start_time)} – ${normalizeTimeLabel(shift.rostered_end_time)}`
                                    : formatShiftStart(shift.rostered_start) || '—'}
                            </Text>
                            {shift.site_name ? (
                                <Text style={[styles.runningSub, { color: colors.textSecondary }]}>
                                    {shift.site_name}
                                </Text>
                            ) : null}
                        </View>
                        <Text style={[styles.runningLabel, { color: colors.textSecondary }]}>Check in</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                ))}

                <TouchableOpacity
                    onPress={() => router.push('/today')}
                    activeOpacity={0.85}
                    style={[styles.todayBox, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                >
                    {[
                        { icon: 'school-outline', count: todayClasses.length, label: 'Classes' },
                        { icon: 'calendar-outline', count: todayEvents.length, label: 'Calendar Events' },
                        ...(todayPtms.length > 0
                            ? [{ icon: 'chatbubbles-outline', count: todayPtms.length, label: 'PTM Meetings' }]
                            : []),
                    ].map((row) => (
                        <View key={row.label} style={styles.todayRow}>
                            <Ionicons name={row.icon} size={22} color={colors.textPrimary} style={styles.todayIcon} />
                            <Text style={[styles.todayCount, { color: colors.textPrimary }]}>
                                {agendaLoading && agendaEmpty ? '–' : row.count}
                            </Text>
                            <Text style={[styles.todayLabel, { color: colors.textPrimary }]}>{row.label}</Text>
                        </View>
                    ))}
                </TouchableOpacity>
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
                        const isExpanded = expandedNoticeId === n.id;
                        return (
                            <TouchableOpacity
                                key={n.id}
                                onPress={() => setExpandedNoticeId(isExpanded ? null : n.id)}
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
                                    <Text
                                        style={[styles.noticeTitle, { color: colors.textPrimary }]}
                                        numberOfLines={isExpanded ? undefined : 2}
                                    >
                                        {n.title}
                                    </Text>
                                ) : null}

                                {n.body ? (
                                    isExpanded ? (
                                        <View style={{ marginTop: 4 }}>
                                            <RenderHtml
                                                contentWidth={Dimensions.get('window').width - 64}
                                                source={{ html: n.body }}
                                                baseStyle={{
                                                    fontSize: 13,
                                                    color: colors.textSecondary,
                                                    lineHeight: 19,
                                                }}
                                                tagsStyles={{
                                                    p:  { marginVertical: 4, color: colors.textSecondary },
                                                    h1: { fontSize: 18, fontWeight: 'bold', marginVertical: 8, color: colors.textPrimary },
                                                    h2: { fontSize: 16, fontWeight: 'bold', marginVertical: 6, color: colors.textPrimary },
                                                    h3: { fontSize: 15, fontWeight: '600', marginVertical: 4, color: colors.textPrimary },
                                                    b: { fontWeight: 'bold', color: colors.textSecondary },
                                                    strong: { fontWeight: 'bold', color: colors.textSecondary },
                                                    i: { fontStyle: 'italic', color: colors.textSecondary },
                                                    em: { fontStyle: 'italic', color: colors.textSecondary },
                                                    a: { color: colors.primary, textDecorationLine: 'underline' },
                                                    ul: { marginVertical: 4, paddingLeft: 16 },
                                                    ol: { marginVertical: 4, paddingLeft: 16 },
                                                    li: { marginVertical: 2, color: colors.textSecondary },
                                                }}
                                            />
                                        </View>
                                    ) : (
                                        <Text
                                            style={[styles.noticeBody, { color: colors.textSecondary }]}
                                            numberOfLines={4}
                                        >
                                            {stripHtml(n.body)}
                                        </Text>
                                    )
                                ) : null}

                                {n.body && stripHtml(n.body).length > 100 ? (
                                    <View style={styles.expandHint}>
                                        <Text style={[styles.expandHintText, { color: colors.primary }]}>
                                            {isExpanded ? 'Show less' : 'Read more'}
                                        </Text>
                                        <Ionicons
                                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                            size={14}
                                            color={colors.primary}
                                        />
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })
                )}
            </Section>
        </ScrollView>

        <CheckInModal
            shift={checkInTarget}
            staff={staff}
            siteId={siteId}
            permissions={permissions}
            onClose={() => setCheckInTarget(null)}
            onSuccess={() => {
                loadToday({ refresh: true });
                setToast({ message: 'Checked in', variant: 'success' });
            }}
            onError={(message) => setToast({ message, variant: 'error' })}
        />

        <CheckOutModal
            shift={checkOutTarget}
            staff={staff}
            siteId={siteId}
            permissions={permissions}
            onClose={() => setCheckOutTarget(null)}
            onSuccess={() => {
                setOpenShift(null);
                loadToday({ refresh: true });
                setToast({ message: 'Checked out', variant: 'success' });
            }}
            onError={(message) => setToast({ message, variant: 'error' })}
        />

        <Toast toast={toast} onHide={() => setToast(null)} />
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

const styles = StyleSheet.create({
    container: { padding: 20, paddingBottom: 40 },
    greeting: { marginBottom: 20 },
    greetingName: { fontSize: 26, fontWeight: '700' },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    emptyCard: { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: 'center', gap: 6 },
    emptyCardTitle: { fontSize: 14, fontWeight: '600' },
    emptyCardText: { fontSize: 12, textAlign: 'center' },
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
    noticeBody: { fontSize: 13, lineHeight: 19 },
    expandHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 6,
    },
    expandHintText: { fontSize: 12, fontWeight: '600' },

    // Today counts box
    todayBox: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
    todayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    todayIcon: { width: 30 },
    todayCount: { fontSize: 18, fontWeight: '700', width: 34 },
    todayLabel: { fontSize: 16, fontWeight: '500' },
});
