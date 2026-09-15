import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Theme from '../context/ThemeContext';
import Card, { cardGap } from '../components/Card';
import Toast from '../components/Toast';
import StudentScanModal from '../components/attendance/StudentScanModal';
import { iconColor } from '../utils/iconColors';

export default function StudentAttendanceScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [direction, setDirection] = useState('in');
    const [comments, setComments] = useState('');
    const [scanning, setScanning] = useState(false);
    const [toast, setToast] = useState(null);

    const Segment = ({ value, label, icon }) => {
        const active = direction === value;
        return (
            <TouchableOpacity
                onPress={() => setDirection(value)}
                style={[
                    styles.segment,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface },
                ]}
            >
                <Ionicons name={icon} size={16} color={active ? colors.onPrimary : colors.textSecondary} />
                <Text style={[styles.segmentText, { color: active ? colors.onPrimary : colors.textPrimary }]}>{label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <>
            <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
                <Card style={styles.card}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Scan a student card</Text>
                    <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                        Choose the direction, then scan the QR code on the student's card.
                    </Text>

                    <View style={styles.segments}>
                        <Segment value="in" label="Arriving" icon="log-in-outline" />
                        <Segment value="out" label="Leaving" icon="log-out-outline" />
                    </View>

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Comment (optional)</Text>
                    <TextInput
                        value={comments}
                        onChangeText={setComments}
                        placeholder="e.g. dentist appointment"
                        placeholderTextColor={colors.textDisabled}
                        multiline
                        style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
                    />

                    <TouchableOpacity
                        onPress={() => setScanning(true)}
                        style={[styles.scanBtn, { backgroundColor: colors.primary }]}
                    >
                        <Ionicons name="qr-code-outline" size={18} color={colors.onPrimary} />
                        <Text style={[styles.scanBtnText, { color: colors.onPrimary }]}>Scan student card</Text>
                    </TouchableOpacity>
                </Card>

                <Card style={[styles.card, styles.placeholder]}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.textDisabled + '22' }]}>
                        <Ionicons name="stats-chart-outline" size={26} color={colors.textDisabled} />
                    </View>
                    <Text style={[styles.cardTitle, { textAlign: 'center', color: colors.textPrimary }]}>Student Attendance Report</Text>
                    <View style={[styles.tagline, { borderColor: colors.border }]}>
                        <Ionicons name="time-outline" size={14} color={iconColor('time-outline', colors)} />
                        <Text style={[styles.taglineText, { color: colors.textSecondary }]}>Coming soon</Text>
                    </View>
                </Card>
            </ScrollView>

            <StudentScanModal
                visible={scanning}
                direction={direction}
                comments={comments}
                onClose={() => setScanning(false)}
                onSuccess={(log) => setToast({
                    message: `${log?.student?.name || 'Student'} signed ${direction}`,
                    variant: 'success',
                })}
                onError={(message) => setToast({ message, variant: 'error' })}
            />

            <Toast toast={toast} onHide={() => setToast(null)} />
        </>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: cardGap },
    card: { padding: 18 },
    cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
    cardHint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
    segments: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    segment: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    segmentText: { fontWeight: '700' },
    label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minHeight: 64,
        fontSize: 14,
        marginBottom: 14,
        textAlignVertical: 'top',
    },
    scanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 8,
    },
    scanBtnText: { fontWeight: '700', fontSize: 15 },
    placeholder: { alignItems: 'center', paddingVertical: 24 },
    iconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    tagline: {
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    taglineText: { fontSize: 12, fontWeight: '500' },
});
