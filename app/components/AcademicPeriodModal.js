import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';
import Card, { CardHeader } from './Card';

export default function AcademicPeriodModal({ visible, periods = [], selectedId, onSelect, onClose }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const dismissable = typeof onClose === 'function';

    const list = Array.isArray(periods) ? periods : [];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => { if (dismissable) onClose(); }}
        >
            <TouchableOpacity
                style={[styles.overlay, { backgroundColor: colors.overlay }]}
                activeOpacity={1}
                onPress={() => { if (dismissable) onClose(); }}
            >
                <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                    <Card>
                        <CardHeader>
                            <Text style={[styles.title, { color: colors.textPrimary }]}>
                                {dismissable ? 'Academic period' : 'Select your academic period'}
                            </Text>
                            {dismissable ? (
                                <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            ) : null}
                        </CardHeader>
                        {!dismissable ? (
                            <Text style={[styles.hint, { color: colors.textSecondary }]}>
                                You're active in more than one academic period. Choose one to continue —
                                you can change this later from your profile menu.
                            </Text>
                        ) : null}
                        <ScrollView style={{ maxHeight: 420 }}>
                            {list.map((p) => {
                                const isSel = String(p.id) === String(selectedId);
                                return (
                                    <TouchableOpacity
                                        key={p.id}
                                        onPress={() => onSelect?.(p)}
                                        activeOpacity={0.7}
                                        style={styles.row}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                                                {p.label}
                                            </Text>
                                            {p.staff_teaches_in ? (
                                                <Text style={[styles.rowHint, { color: colors.success || colors.primary }]}>
                                                    You teach in this period
                                                </Text>
                                            ) : null}
                                        </View>
                                        {isSel ? (
                                            <Ionicons name="checkmark" size={20} color={colors.primary} />
                                        ) : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </Card>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    title: { fontSize: 16, fontWeight: '700' },
    hint: { fontSize: 13, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    rowLabel: { fontSize: 15, fontWeight: '500' },
    rowHint: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
