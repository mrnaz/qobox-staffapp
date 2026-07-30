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
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import { capturePhotoCompressed, appendPhotoToForm } from '../../utils/photo';
import { nowForApi } from '../../utils/datetime';
import ShiftQrModal from './ShiftQrModal';
import useShiftQr, { canShowShiftQr } from './useShiftQr';
import { unwrapShift } from './CheckInModal';
import styles from './styles';

/**
 * Check-out sheet, shared by the Dashboard and the Roster screen.
 *
 * Carries a kiosk QR just as the check-in sheet does. The token is the same one
 * either way — the kiosk reads the shift's state and clocks out an open shift,
 * so there is no separate check-out code.
 */
export default function CheckOutModal({
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

    useEffect(() => {
        if (shift) {
            setTime(new Date());
            setNote('');
            setPhoto(null);
            setShowTimePicker(false);
        }
    }, [shift?.id]);

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
            const checkOutStr = nowForApi(shift.timezone, time);
            const payload = {
                id: shift.id,
                staff_id: staff.id,
                site_id: Number(siteId),
                staff_roster_id: shift.staff_roster_id || null,
                claimed_start: shift.claimed_start,
                claimed_end: checkOutStr,
                actual_start: shift.actual_start,
                actual_end: checkOutStr,
            };
            if (note.trim()) payload.checkout_comments = note.trim();

            let res;
            if (photo) {
                const form = new FormData();
                Object.entries(payload).forEach(([k, v]) => {
                    if (v !== null && v !== undefined) form.append(k, String(v));
                });
                await appendPhotoToForm(form, 'check_out_photo', photo, 'check_out_photo.jpg');
                form.append('_method', 'PUT');
                res = await api.requestForm(`staff-roster-log/${shift.id}`, 'POST', form);
            } else {
                res = await api.updateShiftLog(shift.id, payload);
            }

            onSuccess?.(unwrapShift(res), shift);
            onClose?.();
        } catch (err) {
            console.error('Check-out error', err);
            onError?.(
                err.status === 403
                    ? (err.body?.message || 'Check out from the app is disabled for your organisation.')
                    : (err.body?.message || err.message || 'Check-out failed. Please try again.')
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
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Check out</Text>
                                <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
                                {allowApp ? (
                                    <>
                                        <View style={{ gap: 6 }}>
                                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-out time</Text>
                                            <TouchableOpacity
                                                onPress={() => setShowTimePicker(true)}
                                                style={[styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                            >
                                                <Ionicons name="time-outline" size={16} color={colors.textPrimary} />
                                                <Text style={{ color: colors.textPrimary, flex: 1 }}>
                                                    {time.toLocaleString(undefined, {
                                                        year: 'numeric', month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </Text>
                                                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                                            </TouchableOpacity>
                                            {showTimePicker ? (
                                                <DateTimePicker
                                                    value={time}
                                                    mode="datetime"
                                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                    onChange={(event, date) => {
                                                        if (Platform.OS !== 'ios') setShowTimePicker(false);
                                                        if (date) setTime(date);
                                                    }}
                                                />
                                            ) : null}
                                        </View>

                                        <View style={{ gap: 6 }}>
                                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Check-out note (optional)</Text>
                                            <TextInput
                                                value={note}
                                                onChangeText={setNote}
                                                placeholderTextColor={colors.textSecondary}
                                                multiline
                                                numberOfLines={3}
                                                style={[styles.noteInput, {
                                                    borderColor: colors.border,
                                                    color: colors.textPrimary,
                                                    backgroundColor: colors.background,
                                                }]}
                                                textAlignVertical="top"
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <Text style={[styles.message, { color: colors.textSecondary }]}>
                                        Checking out from the app is switched off for your organisation.
                                        {qrAvailable ? ' Show the QR code at a kiosk instead.' : ''}
                                    </Text>
                                )}

                                <View style={{ gap: 8 }}>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {allowApp ? (
                                            <TouchableOpacity
                                                onPress={attachPhoto}
                                                style={[styles.pickerButton, styles.halfButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                            >
                                                <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                                                <Text style={{ color: colors.textPrimary }} numberOfLines={1}>
                                                    {photo ? 'Retake' : 'Take a photo'}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {qrAvailable ? (
                                            <TouchableOpacity
                                                onPress={() => qr.open(shift)}
                                                style={[styles.pickerButton, styles.halfButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                                            >
                                                <Ionicons name="qr-code-outline" size={18} color={colors.textPrimary} />
                                                <Text style={{ color: colors.textPrimary }} numberOfLines={1}>Check Out QR</Text>
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
                                        style={[styles.btn, {
                                            backgroundColor: colors.warning || colors.primary,
                                            opacity: submitting ? 0.6 : 1,
                                            marginTop: 4,
                                        }]}
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <>
                                                <Ionicons name="log-out-outline" size={16} color="#fff" />
                                                <Text style={styles.btnText}>Check Out</Text>
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
                direction="out"
            />
        </>
    );
}
