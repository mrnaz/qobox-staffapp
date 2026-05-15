import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    Switch,
    Alert,
    Modal,
    ScrollView,
    TextInput,
    Image,
    Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { capturePhotoCompressed, appendPhotoToForm } from '../utils/photo';

// Match the Vue staff portal's check-in time format: 'YYYY-MM-DD HH:mm' in the
// SITE's local timezone. The Vue web works because users browse from the same
// timezone as the site; on mobile we can't assume that, so we use Intl to
// format `now` in the provided timezone (which we get from the shift item).
//
// Falls back to device-local time if no timezone is supplied.
const nowForApi = (timezone, when) => {
    const now = when instanceof Date ? when : new Date();
    if (!timezone) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
            hour12: false,
        }).formatToParts(now);
        const get = (t) => parts.find((p) => p.type === t)?.value || '00';
        // Note: 'en-CA' returns 24-hour times even in 'hour12: false' mode and
        // formats date as YYYY-MM-DD natively — handy.
        return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
    } catch {
        // Bad timezone string — fall back to device-local
        return nowForApi(undefined);
    }
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
    const ref = item.rostered_start || item.claimed_start;
    if (!ref) return true;
    const refTime = new Date(ref).getTime();
    return refTime >= eightDaysAgo && refTime <= endOfToday;
};

const shiftStatus = (item) => {
    if (item.actual_start && item.actual_end) return 'completed';
    if (item.actual_start && !item.actual_end) return 'in_progress';
    return 'upcoming';
};

export default function RosterScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const PAGE_SIZE = 10;

    const [staff, setStaff] = useState(null);
    const [siteId, setSiteId] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [shifts, setShifts] = useState([]);
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
    // Check-in modal state
    const [checkInTarget, setCheckInTarget] = useState(null);
    const [checkInTime, setCheckInTime] = useState(new Date());
    const [checkInNote, setCheckInNote] = useState('');
    const [checkInPhoto, setCheckInPhoto] = useState(null);
    const [showCheckInTimePicker, setShowCheckInTimePicker] = useState(false);
    const [checkInSubmitting, setCheckInSubmitting] = useState(false);

    // Check-out modal state (mirrors check-in)
    const [checkOutTarget, setCheckOutTarget] = useState(null);
    const [checkOutTime, setCheckOutTime] = useState(new Date());
    const [checkOutNote, setCheckOutNote] = useState('');
    const [checkOutPhoto, setCheckOutPhoto] = useState(null);
    const [showCheckOutTimePicker, setShowCheckOutTimePicker] = useState(false);
    const [checkOutSubmitting, setCheckOutSubmitting] = useState(false);
    const inFlightRef = useRef(false);

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
                const res = await api.getMyShifts({
                    staff_id: staff.id,
                    site_id: siteId,
                    show_past_shifts: showPast ? 'true' : 'false',
                    page: targetPage,
                    limit: PAGE_SIZE,
                });
                const incoming = Array.isArray(res?.data) ? res.data : [];
                const totalCount = res?.meta?.pagination?.total ?? incoming.length;

                setTotal(totalCount);
                setPage(targetPage);
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

    const onRefresh = () => {
        setIsRefreshing(true);
        fetchPage({ targetPage: 1, mode: 'refresh' });
    };

    const loadMore = () => {
        if (isLoadingMore || isLoading || isRefreshing) return;
        if (shifts.length >= total) return;
        fetchPage({ targetPage: page + 1, mode: 'more' });
    };


    // Backend response shapes vary:
    //   POST /staff-roster-log         → { data: {...} }
    //   PUT  /staff-roster-log/{id}    → { message, rosterLog: { data: {...} } }
    const unwrapShift = (res) =>
        res?.rosterLog?.data || res?.rosterLog || res?.data || res;

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
        setCheckInTarget(item);
        setCheckInTime(new Date());
        setCheckInNote('');
        setCheckInPhoto(null);
    };

    const closeCheckInModal = () => {
        setCheckInTarget(null);
        setShowCheckInTimePicker(false);
        setCheckInNote('');
        setCheckInPhoto(null);
        setCheckInTime(new Date());
    };

    const submitCheckIn = async () => {
        const item = checkInTarget;
        if (!item) return;
        try {
            setCheckInSubmitting(true);
            setActingOnId(item.id || item.staff_roster_id);
            const checkInStr = nowForApi(item.timezone, checkInTime);
            const payload = {
                staff_id: staff.id,
                site_id: Number(siteId),
                staff_roster_id: item.staff_roster_id || null,
                claimed_start: item.claimed_start || checkInStr,
                claimed_end: item.claimed_end || null,
                actual_start: checkInStr,
            };
            if (checkInNote.trim()) payload.checkin_comments = checkInNote.trim();

            let res;
            if (checkInPhoto) {
                const form = new FormData();
                Object.entries(payload).forEach(([k, v]) => {
                    if (v !== null && v !== undefined) form.append(k, String(v));
                });
                await appendPhotoToForm(form, 'check_in_photo', checkInPhoto, 'check_in_photo.jpg');
                if (item.id) {
                    form.append('_method', 'PUT');
                    form.append('id', String(item.id));
                    res = await api.requestForm(`staff-roster-log/${item.id}`, 'POST', form);
                } else {
                    res = await api.requestForm('staff-roster-log', 'POST', form);
                }
            } else if (item.id) {
                res = await api.updateShiftLog(item.id, { ...payload, id: item.id });
            } else {
                res = await api.createShiftLog(payload);
            }

            spliceShift(item, unwrapShift(res));
            closeCheckInModal();
        } catch (err) {
            console.error('Check-in error', err);
            const isActiveShiftError =
                err.status === 422 &&
                /already has an active shift/i.test(err.body?.message || '');
            Alert.alert(
                'Check-in failed',
                isActiveShiftError
                    ? 'You already have an open shift. Toggle "Show past shifts" to find it and check out first.'
                    : (err.body?.message || err.message || 'Please try again.')
            );
        } finally {
            setActingOnId(null);
            setCheckInSubmitting(false);
        }
    };

    const handleAttachCheckInPhoto = async () => {
        try {
            const photo = await capturePhotoCompressed();
            if (photo) setCheckInPhoto(photo);
        } catch (err) {
            console.error('Photo capture error', err);
            Alert.alert('Camera error', err.message || 'Could not capture photo.');
        }
    };

    const openCheckOutModal = (item) => {
        setCheckOutTarget(item);
        setCheckOutTime(new Date());
        setCheckOutNote('');
        setCheckOutPhoto(null);
    };

    const closeCheckOutModal = () => {
        setCheckOutTarget(null);
        setShowCheckOutTimePicker(false);
        setCheckOutNote('');
        setCheckOutPhoto(null);
        setCheckOutTime(new Date());
    };

    const submitCheckOut = async () => {
        const item = checkOutTarget;
        if (!item) return;
        try {
            setCheckOutSubmitting(true);
            setActingOnId(item.id);
            const checkOutStr = nowForApi(item.timezone, checkOutTime);
            const payload = {
                id: item.id,
                staff_id: staff.id,
                site_id: Number(siteId),
                staff_roster_id: item.staff_roster_id || null,
                claimed_start: item.claimed_start,
                claimed_end: checkOutStr,
                actual_start: item.actual_start,
                actual_end: checkOutStr,
            };
            if (checkOutNote.trim()) payload.checkout_comments = checkOutNote.trim();

            let res;
            if (checkOutPhoto) {
                const form = new FormData();
                Object.entries(payload).forEach(([k, v]) => {
                    if (v !== null && v !== undefined) form.append(k, String(v));
                });
                await appendPhotoToForm(form, 'check_out_photo', checkOutPhoto, 'check_out_photo.jpg');
                form.append('_method', 'PUT');
                res = await api.requestForm(`staff-roster-log/${item.id}`, 'POST', form);
            } else {
                res = await api.updateShiftLog(item.id, payload);
            }

            spliceShift(item, unwrapShift(res));
            closeCheckOutModal();
        } catch (err) {
            console.error('Check-out error', err);
            Alert.alert('Check-out failed', err.body?.message || err.message || 'Please try again.');
        } finally {
            setActingOnId(null);
            setCheckOutSubmitting(false);
        }
    };

    const handleAttachCheckOutPhoto = async () => {
        try {
            const photo = await capturePhotoCompressed();
            if (photo) setCheckOutPhoto(photo);
        } catch (err) {
            console.error('Photo capture error', err);
            Alert.alert('Camera error', err.message || 'Could not capture photo.');
        }
    };

    // Marking yourself as absent updates the StaffRoster row (the schedule),
    // not the StaffRosterLog. Backend policy requires `manage_staff_roster` —
    // admins/coordinators only. Regular teachers get 403.
    const confirmAbsenceFromModal = async () => {
        const item = selectedShift;
        if (!item?.staff_roster_id) return;
        if (!absenceReason.trim()) {
            Alert.alert('Reason required', 'Please add a short reason for the absence.');
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
            Alert.alert('Mark absent failed', msg);
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

        return (
            <TouchableOpacity
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                onPress={() => setSelectedShift(item)}
                activeOpacity={0.8}
            >
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardDate, { color: colors.textPrimary }]}>{dateLabel}</Text>
                    <View style={[styles.statusPill, { borderColor: statusMeta.color, backgroundColor: statusMeta.color + '22' }]}>
                        <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                </View>

                {/* Rostered times */}
                <View style={styles.timeRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
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
                {showAction && !item.absent ? (
                    <View style={styles.actions}>
                        {!item.actual_start ? (
                            <TouchableOpacity
                                onPress={() => openCheckInModal(item)}
                                disabled={isBusy}
                                style={[styles.btn, { backgroundColor: colors.primary, opacity: isBusy ? 0.6 : 1 }]}
                            >
                                {isBusy && actingOnId === (item.id || item.staff_roster_id) ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="log-in-outline" size={16} color="#fff" />
                                        <Text style={styles.btnText}>Check In</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        ) : !item.actual_end ? (
                            <TouchableOpacity
                                onPress={() => openCheckOutModal(item)}
                                disabled={isBusy}
                                style={[styles.btn, { backgroundColor: colors.warning || colors.primary, opacity: isBusy ? 0.6 : 1 }]}
                            >
                                {isBusy ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="log-out-outline" size={16} color="#fff" />
                                        <Text style={styles.btnText}>Check Out</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : null}
            </TouchableOpacity>
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
                        thumbColor="#fff"
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
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
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
                    data={shifts}
                    keyExtractor={(item, i) => String(item.id || `r${item.staff_roster_id}-${i}`)}
                    renderItem={renderItem}
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
                            <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} />
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
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setSelectedShift(null)}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
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
                                                        thumbColor="#fff"
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
                                                                <ActivityIndicator color="#fff" />
                                                            ) : (
                                                                <Text style={styles.btnText}>Submit Absence</Text>
                                                            )}
                                                        </TouchableOpacity>
                                                    </>
                                                ) : null}
                                            </View>
                                        ) : null}
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Check-in modal */}
            <Modal
                visible={Boolean(checkInTarget)}
                transparent
                animationType="fade"
                onRequestClose={closeCheckInModal}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={closeCheckInModal}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Check in</Text>
                                <TouchableOpacity onPress={closeCheckInModal} style={styles.iconButton}>
                                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-in time</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowCheckInTimePicker(true)}
                                        style={[styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                    >
                                        <Ionicons name="time-outline" size={16} color={colors.textPrimary} />
                                        <Text style={{ color: colors.textPrimary, flex: 1 }}>
                                            {checkInTime.toLocaleString(undefined, {
                                                year: 'numeric', month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                    {showCheckInTimePicker ? (
                                        <DateTimePicker
                                            value={checkInTime}
                                            mode="datetime"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                            onChange={(event, date) => {
                                                if (Platform.OS !== 'ios') setShowCheckInTimePicker(false);
                                                if (date) setCheckInTime(date);
                                            }}
                                        />
                                    ) : null}
                                </View>

                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-in note (optional)</Text>
                                    <TextInput
                                        value={checkInNote}
                                        onChangeText={setCheckInNote}
                                        placeholder="Anything to flag for your manager?"
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
                                </View>

                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Photo (optional)</Text>
                                    {checkInPhoto ? (
                                        <View style={{ gap: 8 }}>
                                            <Image
                                                source={{ uri: checkInPhoto.uri }}
                                                style={styles.photoPreview}
                                                resizeMode="cover"
                                            />
                                            <TouchableOpacity
                                                onPress={() => setCheckInPhoto(null)}
                                                style={[styles.btnOutline, { borderColor: colors.error || colors.warning }]}
                                            >
                                                <Ionicons name="trash-outline" size={16} color={colors.error || colors.warning} />
                                                <Text style={[styles.btnOutlineText, { color: colors.error || colors.warning }]}>
                                                    Remove photo
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            onPress={handleAttachCheckInPhoto}
                                            style={[styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                        >
                                            <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                                            <Text style={{ color: colors.textPrimary, flex: 1 }}>Take a photo</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <TouchableOpacity
                                    onPress={submitCheckIn}
                                    disabled={checkInSubmitting}
                                    style={[styles.btn, { backgroundColor: colors.primary, opacity: checkInSubmitting ? 0.6 : 1, marginTop: 4 }]}
                                >
                                    {checkInSubmitting ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="log-in-outline" size={16} color="#fff" />
                                            <Text style={styles.btnText}>Check In</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Check-out modal */}
            <Modal
                visible={Boolean(checkOutTarget)}
                transparent
                animationType="fade"
                onRequestClose={closeCheckOutModal}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={closeCheckOutModal}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Check out</Text>
                                <TouchableOpacity onPress={closeCheckOutModal} style={styles.iconButton}>
                                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-out time</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowCheckOutTimePicker(true)}
                                        style={[styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                    >
                                        <Ionicons name="time-outline" size={16} color={colors.textPrimary} />
                                        <Text style={{ color: colors.textPrimary, flex: 1 }}>
                                            {checkOutTime.toLocaleString(undefined, {
                                                year: 'numeric', month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </Text>
                                        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                    {showCheckOutTimePicker ? (
                                        <DateTimePicker
                                            value={checkOutTime}
                                            mode="datetime"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                            onChange={(event, date) => {
                                                if (Platform.OS !== 'ios') setShowCheckOutTimePicker(false);
                                                if (date) setCheckOutTime(date);
                                            }}
                                        />
                                    ) : null}
                                </View>

                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-out note (optional)</Text>
                                    <TextInput
                                        value={checkOutNote}
                                        onChangeText={setCheckOutNote}
                                        placeholder="Anything to flag for your manager?"
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
                                </View>

                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Photo (optional)</Text>
                                    {checkOutPhoto ? (
                                        <View style={{ gap: 8 }}>
                                            <Image
                                                source={{ uri: checkOutPhoto.uri }}
                                                style={styles.photoPreview}
                                                resizeMode="cover"
                                            />
                                            <TouchableOpacity
                                                onPress={() => setCheckOutPhoto(null)}
                                                style={[styles.btnOutline, { borderColor: colors.error || colors.warning }]}
                                            >
                                                <Ionicons name="trash-outline" size={16} color={colors.error || colors.warning} />
                                                <Text style={[styles.btnOutlineText, { color: colors.error || colors.warning }]}>
                                                    Remove photo
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            onPress={handleAttachCheckOutPhoto}
                                            style={[styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                        >
                                            <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                                            <Text style={{ color: colors.textPrimary, flex: 1 }}>Take a photo</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <TouchableOpacity
                                    onPress={submitCheckOut}
                                    disabled={checkOutSubmitting}
                                    style={[styles.btn, {
                                        backgroundColor: colors.warning || colors.primary,
                                        opacity: checkOutSubmitting ? 0.6 : 1,
                                        marginTop: 4,
                                    }]}
                                >
                                    {checkOutSubmitting ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="log-out-outline" size={16} color="#fff" />
                                            <Text style={styles.btnText}>Check Out</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
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
    list: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 24, gap: 10 },
    card: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        gap: 8,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
    },
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
    btnText: { color: '#fff', fontWeight: '700' },
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
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    modalCard: {
        borderWidth: 1,
        borderRadius: 16,
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
    photoPreview: {
        width: '100%',
        height: 180,
        borderRadius: 8,
    },
});
