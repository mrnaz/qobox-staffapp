import React from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from '../QRCode';
import Card from '../Card';
import Theme from '../../context/ThemeContext';
import styles from './styles';

/**
 * The code a staff member holds up at the kiosk. Purely presentational — the
 * token, loading and error state all come from useShiftQr.
 *
 * The QR keeps a white background regardless of theme: a dark-mode inversion
 * makes it unreadable to the kiosk camera.
 */
export default function ShiftQrModal({ visible, onClose, token, loading, error, direction = 'in' }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const title = direction === 'out' ? 'Clock-out QR' : 'Clock-in QR';
    const hint = direction === 'out'
        ? 'Scan this at the kiosk to clock out.'
        : 'Scan this at the kiosk to clock in.';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 360 }}>
                    <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
                            <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                                <Ionicons name="close" size={22} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {error ? (
                            <View style={{ alignItems: 'center', gap: 8 }}>
                                <Ionicons name="alert-circle-outline" size={32} color={colors.error || colors.warning} />
                                <Text style={[styles.message, { color: colors.error || colors.warning }]}>
                                    {error}
                                </Text>
                            </View>
                        ) : (
                            <>
                                <Text style={[styles.qrHint, { color: colors.textSecondary }]}>{hint}</Text>
                                <Card style={[styles.qrBox, { backgroundColor: '#ffffff' }]}>
                                    {loading ? (
                                        <ActivityIndicator color={colors.primary} />
                                    ) : token ? (
                                        <QRCode value={token} size={260} />
                                    ) : (
                                        <ActivityIndicator color={colors.primary} />
                                    )}
                                </Card>
                            </>
                        )}
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}
