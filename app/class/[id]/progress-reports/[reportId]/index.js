import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useGoBack } from '../../../../utils/nav';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../../services/api';
import Theme from '../../../../context/ThemeContext';
import Avatar from '../../../../components/Avatar';

// Roster of every student in the class for a given progress-report template.
// Matches the spec flow: tap a report → see all students → tap a student →
// see history + add new assessment.
//
// Each row shows the student's current status for this report:
//   - "No assessments yet" (gray) if nothing recorded
//   - "X draft" chip (warning) when there are unfinished records
//   - "Y done" chip (success) for completed records
// Drafts pin to the top, then unassessed students, then fully-completed
// students (so the staff member sees what needs attention first).

const fmtDateShort = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ReportStudentRosterScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const { id: classId, reportId } = useLocalSearchParams();
    const goBack = useGoBack(`/class/${classId}/progress-reports`);
    const insets = useSafeAreaInsets();

    const [template, setTemplate] = useState(null);
    const [students, setStudents] = useState([]);
    const [results, setResults] = useState([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const [tplRes, stRes, resRes] = await Promise.all([
                    api.getProgressReportTemplate(reportId),
                    api.getClassStudents(classId, { all: 'true', scope: 'linked' }),
                    api.getClassProgressReportResults(classId, { report_id: reportId }),
                ]);
                setTemplate(tplRes?.data || tplRes);
                const stList = stRes?.students || stRes?.data || stRes?.clients || stRes || [];
                setStudents(Array.isArray(stList) ? stList : []);
                const rList = resRes?.data || (Array.isArray(resRes) ? resRes : []) || [];
                setResults(Array.isArray(rList) ? rList : []);
            } catch (err) {
                console.error('Report roster load error', err);
                setError(err.body?.message || err.message || 'Failed to load students.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [classId, reportId]
    );

    useEffect(() => { load(); }, [load]);
    // Refresh when navigating back from fill/summary so chips reflect new state.
    useFocusEffect(useCallback(() => { load({ refresh: true }); }, [load]));

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    // Per-student tally derived from the results list.
    const byStudent = useMemo(() => {
        const m = new Map();
        for (const r of results) {
            // Be defensive — only count results that belong to this report.
            if (Number(r.report_id ?? r.report?.id) !== Number(reportId)) continue;
            const cid = Number(r.client_id ?? r.client?.id);
            if (!cid) continue;
            const entry = m.get(cid) || { completed: 0, drafts: 0, last: null };
            if (r.completed) entry.completed += 1;
            else entry.drafts += 1;
            const t = r.updated_at || r.created_at;
            if (t && (!entry.last || new Date(t) > new Date(entry.last))) entry.last = t;
            m.set(cid, entry);
        }
        return m;
    }, [results, reportId]);

    // Enriched student rows + sort rule (drafts first, then no-assessments,
    // then completed-only — descending by last-assessed within each bucket).
    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = students
            .map((s) => {
                const id = Number(s.id ?? s.client_id ?? s.student_id);
                const name =
                    s.name ||
                    `${s.fname || s.student_fname || ''} ${s.sname || s.student_sname || ''}`.trim() ||
                    'Student';
                const tally = byStudent.get(id) || { completed: 0, drafts: 0, last: null };
                return {
                    id,
                    name,
                    photo: s.list_photo || s.photo || null,
                    completed: tally.completed,
                    drafts: tally.drafts,
                    last: tally.last,
                };
            })
            .filter((r) => (term ? r.name.toLowerCase().includes(term) : true));

        const bucket = (r) => (r.drafts > 0 ? 0 : r.completed === 0 ? 1 : 2);
        list.sort((a, b) => {
            const ba = bucket(a);
            const bb = bucket(b);
            if (ba !== bb) return ba - bb;
            const ta = a.last ? new Date(a.last).getTime() : 0;
            const tb = b.last ? new Date(b.last).getTime() : 0;
            if (tb !== ta) return tb - ta;
            return a.name.localeCompare(b.name);
        });
        return list;
    }, [students, byStudent, search]);

    const totals = useMemo(() => {
        let assessed = 0, drafts = 0;
        for (const r of rows) {
            if (r.drafts > 0) drafts += 1;
            if (r.completed > 0) assessed += 1;
        }
        return { total: rows.length, assessed, drafts };
    }, [rows]);

    const openStudent = (studentId) => {
        // Summary screen handles all three cases: full history, drafts-only,
        // and zero-assessments (it now shows a "Start first assessment" CTA).
        router.push({
            pathname: `/class/${classId}/progress-reports/summary`,
            params: { reportId: String(reportId), studentId: String(studentId) },
        });
    };

    // Matches the client app's day card; skipped on web, where the offset
    // becomes a hard unblurred box-shadow instead of a soft elevation.
    const cardShadowStyle = (c) => (Platform.OS === 'web' ? null : {
        shadowColor: c.cardShadow,
        shadowOffset: c.cardShadowOffset,
        shadowOpacity: c.cardShadowOpacity,
        elevation: c.cardElevation,
    });

    const renderItem = (item, index) => {
        const stateLabel = item.drafts > 0
            ? `${item.drafts} draft`
            : item.completed > 0
                ? `${item.completed} done${item.last ? ` · last ${fmtDateShort(item.last)}` : ''}`
                : 'No assessments yet';
        const stateColor = item.drafts > 0
            ? (colors.warning || colors.primary)
            : item.completed > 0
                ? (colors.success || colors.primary)
                : colors.textSecondary;

        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openStudent(item.id)}
                style={[
                    styles.row,
                    // Divider between rows; the header band already closes the top.
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
            >
                <Avatar uri={item.photo} name={item.name} id={item.id} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text style={[styles.state, { color: stateColor }]} numberOfLines={1}>
                        {stateLabel}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => goBack()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {template?.title || 'Report'}
                    </Text>
                    <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {totals.total} student{totals.total === 1 ? '' : 's'}
                        {totals.assessed ? ` · ${totals.assessed} assessed` : ''}
                        {totals.drafts ? ` · ${totals.drafts} draft` : ''}
                    </Text>
                </View>
            </View>

            {isLoading && students.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && students.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    {/* Search */}
                    <View style={[styles.searchWrap, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}>
                        <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                        <TextInput
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Search students…"
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.searchInput, { color: colors.textPrimary }]}
                        />
                        {search ? (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    <ScrollView
                        // Edge-to-edge on Android: pad the content so the last
                        // row scrolls clear of the control bar.
                        contentContainerStyle={[
                            styles.list,
                            { paddingBottom: styles.list.paddingBottom + insets.bottom },
                        ]}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                    >
                        {rows.length === 0 ? (
                            <View style={styles.center}>
                                <Ionicons name="people-outline" size={32} color={colors.textDisabled} />
                                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                    {search ? 'No students match your search.' : 'No students enrolled in this class.'}
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.card, {
                                borderColor: colors.borderStrong || colors.border,
                                backgroundColor: colors.cardBackground,
                            }, cardShadowStyle(colors)]}>
                                <View style={[styles.cardHeader, {
                                    backgroundColor: colors.primary + '15',
                                    borderBottomColor: colors.border,
                                }]}>
                                    <Text style={[styles.cardHeaderTitle, { color: colors.textPrimary }]}>
                                        Students
                                    </Text>
                                    <Text style={[styles.cardHeaderMeta, { color: colors.textSecondary }]}>
                                        {rows.length}
                                    </Text>
                                </View>
                                {rows.map((item, index) => (
                                    <View key={String(item.id)}>{renderItem(item, index)}</View>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </>
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
    iconBtn: { padding: 8, borderRadius: 999 },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 2 },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderWidth: 1, borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 8,
        marginHorizontal: 16, marginTop: 12,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
    list: { padding: 16, paddingBottom: 32 },
    card: {
        borderWidth: 1,
        borderRadius: 16,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    cardHeaderTitle: { fontSize: 15, fontWeight: '700' },
    cardHeaderMeta: { fontSize: 13, fontWeight: '600' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    name: { fontSize: 14, fontWeight: '700' },
    state: { fontSize: 12, fontWeight: '500' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
