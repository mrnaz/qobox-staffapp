import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Card, { cardGap } from '../components/Card';
import NoticeCard from '../components/NoticeCard';
import ShiftTimer from '../components/ShiftTimer';
import Toast from '../components/Toast';
import CheckInModal from '../components/shift/CheckInModal';
import CheckOutModal from '../components/shift/CheckOutModal';
import { formatShiftStart, normalizeTimeLabel, isToday } from '../utils/datetime';
import { iconColor } from '../utils/iconColors';
import useTodayAgenda from '../hooks/useTodayAgenda';

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

    // A shift started on an earlier day is one the user forgot to close.
    // The chip says so; the colour stays green in both states, matching the
    // roster.
    const openShiftIsStale = Boolean(
        openShift && !isToday(openShift.actual_start || openShift.rostered_start)
    );
    const openAccent = colors.success || colors.primary;

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
                    <Ionicons name="person-outline" size={32} color={iconColor('person-outline', colors)} />
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
                    // Same card the roster pins above its list, so an open
                    // shift looks and behaves the same in both places.
                    <Card style={[styles.pinnedCard, {
                        borderColor: openAccent,
                        backgroundColor: openAccent + '18',
                    }]}>
                        <View style={styles.pinnedHeaderRow}>
                            <View style={[styles.runningDot, { backgroundColor: openAccent }]} />
                            <Text style={[styles.pinnedLabel, { color: openAccent }]}>On shift</Text>
                            {openShiftIsStale ? (
                                <View style={[styles.staleBadge, { borderColor: openAccent }]}>
                                    <Text style={[styles.staleText, { color: openAccent }]}>Not checked out</Text>
                                </View>
                            ) : null}
                            <View style={{ flex: 1 }} />
                            <ShiftTimer
                                startTimeUtc={openShift.actual_start_utc || openShift.actual_start}
                                timezone={openShift.timezone}
                                style={[styles.runningTimer, { color: colors.textPrimary }]}
                            />
                        </View>
                        <Text style={[styles.pinnedSub, { color: colors.textSecondary }]}>
                            Started {formatShiftStart(openShift.actual_start) || openShift.rostered_start_time || '—'}
                        </Text>
                        {openShift.rostered_end_time ? (
                            <Text style={[styles.pinnedSub, { color: colors.textSecondary }]}>
                                Ends at {normalizeTimeLabel(openShift.rostered_end_time)}
                            </Text>
                        ) : null}
                        <TouchableOpacity
                            onPress={() => setCheckOutTarget(openShift)}
                            style={[styles.btn, { backgroundColor: colors.warning || colors.primary, marginTop: 10 }]}
                        >
                            <Ionicons name="log-out-outline" size={16} color="#fff" />
                            <Text style={styles.btnText}>Check Out</Text>
                        </TouchableOpacity>
                    </Card>
                ) : null}

                {/* Shifts rostered for today that have not been started yet.
                    Tapping one opens the check-in sheet with its kiosk QR. */}
                {todayShifts.map((shift) => (
                    <Card
                        key={shift.id || `roster-${shift.staff_roster_id}`}
                        onPress={() => {
                            if (openShift) {
                                setToast({
                                    message: 'You are already on shift — check out first.',
                                    variant: 'error',
                                });
                                return;
                            }
                            setCheckInTarget(shift);
                        }}
                        style={styles.runningCard}
                    >
                        <Ionicons name="time-outline" size={20} color={iconColor('time-outline', colors)} />
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
                    </Card>
                ))}

                <Card
                    onPress={() => router.push('/today')}
                    style={styles.todayBox}
                >
                    {[
                        { icon: 'school-outline', count: todayClasses.length, label: 'Classes' },
                        { icon: 'calendar-outline', count: todayEvents.length, label: 'Calendar Events' },
                        ...(todayPtms.length > 0
                            ? [{ icon: 'chatbubbles-outline', count: todayPtms.length, label: 'PTM Meetings' }]
                            : []),
                    ].map((row) => (
                        <View key={row.label} style={styles.todayRow}>
                            <Ionicons name={row.icon} size={22} color={iconColor(row.icon, colors)} style={styles.todayIcon} />
                            <Text style={[styles.todayCount, { color: colors.textPrimary }]}>
                                {agendaLoading && agendaEmpty ? '–' : row.count}
                            </Text>
                            <Text style={[styles.todayLabel, { color: colors.textPrimary }]}>{row.label}</Text>
                        </View>
                    ))}
                </Card>
            </Section>

            {/* Notices */}
            <Section title="Notices" colors={colors}>
                {notices.length === 0 && !isLoading ? (
                    <Card style={styles.emptyCard}>
                        <Ionicons name="megaphone-outline" size={28} color={iconColor('megaphone-outline', colors)} />
                        <Text style={[styles.emptyCardTitle, { color: colors.textPrimary }]}>
                            No notices
                        </Text>
                        <Text style={[styles.emptyCardText, { color: colors.textSecondary }]}>
                            Announcements will appear here.
                        </Text>
                    </Card>
                ) : (
                    notices.map((n) => <NoticeCard key={n.id} notice={n} />)
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
        <View style={{ marginBottom: cardGap + 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
            <View style={{ gap: cardGap }}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20, paddingBottom: 40 },
    greeting: { marginBottom: 20 },
    greetingName: { fontSize: 26, fontWeight: '700' },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    emptyCard: { padding: 24, alignItems: 'center', gap: 6 },
    emptyCardTitle: { fontSize: 14, fontWeight: '600' },
    emptyCardText: { fontSize: 12, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

    // Running shift banner
    pinnedCard: { padding: 14, gap: 4 },
    pinnedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pinnedLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    pinnedSub: { fontSize: 12 },
    staleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    staleText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    btnText: { color: '#fff', fontWeight: '700' },
    runningCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
    },
    runningDot: {
        width: 10, height: 10, borderRadius: 5,
    },
    runningLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    runningSub: { fontSize: 11, marginTop: 2 },
    runningTimer: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },

    // Today counts box
    todayBox: { paddingVertical: 8, paddingHorizontal: 14 },
    todayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    todayIcon: { width: 30 },
    todayCount: { fontSize: 18, fontWeight: '700', width: 34 },
    todayLabel: { fontSize: 16, fontWeight: '500' },
});
