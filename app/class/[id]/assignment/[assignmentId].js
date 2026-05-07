import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    ActivityIndicator,
    FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import Theme from '../../../context/ThemeContext';

const stripHtml = (html = '') => html.replace(/<[^>]*>/g, '').trim();

const fmtDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const submissionStatus = (sub) => {
    if (!sub) return { label: 'Not submitted', isSubmitted: false };
    if (sub.submitted_at || sub.is_submitted || sub.status === 'submitted') return { label: 'Submitted', isSubmitted: true };
    if (sub.status === 'late') return { label: 'Late', isSubmitted: true };
    return { label: 'Not submitted', isSubmitted: false };
};

export default function AssignmentDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const { id: classId, assignmentId, assignment: assignmentParam } = useLocalSearchParams();

    const initial = (() => {
        try { return assignmentParam ? JSON.parse(assignmentParam) : null; } catch { return null; }
    })();

    const [assignment, setAssignment] = useState(initial);
    const [loading, setLoading] = useState(!initial?.students && !initial?.submissions);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setError('');
                const res = await api.getClassAssignment(classId, assignmentId);
                const data = res?.assignment || res?.data || res;
                if (data) setAssignment(data);
            } catch (err) {
                console.error('Assignment load error', err);
                setError(err.body?.message || err.message || 'Failed to load assignment.');
            } finally {
                setLoading(false);
            }
        })();
    }, [classId, assignmentId]);

    // The backend may return either "students" (a roster with submission state)
    // or "submissions" (only those who submitted). We render whichever is present.
    const students = assignment?.students || [];
    const submissions = assignment?.submissions || [];
    const rosterRows = students.length > 0
        ? students.map((s) => {
            const matched = submissions.find((sub) => String(sub.client_id ?? sub.student_id) === String(s.id ?? s.client_id));
            const status = submissionStatus(matched || s);
            return {
                id: s.id ?? s.client_id,
                name: s.full_name || `${s.fname || ''} ${s.sname || ''}`.trim() || `Student #${s.id ?? s.client_id}`,
                ...status,
            };
        })
        : submissions.map((sub) => {
            const status = submissionStatus(sub);
            return {
                id: sub.id ?? sub.client_id,
                name: sub.full_name || `${sub.fname || ''} ${sub.sname || ''}`.trim() || 'Student',
                ...status,
            };
        });

    const submittedCount = rosterRows.filter((r) => r.isSubmitted).length;
    const totalCount = rosterRows.length;

    const renderRow = ({ item }) => (
        <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
            <View style={[styles.dot, { backgroundColor: item.isSubmitted ? (colors.success || colors.primary) : (colors.error || colors.warning) }]} />
            <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.name}
            </Text>
            <Text style={[styles.studentStatus, { color: item.isSubmitted ? (colors.success || colors.primary) : colors.textSecondary }]}>
                {item.label}
            </Text>
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {assignment?.title || 'Assignment'}
                </Text>
            </View>

            {loading && !assignment ? (
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : (
                <FlatList
                    data={rosterRows}
                    keyExtractor={(it, i) => String(it.id ?? i)}
                    renderItem={renderRow}
                    ListHeaderComponent={
                        <View style={styles.body}>
                            <Text style={[styles.title, { color: colors.textPrimary }]}>{assignment?.title}</Text>
                            {assignment?.due_date ? (
                                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                                    Due {fmtDate(assignment.due_date)}
                                </Text>
                            ) : null}
                            {assignment?.description ? (
                                <Text style={[styles.description, { color: colors.textPrimary }]}>
                                    {stripHtml(assignment.description)}
                                </Text>
                            ) : null}

                            <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                                <View style={styles.summaryItem}>
                                    <Text style={[styles.summaryNumber, { color: colors.success || colors.primary }]}>
                                        {submittedCount}
                                    </Text>
                                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Submitted</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={[styles.summaryNumber, { color: colors.error || colors.warning }]}>
                                        {Math.max(0, totalCount - submittedCount)}
                                    </Text>
                                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Pending</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={[styles.summaryNumber, { color: colors.textPrimary }]}>{totalCount}</Text>
                                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
                                </View>
                            </View>

                            {error ? (
                                <Text style={[styles.errorText, { color: colors.error || colors.warning }]}>{error}</Text>
                            ) : null}

                            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Students</Text>
                        </View>
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="people-outline" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>No students on this assignment.</Text>
                        </View>
                    }
                    contentContainerStyle={{ paddingBottom: 40 }}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    iconButton: { padding: 8, borderRadius: 999 },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
    body: { padding: 20, gap: 8 },
    title: { fontSize: 20, fontWeight: '700' },
    meta: { fontSize: 13 },
    description: { fontSize: 14, lineHeight: 20, marginTop: 4 },
    summary: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 14,
        marginTop: 12,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryNumber: { fontSize: 22, fontWeight: '700' },
    summaryLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: -4 },
    errorText: { fontSize: 12, marginTop: 8 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 20,
        marginTop: 8,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    studentName: { flex: 1, fontSize: 14 },
    studentStatus: { fontSize: 12, fontWeight: '600' },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
