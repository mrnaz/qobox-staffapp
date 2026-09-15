import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import shiftStyles from '../shift/styles';

const PREFIX = 'QBXSTUDENT:';
// The camera reports the same code many times a second; after one submit we
// hold the lock long enough for the teacher to move to the next card.
const RELOCK_MS = 1500;

export default function StudentScanModal({
    visible,
    direction = 'in',
    comments = '',
    onClose,
    onSuccess,
    onError,
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [permission, requestPermission] = useCameraPermissions();
    const [submitting, setSubmitting] = useState(false);
    const [lastName, setLastName] = useState('');
    const lockRef = useRef(false);
    const relockTimer = useRef(null);

    useEffect(() => {
        if (visible && permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [visible, permission, requestPermission]);

    useEffect(() => {
        if (!visible) {
            lockRef.current = false;
            setLastName('');
            if (relockTimer.current) clearTimeout(relockTimer.current);
        }
        return () => { if (relockTimer.current) clearTimeout(relockTimer.current); };
    }, [visible]);

    const unlockLater = () => {
        relockTimer.current = setTimeout(() => { lockRef.current = false; }, RELOCK_MS);
    };

    const handleScanned = async ({ data }) => {
        if (lockRef.current) return;
        if (!data || !data.startsWith(PREFIX)) return; // ignore shift/library codes
        lockRef.current = true;
        setSubmitting(true);
        try {
            const res = await api.logStudentAttendance({
                token: data,
                direction,
                comments: comments?.trim() || undefined,
            });
            setLastName(res?.log?.student?.name || '');
            onSuccess?.(res?.log);
        } catch (err) {
            onError?.(err.body?.message || err.message || 'Could not log the student.');
        } finally {
            setSubmitting(false);
            unlockLater();
        }
    };

    const title = direction === 'out' ? 'Sign out student' : 'Sign in student';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[styles.root, { backgroundColor: colors.background }]}>
                <View style={[shiftStyles.modalHeader, styles.header, { borderBottomColor: colors.border }]}>
                    <Text style={[shiftStyles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
                    <TouchableOpacity onPress={onClose} style={shiftStyles.iconButton}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>

                {!permission ? (
                    <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
                ) : !permission.granted ? (
                    <View style={styles.center}>
                        <Ionicons name="camera-outline" size={40} color={colors.textDisabled} />
                        <Text style={[shiftStyles.message, { color: colors.textSecondary }]}>
                            Camera access is needed to scan student cards.
                        </Text>
                        {permission.canAskAgain ? (
                            <TouchableOpacity
                                onPress={requestPermission}
                                style={[shiftStyles.btn, { backgroundColor: colors.primary, flex: 0, paddingHorizontal: 24 }]}
                            >
                                <Text style={[shiftStyles.btnText, { color: colors.onPrimary }]}>Allow camera</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={[shiftStyles.message, { color: colors.textSecondary }]}>
                                Enable it in your device settings.
                            </Text>
                        )}
                    </View>
                ) : (
                    <>
                        <CameraView
                            style={styles.camera}
                            facing="back"
                            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                            onBarcodeScanned={handleScanned}
                        />
                        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                            {submitting ? (
                                <ActivityIndicator color={colors.primary} />
                            ) : lastName ? (
                                <View style={styles.lastRow}>
                                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                                    <Text style={[styles.lastText, { color: colors.textPrimary }]} numberOfLines={1}>
                                        {lastName} signed {direction}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={[shiftStyles.qrHint, { color: colors.textSecondary }]}>
                                    Point the camera at the student card's QR code.
                                </Text>
                            )}
                        </View>
                    </>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: {
        paddingHorizontal: 16,
        paddingTop: 52,
        paddingBottom: 12,
        marginBottom: 0,
        borderBottomWidth: 1,
    },
    camera: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    footer: {
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lastRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lastText: { fontSize: 15, fontWeight: '600' },
});
