import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    Switch,
    Modal,
    ScrollView,
    TextInput,
    Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import ShiftTimer from '../components/ShiftTimer';
import Toast from '../components/Toast';
import Card, { CardHeader, cardBodyPadding, cardGap } from '../components/Card';
import CheckInModal from '../components/shift/CheckInModal';
import CheckOutModal from '../components/shift/CheckOutModal';
import ShiftQrModal from '../components/shift/ShiftQrModal';
import useShiftQr from '../components/shift/useShiftQr';
import { parseWallClock, formatShiftStart, normalizeTimeLabel, isToday } from '../utils/datetime';
import { iconColor } from '../utils/iconColors';

const fmtDateForApi = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
};

// Mirrors the staff portal's 8-day check-in window.
const canShowAction = (item) => {
    if (item.actual_start && item.actual_end) return false;
    if (item.actual_start && !item.actual_end) return true;
    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const endOfToday = today.getTime();
    const refDate = parseWallClock(item.rostered_start || item.claimed_start);
    if (!refDate) return true;
    const refTime = refDate.getTime();
    return refTime >= eightDaysAgo && refTime <= endOfToday;
};

const shiftStatus = (item) => {
    if (item.actual_start && item.actual_end) return 'completed';
    if (item.actual_start && !item.actual_end) return 'in_progress';
    return 'upcoming';
};

// True when the shift is rostered for today (device-local day). Used to limit
// the "Check In" button to today's shifts.
const isShiftToday = (item) => isToday(item.rostered_start || item.claimed_start);

export default function RosterScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const PAGE_SIZE = 10;

    const [staff, setStaff] = useState(null);
    const [siteId, setSiteId] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [openShift, setOpenShift] = useState(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showPast, setShowPast] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [actingOnId, setActingOnId] = useState(null);
    const [selectedShift, setSelectedShift] = useState(null);
    const [markAbsence, setMarkAbsence] = useState(false);
    const [absenceReason, setAbsenceReason] = useState('');
    const [toast, setToast] = useState(null);
    // Which shift each sheet is acting on. The sheets own their own form state.
    const [checkInTarget, setCheckInTarget] = useState(null);
    const [checkOutTarget, setCheckOutTarget] = useState(null);
    // Organisation switches for in-app and kiosk check in/out, delivered on the
    // roster-log query. Default to permitted so a stale response never hides
    // controls that actually work.
    const [permissions, setPermissions] = useState({ app_checkinout: true, kiosk_checkinout: true });
    const inFlightRef = useRef(false);

    // The shift-detail sheet offers a QR too, independently of the check-in and
    // check-out sheets, which each own theirs.
    const detailQr = useShiftQr();

    const resetModalState = () => {
        setMarkAbsence(false);
        setAbsenceReason('');
    };

    useEffect(() => {
        if (!selectedShift) resetModalState();
    }, [selectedShift]);

    useEffect(() => {
        (async () => {
            const [s, site] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('siteId'),
            ]);
            try { setStaff(s ? JSON.parse(s) : null); } catch { setStaff(null); }
            setSiteId(site);
            setProfileLoaded(true);
        })();
    }, []);

    const fetchPage = useCallback(
        async ({ targetPage, mode }) => {
            // mode: 'initial' | 'refresh' | 'more'
            if (!staff?.id || !siteId) return;
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            try {
                if (mode === 'initial') setIsLoading(true);
                if (mode === 'more') setIsLoadingMore(true);
                setError('');
                const params = {
                    staff_id: staff.id,
                    site_id: siteId,
                    show_past_shifts: showPast ? 'true' : 'false',
                    page: targetPage,
                    limit: PAGE_SIZE,
                };
                // "Show past shifts" means yesterday and backwards — pass an
                // explicit start of yesterday so today's shifts stay out of the
                // past list (the backend defaults `start` to today otherwise).
                if (showPast) params.start = fmtDateForApi(yesterday());
                const res = await api.getMyShifts(params);
                const incoming = Array.isArray(res?.data) ? res.data : [];
                const totalCount = res?.meta?.pagination?.total ?? incoming.length;

                setTotal(totalCount);
                setPage(targetPage);
                setOpenShift(res?.open_shift || null);
                if (res?.permissions) setPermissions(res.permissions);
                setShifts((prev) => (targetPage === 1 ? incoming : [...prev, ...incoming]));
            } catch (err) {
                console.error('Roster load error', err);
                setError(err.body?.message || err.message || 'Failed to load shifts.');
            } finally {
                inFlightRef.current = false;
                setIsLoading(false);
                setIsRefreshing(false);
                setIsLoadingMore(false);
            }
        },
        [staff, siteId, showPast]
    );

    // Initial load + reset when staff/site/past-toggle changes
    useEffect(() => {
        setShifts([]);
        setPage(1);
        setTotal(0);
        fetchPage({ targetPage: 1, mode: 'initial' });
    }, [fetchPage]);

    // Re-sync every time this tab regains focus. `openShift` (which drives the
    // pinned "On shift" / Check Out card) is only ever set from a fetch, so
    // without this it lags the backend — e.g. after a kiosk-QR check-in, or an
    // in-app check-in/out done elsewhere. The stale view shows "Check In", which
    // the backend rejects with "already has an active shift" and offers no way
    // to check out. Mirrors the Dashboard's focus refresh.
    useFocusEffect(
        useCallback(() => {
            fetchPage({ targetPage: 1, mode: 'refresh' });
        }, [fetchPage])
    );

    // Dismissing either sheet is a strong signal the user may have just clocked in
    // or out at a kiosk while staying on this screen, where useFocusEffect never
    // fires. Re-sync so the Check Out card appears or clears right away.
    const sheetOpen = Boolean(checkInTarget || checkOutTarget);
    const prevSheetOpenRef = useRef(false);
    useEffect(() => {
        if (prevSheetOpenRef.current && !sheetOpen) {
            fetchPage({ targetPage: 1, mode: 'refresh' });
        }
        prevSheetOpenRef.current = sheetOpen;
    }, [sheetOpen, fetchPage]);

    const onRefresh = () => {
        setIsRefreshing(true);
        fetchPage({ targetPage: 1, mode: 'refresh' });
    };

    const loadMore = () => {
        if (isLoadingMore || isLoading || isRefreshing) return;
        if (shifts.length >= total) return;
        fetchPage({ targetPage: page + 1, mode: 'more' });
    };

    // The backend already returns the correct set for each mode (today-and-
    // forward when !showPast, yesterday-and-back when showPast). We just apply a
    // stable chronological sort and lift the active/open shift out of the body —
    // it's rendered pinned above the list instead (see ListHeaderComponent).
    const startTimeOf = (item) => {
        const d = parseWallClock(item.rostered_start || item.claimed_start);
        return d ? d.getTime() : 0;
    };

    const orderedShifts = useMemo(() => {
        const openId = openShift?.id;
        return shifts
            .filter((item) => !(openId != null && item.id === openId))
            .sort((a, b) =>
                showPast
                    ? startTimeOf(b) - startTimeOf(a)
                    : startTimeOf(a) - startTimeOf(b)
            );
    }, [shifts, showPast, openShift]);

    // Whether the active shift started before today — an old shift left open that
    // needs checking out, not a shift for today.
    const openShiftIsStale = Boolean(
        openShift && !isToday(openShift.actual_start || openShift.rostered_start)
    );

    // Pinned active-shift card. Rendered above the list in BOTH modes (mirrors the
    // dashboard). Carries the Check Out action and, when stale, a clear flag.
    const openShiftBusy = actingOnId === openShift?.id;
    // Green whether or not the shift is stale; the "Not checked out" chip
    // carries that meaning without recolouring the whole card.
    const openAccent = colors.success || colors.primary;
    // Check Out keeps its own tone: the card says "on shift" in green,
    // the button is the one thing that ends it.
    const checkOutColor = colors.warning || colors.primary;
    const openShiftHeader = openShift ? (
        <Card style={[styles.pinnedCard, { borderColor: openAccent, backgroundColor: openAccent + '18' }]}>
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
                onPress={() => openCheckOutModal(openShift)}
                disabled={openShiftBusy}
                style={[styles.btn, { backgroundColor: checkOutColor, opacity: openShiftBusy ? 0.6 : 1, marginTop: 10 }]}
            >
                {openShiftBusy ? (
                    <ActivityIndicator color={colors.onPrimary} />
                ) : (
                    <>
                        <Ionicons name="log-out-outline" size={16} color={colors.onPrimary} />
                        <Text style={[styles.btnText, { color: colors.onPrimary }]}>Check Out</Text>
                    </>
                )}
            </TouchableOpacity>
        </Card>
    ) : null;

    // Backend response shapes vary:
    //   POST /staff-roster-log         → { data: {...} }
    //   PUT  /staff-roster-log/{id}    → { message, rosterLog: { data: {...} } }
    // Replace the matched item in `shifts` with the freshly returned one,
    // so we don't drop already-loaded pages by re-fetching.
    const spliceShift = (oldItem, updated) => {
        if (!updated || typeof updated !== 'object' || !updated.id) return;
        setShifts((prev) => {
            const idx = prev.findIndex((s) => {
                if (oldItem.id && s.id === oldItem.id) return true;
                if (!oldItem.id && oldItem.staff_roster_id && s.staff_roster_id === oldItem.staff_roster_id) return true;
                return false;
            });
            if (idx === -1) return [updated, ...prev];
            const next = prev.slice();
            next[idx] = { ...prev[idx], ...updated };
            return next;
        });
    };

    const openCheckInModal = (item) => {
        // The API rejects a second check-in; surface that before opening a
        // form the user cannot submit.
        if (openShift) {
            setToast({ message: 'You are already on shift — check out first.', variant: 'error' });
            return;
        }
        setCheckInTarget(item);
    };
    const openCheckOutModal = (item) => setCheckOutTarget(item);

    // Both sheets hand back the freshly saved log. Splice it into the loaded page
    // so we keep pagination, then refetch to reconcile the pinned "On shift" card
    // (which is driven by openShift, not by the row).
    const onShiftSaved = (updated, original) => {
        spliceShift(original, updated);
        fetchPage({ targetPage: 1, mode: 'refresh' });
    };

    // Marking yourself as absent updates the StaffRoster row (the schedule),
    // not the StaffRosterLog. Backend policy requires `manage_staff_roster` —
    // admins/coordinators only. Regular teachers get 403.
    const confirmAbsenceFromModal = async () => {
        const item = selectedShift;
        if (!item?.staff_roster_id) return;
        if (!absenceReason.trim()) {
            setToast({ message: 'Please add a short reason for the absence.', variant: 'error' });
            return;
        }
        try {
            setActingOnId(item.staff_roster_id);
            await api.updateStaffRoster(item.staff_roster_id, {
                staff_roster_id: item.staff_roster_id,
                staff_id: staff.id,
                site_id: Number(siteId),
                rostered_start: item.rostered_start,
                rostered_end: item.rostered_end,
                absent: true,
                absent_notes: absenceReason.trim(),
            });
            spliceShift(item, { ...item, absent: true });
            setSelectedShift(null);
        } catch (err) {
            console.error('Mark-absent error', err);
            const msg = err.status === 403
                ? "You don't have permission to mark yourself absent. Please ask an administrator."
                : err.body?.message || err.message || 'Please try again.';
            setToast({ message: msg, variant: 'error' });
        } finally {
            setActingOnId(null);
        }
    };

    const renderItem = ({ item }) => {
        const status = shiftStatus(item);
        const statusMeta = {
            completed:   { label: 'Completed',   color: colors.textSecondary },
            in_progress: { label: 'In progress', color: colors.info || colors.primary },
            upcoming:    { label: 'Upcoming',    color: colors.primary },
        }[status];

        const dateLabel = item.rostered_start_full_date
            || (item.claimed_start ? new Date(item.claimed_start).toDateString() : '—');
        const showAction = canShowAction(item);
        const isBusy = actingOnId === (item.id || item.staff_roster_id);
        // Check In is limited to today's shift; Check Out stays available for any
        // open (started but not ended) shift regardless of day.
        const canCheckIn = showAction && !item.absent && !item.actual_start && isShiftToday(item);
        const canCheckOut = showAction && !item.absent && item.actual_start && !item.actual_end;

        return (
            <Card
                onPress={() => setSelectedShift(item)}
                activeOpacity={0.8}
            >
                <CardHeader>
                    <Text style={[styles.cardDate, { color: colors.textPrimary }]}>{dateLabel}</Text>
                    <View style={[styles.statusPill, { borderColor: statusMeta.color, backgroundColor: statusMeta.color + '22' }]}>
                        <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                </CardHeader>

                <View style={[cardBodyPadding, styles.cardBody]}>
                    {/* Rostered times */}
                    <View style={styles.timeRow}>
                        <Ionicons name="calendar-outline" size={14} color={iconColor('calendar-outline', colors)} />
                        <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Rostered</Text>
                        <Text style={[styles.timeValue, { color: colors.textPrimary }]}>
                            {item.rostered_start_time && item.rostered_end_time
                                ? `${item.rostered_start_time} – ${item.rostered_end_time}`
                                : '—'}
                        </Text>
                    </View>

                    {/* Claimed times */}
                    {(item.claimed_start_time || item.claimed_end_time) ? (
                        <View style={styles.timeRow}>
                            <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSecondary} />
                            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Claimed</Text>
                            <Text style={[styles.timeValue, { color: colors.textPrimary }]}>
                                {item.claimed_start_time || '—'}
                                {' – '}
                                {item.claimed_end_time || (item.claimed_start_time ? 'in progress' : '—')}
                            </Text>
                        </View>
                    ) : null}

                    {item.site_name ? (
                        <View style={styles.timeRow}>
                            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Site</Text>
                            <Text style={[styles.timeValue, { color: colors.textPrimary }]} numberOfLines={1}>
                                {item.site_name}
                            </Text>
                        </View>
                    ) : null}

                    {item.absent ? (
                        <View style={[styles.absentRow, { borderColor: colors.error || colors.warning }]}>
                            <Ionicons name="close-circle-outline" size={14} color={colors.error || colors.warning} />
                            <Text style={[styles.absentText, { color: colors.error || colors.warning }]}>
                                Marked absent
                            </Text>
                        </View>
                    ) : null}

                    {/* Actions */}
                    {canCheckIn || canCheckOut ? (
                        <View style={styles.actions}>
                            {canCheckIn ? (
                                <TouchableOpacity
                                    onPress={() => openCheckInModal(item)}
                                    disabled={isBusy}
                                    style={[styles.btn, { backgroundColor: colors.primary, opacity: isBusy ? 0.6 : 1 }]}
                                >
                                    {isBusy && actingOnId === (item.id || item.staff_roster_id) ? (
                                        <ActivityIndicator color={colors.onPrimary} />
                                    ) : (
                                        <>
                                            <Ionicons name="log-in-outline" size={16} color={colors.onPrimary} />
                                            <Text style={[styles.btnText, { color: colors.onPrimary }]}>Check In</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            ) : canCheckOut ? (
                                <TouchableOpacity
                                    onPress={() => openCheckOutModal(item)}
                                    disabled={isBusy}
                                    style={[styles.btn, { backgroundColor: checkOutColor, opacity: isBusy ? 0.6 : 1 }]}
                                >
                                    {isBusy ? (
                                        <ActivityIndicator color={colors.onPrimary} />
                                    ) : (
                                        <>
                                            <Ionicons name="log-out-outline" size={16} color={colors.onPrimary} />
                                            <Text style={[styles.btnText, { color: colors.onPrimary }]}>Check Out</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </Card>
        );
    };

    if (profileLoaded && (!staff?.id || !siteId)) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Ionicons name="business-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No site is assigned to your account yet. Contact your administrator.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.toolbar}>
                <View style={styles.switchRow}>
                    <Switch
                        value={showPast}
                        onValueChange={setShowPast}
                        trackColor={{ false: colors.divider, true: colors.primary }}
                        thumbColor={colors.onPrimary}
                    />
                    <Text style={[styles.switchLabel, { color: colors.textPrimary }]}>Show past shifts</Text>
                </View>
            </View>

            {isLoading && shifts.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && shifts.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity
                        onPress={() => fetchPage({ targetPage: 1, mode: 'initial' })}
                        style={[styles.retry, { borderColor: colors.primary }]}
                    >
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={orderedShifts}
                    keyExtractor={(item, i) => String(item.id || `r${item.staff_roster_id}-${i}`)}
                    renderItem={renderItem}
                    ListHeaderComponent={openShiftHeader}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                        />
                    }
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={
                        shifts.length === 0 ? null : isLoadingMore ? (
                            <View style={styles.footer}>
                                <ActivityIndicator color={colors.primary} />
                            </View>
                        ) : shifts.length < total ? (
                            <TouchableOpacity
                                onPress={loadMore}
                                style={[styles.loadMoreBtn, { borderColor: colors.primary }]}
                            >
                                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                                    Load more ({shifts.length} of {total})
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={[styles.endText, { color: colors.textSecondary }]}>
                                {total > 0 ? `All ${total} shifts loaded` : ''}
                            </Text>
                        )
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="calendar-outline" size={32} color={colors.textDisabled} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                {showPast ? 'No past shifts.' : 'No upcoming shifts.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Detail modal */}
            <Modal
                visible={Boolean(selectedShift)}
                transparent
                animationType="fade"
                onRequestClose={() => setSelectedShift(null)}
            >
                <TouchableOpacity
                    style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
                    activeOpacity={1}
                    onPress={() => setSelectedShift(null)}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <Card style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Shift details</Text>
                                <TouchableOpacity onPress={() => setSelectedShift(null)} style={styles.iconButton}>
                                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={{ maxHeight: 480 }}>
                                {selectedShift && (
                                    <View style={{ gap: 10 }}>
                                        <DetailRow label="Date" value={selectedShift.rostered_start_full_date || '—'} colors={colors} />
                                        <DetailRow label="Site" value={selectedShift.site_name || '—'} colors={colors} />
                                        <DetailRow
                                            label="Rostered"
                                            value={
                                                selectedShift.rostered_start_time && selectedShift.rostered_end_time
                                                    ? `${selectedShift.rostered_start_time} – ${selectedShift.rostered_end_time}`
                                                    : '—'
                                            }
                                            colors={colors}
                                        />
                                        {selectedShift.staff_roster_id && permissions.kiosk_checkinout !== false ? (
                                            <TouchableOpacity
                                                onPress={() => detailQr.open(selectedShift)}
                                                style={[styles.btn, { backgroundColor: colors.primary }]}
                                            >
                                                <Ionicons name="qr-code-outline" size={16} color={colors.onPrimary} />
                                                <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                                                    {shiftStatus(selectedShift) === 'in_progress' ? 'Clock-out QR' : 'Clock-in QR'}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {selectedShift.checkin_comments ? (
                                            <DetailRow label="Check-in note" value={selectedShift.checkin_comments} colors={colors} />
                                        ) : null}
                                        {selectedShift.check_in_photo ? (
                                            <View style={{ gap: 4 }}>
                                                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-in photo</Text>
                                                <Image
                                                    source={{ uri: selectedShift.check_in_photo }}
                                                    style={styles.photoPreview}
                                                    resizeMode="cover"
                                                />
                                            </View>
                                        ) : null}
                                        {selectedShift.checkout_comments ? (
                                            <DetailRow label="Check-out note" value={selectedShift.checkout_comments} colors={colors} />
                                        ) : null}
                                        {selectedShift.check_out_photo ? (
                                            <View style={{ gap: 4 }}>
                                                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-out photo</Text>
                                                <Image
                                                    source={{ uri: selectedShift.check_out_photo }}
                                                    style={styles.photoPreview}
                                                    resizeMode="cover"
                                                />
                                            </View>
                                        ) : null}

                                        {/* Mark Absence — only meaningful for not-yet-started rostered shifts */}
                                        {selectedShift.staff_roster_id && !selectedShift.actual_start && !selectedShift.absent ? (
                                            <View style={{ marginTop: 10, gap: 8 }}>
                                                <View style={styles.absenceSwitchRow}>
                                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Mark Absence</Text>
                                                    <Switch
                                                        value={markAbsence}
                                                        onValueChange={setMarkAbsence}
                                                        trackColor={{ false: colors.divider, true: colors.error || colors.warning }}
                                                        thumbColor={colors.onPrimary}
                                                    />
                                                </View>
                                                {markAbsence ? (
                                                    <>
                                                        <TextInput
                                                            value={absenceReason}
                                                            onChangeText={setAbsenceReason}
                                                            placeholder="Reason for absence"
                                                            placeholderTextColor={colors.textSecondary}
                                                            multiline
                                                            numberOfLines={3}
                                                            style={[styles.absenceInput, {
                                                                borderColor: colors.border,
                                                                color: colors.textPrimary,
                                                                backgroundColor: colors.background,
                                                            }]}
                                                            textAlignVertical="top"
                                                        />
                                                        <TouchableOpacity
                                                            onPress={confirmAbsenceFromModal}
                                                            disabled={!absenceReason.trim() || actingOnId === selectedShift.staff_roster_id}
                                                            style={[styles.btn, {
                                                                backgroundColor: colors.error || colors.warning,
                                                                opacity: (!absenceReason.trim() || actingOnId === selectedShift.staff_roster_id) ? 0.6 : 1,
                                                            }]}
                                                        >
                                                            {actingOnId === selectedShift.staff_roster_id ? (
                                                                <ActivityIndicator color={colors.onPrimary} />
                                                            ) : (
                                                                <Text style={[styles.btnText, { color: colors.onPrimary }]}>Submit Absence</Text>
                                                            )}
                                                        </TouchableOpacity>
                                                    </>
                                                ) : null}
                                            </View>
                                        ) : null}
                                    </View>
                                )}
                            </ScrollView>
                        </Card>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <CheckInModal
                shift={checkInTarget}
                staff={staff}
                siteId={siteId}
                permissions={permissions}
                onClose={() => setCheckInTarget(null)}
                onSuccess={(updated, original) => {
                    onShiftSaved(updated, original);
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
                onSuccess={(updated, original) => {
                    // Drop the pinned card at once, then let the refetch reconcile.
                    setOpenShift(null);
                    onShiftSaved(updated, original);
                    setToast({ message: 'Checked out', variant: 'success' });
                }}
                onError={(message) => setToast({ message, variant: 'error' })}
            />

            <ShiftQrModal
                visible={detailQr.visible}
                onClose={detailQr.close}
                token={detailQr.token}
                loading={detailQr.loading}
                error={detailQr.error}
                direction={shiftStatus(selectedShift || {}) === 'in_progress' ? 'out' : 'in'}
            />

            <Toast toast={toast} onHide={() => setToast(null)} />
        </View>
    );
}

function DetailRow({ label, value, colors }) {
    return (
        <View style={{ gap: 2 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    toolbar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    switchLabel: { fontSize: 13 },
    list: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 24, gap: cardGap },
    cardBody: { gap: 8 },
    cardDate: { flex: 1, fontSize: 15, fontWeight: '600' },
    statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeLabel: { fontSize: 12, width: 64 },
    timeValue: { flex: 1, fontSize: 13, fontWeight: '500' },
    actions: { marginTop: 8, flexDirection: 'row', gap: 10 },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        flex: 1,
    },
    btnText: { fontWeight: '700' },
    btnOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        flex: 1,
    },
    btnOutlineText: { fontWeight: '700' },
    absentRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    absentText: { fontSize: 12, fontWeight: '600' },

    // Pinned active-shift card (rendered above the list)
    pinnedCard: {
        padding: 14,
        marginBottom: 10,
        gap: 4,
    },
    pinnedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pinnedLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    pinnedSub: { fontSize: 12 },
    runningDot: { width: 10, height: 10, borderRadius: 5 },
    runningTimer: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
    staleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    staleText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    footer: { paddingVertical: 16, alignItems: 'center' },
    loadMoreBtn: {
        alignSelf: 'center',
        marginVertical: 12,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    endText: { textAlign: 'center', paddingVertical: 16, fontSize: 12 },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    modalCard: {
        padding: 18,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    iconButton: { padding: 4 },
    absenceSwitchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    absenceInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minHeight: 72,
        fontSize: 14,
    },
    detailLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    halfButton: { flex: 1, justifyContent: 'center' },
    qrBox: {
        alignItems: 'center',
        borderRadius: 12,
        padding: 16,
    },
    qrHint: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
    photoPreview: {
        width: '100%',
        height: 180,
        borderRadius: 8,
    },
});
