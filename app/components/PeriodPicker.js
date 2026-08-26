import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';
import Card, { CardHeader } from './Card';
import { iconColor } from '../utils/iconColors';

// Header control for switching the active academic period. Shows the current
// period as a tappable chip; when more than one period exists, tapping opens a
// list to choose from. Periods the staff member teaches in are flagged.
export default function PeriodPicker({ periods = [], selectedId, onChange }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const [open, setOpen] = useState(false);

    const list = Array.isArray(periods) ? periods : [];
    const selected = list.find((p) => String(p.id) === String(selectedId));
    const label = selected?.label || 'Select period';
    const canChoose = list.length > 1;

    const choose = (p) => {
        setOpen(false);
        if (p && String(p.id) !== String(selectedId)) onChange?.(p);
    };

    return (
        <View style={[styles.bar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
                onPress={() => canChoose && setOpen(true)}
                activeOpacity={canChoose ? 0.7 : 1}
                style={[styles.chip, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}
            >
                <Ionicons name="calendar-outline" size={15} color={iconColor('calendar-outline', colors)} />
                <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {label}
                </Text>
                {canChoose ? (
                    <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
                ) : null}
            </TouchableOpacity>

            <Modal
                visible={open}
                transparent
                animationType="fade"
                onRequestClose={() => setOpen(false)}
            >
                <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setOpen(false)}>
                    <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 460 }}>
                        <Card>
                            <CardHeader>
                                <Text style={[styles.title, { color: colors.textPrimary }]}>Academic period</Text>
                                <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }}>
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </CardHeader>
                            <ScrollView style={{ maxHeight: 420 }}>
                                {list.map((p) => {
                                    const isSel = String(p.id) === String(selectedId);
                                    return (
                                        <TouchableOpacity
                                            key={p.id}
                                            onPress={() => choose(p)}
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
                                                <Ionicons name="checkmark" size={20} color={iconColor('checkmark', colors)} />
                                            ) : null}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </Card>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        maxWidth: '100%',
    },
    chipText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    title: { fontSize: 16, fontWeight: '700' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    rowLabel: { fontSize: 15, fontWeight: '500' },
    rowHint: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
