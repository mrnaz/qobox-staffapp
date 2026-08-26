import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Image,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ShiftTimePicker from './ShiftTimePicker';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import { capturePhotoCompressed, appendPhotoToForm } from '../../utils/photo';
import { nowForApi } from '../../utils/datetime';
import { iconColor } from '../../utils/iconColors';
import ShiftQrModal from './ShiftQrModal';
import useShiftQr, { canShowShiftQr } from './useShiftQr';
import styles from './styles';

export const unwrapShift = (res) =>
    res?.rosterLog?.data || res?.rosterLog || res?.data || res;

/**
 * Check-in sheet, shared by the Dashboard and the Roster screen.
 *
 * `permissions` comes from the roster-log query's top-level block and decides
 * what the sheet is even for: with app check-in switched off the in-app form is
 * pointless, so the sheet collapses to just the kiosk QR.
 */
export default function CheckInModal({
    shift,
    staff,
    siteId,
    permissions = { app_checkinout: true, kiosk_checkinout: true },
    onClose,
    onSuccess,
    onError,
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [time, setTime] = useState(new Date());
    const [note, setNote] = useState('');
    const [photo, setPhoto] = useState(null);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const qr = useShiftQr();

    const allowApp = permissions?.app_checkinout !== false;
    const allowKiosk = permissions?.kiosk_checkinout !== false;
    const qrAvailable = allowKiosk && canShowShiftQr(shift);

    // Reset every field whenever a different shift is opened, so yesterday's
    // half-typed note never leaks into today's check-in.
    useEffect(() => {
        if (shift) {
            setTime(new Date());
            setNote('');
            setPhoto(null);
            setShowTimePicker(false);
        }
    }, [shift?.id, shift?.staff_roster_id]);

    const attachPhoto = async () => {
        try {
            const captured = await capturePhotoCompressed();
            if (captured) setPhoto(captured);
        } catch (err) {
            console.error('Photo capture error', err);
            onError?.(err.message || 'Could not capture photo.');
        }
    };

    const submit = async () => {
        if (! shift) return;

        try {
            setSubmitting(true);
            const checkInStr = nowForApi(shift.timezone, time);
            const payload = {
                staff_id: staff.id,
                site_id: Number(siteId),
                staff_roster_id: shift.staff_roster_id || null,
                claimed_start: shift.claimed_start || checkInStr,
                claimed_end: shift.claimed_end || null,
                actual_start: checkInStr,
            };
            if (note.trim()) payload.checkin_comments = note.trim();

            let res;
            if (photo) {
                const form = new FormData();
                Object.entries(payload).forEach(([k, v]) => {
                    if (v !== null && v !== undefined) form.append(k, String(v));
                });
                await appendPhotoToForm(form, 'check_in_photo', photo, 'check_in_photo.jpg');
                if (shift.id) {
                    form.append('_method', 'PUT');
                    form.append('id', String(shift.id));
                    res = await api.requestForm(`staff-roster-log/${shift.id}`, 'POST', form);
                } else {
                    res = await api.requestForm('staff-roster-log', 'POST', form);
                }
            } else if (shift.id) {
                res = await api.updateShiftLog(shift.id, { ...payload, id: shift.id });
            } else {
                res = await api.createShiftLog(payload);
            }

            onSuccess?.(unwrapShift(res), shift);
            onClose?.();
        } catch (err) {
            console.error('Check-in error', err);
            const alreadyOpen = err.status === 422
                && /already has an active shift/i.test(err.body?.message || '');
            const disabledByOrg = err.status === 403;

            onError?.(
                alreadyOpen
                    ? 'You already have an open shift — use “Check Out” on the card above.'
                    : disabledByOrg
                        ? (err.body?.message || 'Check in from the app is disabled for your organisation.')
                        : (err.body?.message || err.message || 'Check-in failed. Please try again.')
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Modal
                visible={Boolean(shift)}
                transparent
                animationType="fade"
                onRequestClose={onClose}
            >
                <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={onClose}>
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Check in</Text>
                                <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
                                {allowApp ? (
                                    <>
                                        <View style={{ gap: 6 }}>
                                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-in time</Text>
                                            <TouchableOpacity
                                                onPress={() => setShowTimePicker(true)}
                                                style={[styles.pickerButton, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.background }]}
                                            >
                                                <Ionicons name="time-outline" size={16} color={iconColor('time-outline', colors)} />
                                                <Text style={{ color: colors.textPrimary, flex: 1 }}>
                                                    {time.toLocaleString(undefined, {
                                                        year: 'numeric', month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </Text>
                                                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                                            </TouchableOpacity>
                                            <ShiftTimePicker
                                                visible={showTimePicker}
                                                value={time}
                                                onChange={setTime}
                                                onClose={() => setShowTimePicker(false)}
                                            />
                                        </View>

                                        <View style={{ gap: 6 }}>
                                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-in note (optional)</Text>
                                            <TextInput
                                                value={note}
                                                onChangeText={setNote}
                                                placeholderTextColor={colors.textSecondary}
                                                multiline
                                                numberOfLines={3}
                                                style={[styles.noteInput, {
                                                    borderColor: colors.borderStrong || colors.border,
                                                    color: colors.textPrimary,
                                                    backgroundColor: colors.background,
                                                }]}
                                                textAlignVertical="top"
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <Text style={[styles.message, { color: colors.textSecondary }]}>
                                        Checking in from the app is switched off for your organisation.
                                        {qrAvailable ? ' Show the QR code at a kiosk instead.' : ''}
                                    </Text>
                                )}

                                <View style={{ gap: 8 }}>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {allowApp ? (
                                            <TouchableOpacity
                                                onPress={attachPhoto}
                                                style={[styles.pickerButton, styles.halfButton, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.background }]}
                                            >
                                                <Ionicons name="camera-outline" size={18} color={iconColor('camera-outline', colors)} />
                                                <Text style={{ color: colors.textPrimary }} numberOfLines={1}>
                                                    {photo ? 'Retake' : 'Take a photo'}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {qrAvailable ? (
                                            <TouchableOpacity
                                                onPress={() => qr.open(shift)}
                                                style={[styles.pickerButton, styles.halfButton, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.background }]}
                                            >
                                                <Ionicons name="qr-code-outline" size={18} color={iconColor('qr-code-outline', colors)} />
                                                <Text style={{ color: colors.textPrimary }} numberOfLines={1}>Check In QR</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>

                                    {photo ? (
                                        <View style={{ gap: 8 }}>
                                            <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
                                            <TouchableOpacity
                                                onPress={() => setPhoto(null)}
                                                style={[styles.btnOutline, { borderColor: colors.error || colors.warning }]}
                                            >
                                                <Ionicons name="trash-outline" size={16} color={colors.error || colors.warning} />
                                                <Text style={[styles.btnOutlineText, { color: colors.error || colors.warning }]}>
                                                    Remove photo
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : null}
                                </View>

                                {allowApp ? (
                                    <TouchableOpacity
                                        onPress={submit}
                                        disabled={submitting}
                                        style={[styles.btn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1, marginTop: 4 }]}
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color={colors.onPrimary} />
                                        ) : (
                                            <>
                                                <Ionicons name="log-in-outline" size={16} color={colors.onPrimary} />
                                                <Text style={[styles.btnText, { color: colors.onPrimary }]}>Check In</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                ) : null}
                            </ScrollView>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <ShiftQrModal
                visible={qr.visible}
                onClose={qr.close}
                token={qr.token}
                loading={qr.loading}
                error={qr.error}
                direction="in"
            />
        </>
    );
}
