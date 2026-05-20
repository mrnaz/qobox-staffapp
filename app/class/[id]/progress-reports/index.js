import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
    SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../../../services/api';
import Theme from '../../../context/ThemeContext';
import Avatar from '../../../components/Avatar';

const fmtDateTime = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
};

// Group raw report-result rows by their report (template), then by student.
// Mirrors the web app's `progressReportSummaries` computed in
// resources/js/_staff/views/pages/education/class/tests/index.vue.
function groupResultsByReport(results) {
    const groups = new Map();
    for (const r of results) {
        const reportId = r.report_id || r.report?.id;
        if (!reportId) continue;

        if (!groups.has(reportId)) {
            groups.set(reportId, {
                report_id: reportId,
                title: r.report?.title || 'Progress Report',
                report: r.report,
                _students: new Map(),
                assessed_count: 0,
                last_assessed: null,
            });
        }
        const g = groups.get(reportId);

        const clientId = r.client_id || r.client?.id;
        const clientName =
            r.client?.name ||
            `${r.client?.fname || ''} ${r.client?.sname || ''}`.trim() ||
            'Student';
        const updatedAt = r.updated_at || r.created_at;

        if (!g._students.has(clientId)) {
            g._students.set(clientId, {
                client_id: clientId,
                name: clientName,
                photo: r.client?.list_photo || r.client?.photo || null,
                completed_count: 0,
                draft_count: 0,
                last_assessed: null,
                results: [],
            });
        }
        const st = g._students.get(clientId);
        st.results.push(r);
        if (r.completed) st.completed_count++;
        else st.draft_count++;
        if (updatedAt && (!st.last_assessed || new Date(updatedAt) > new Date(st.last_assessed))) {
            st.last_assessed = updatedAt;
        }

        g.assessed_count++;
        if (updatedAt && (!g.last_assessed || new Date(updatedAt) > new Date(g.last_assessed))) {
            g.last_assessed = updatedAt;
        }
    }

    return Array.from(groups.values()).map((g) => ({
        report_id: g.report_id,
        title: g.title,
        report: g.report,
        assessed_count: g.assessed_count,
        last_assessed: g.last_assessed,
        students: Array.from(g._students.values()).sort((a, b) => {
            // Pin drafts to top — same UX rule as the web app
            if ((a.draft_count > 0) !== (b.draft_count > 0)) {
                return a.draft_count > 0 ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        }),
    }));
}

export default function ProgressReportsListScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id: classId } = useLocalSearchParams();
    const router = useRouter();

    const [templates, setTemplates] = useState([]); // available report templates
    const [results, setResults] = useState([]);     // filled results for this class
    const [expandedReportId, setExpandedReportId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                const [tplRes, resRes] = await Promise.all([
                    api.getClassProgressReports(classId),
                    api.getClassProgressReportResults(classId),
                ]);
                setTemplates(tplRes?.progress_reports || []);
                const list = resRes?.data || (Array.isArray(resRes) ? resRes : []) || [];
                setResults(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Progress reports load error', err);
                setError(err.body?.message || err.message || 'Failed to load progress reports.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [classId]
    );

    useEffect(() => { load(); }, [load]);
    useFocusEffect(useCallback(() => { load({ refresh: true }); }, [load]));

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const grouped = useMemo(() => groupResultsByReport(results), [results]);

    // Merge templates with grouped results so empty templates still show up.
    const reports = useMemo(() => {
        const byId = new Map(grouped.map((g) => [g.report_id, g]));
        for (const tpl of templates) {
            if (!byId.has(tpl.id)) {
                byId.set(tpl.id, {
                    report_id: tpl.id,
                    title: tpl.title,
                    report: tpl,
                    assessed_count: 0,
                    last_assessed: null,
                    students: [],
                });
            } else {
                // Keep the full template so we know its assessments for "New assessment"
                const g = byId.get(tpl.id);
                g.report = g.report || tpl;
            }
        }
        return Array.from(byId.values());
    }, [grouped, templates]);

    const goFill = (report, opts = {}) => {
        router.push({
            pathname: `/class/${classId}/progress-reports/fill`,
            params: {
                reportId: String(report.report_id ?? report.id),
                ...(opts.resultId ? { resultId: String(opts.resultId) } : {}),
                ...(opts.studentId ? { studentId: String(opts.studentId) } : {}),
                ...(opts.readonly ? { readonly: '1' } : {}),
            },
        });
    };

    const renderReport = ({ item }) => {
        const isExpanded = expandedReportId === item.report_id;
        return (
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setExpandedReportId(isExpanded ? null : item.report_id)}
                    style={styles.cardHeader}
                >
                    <Ionicons
                        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={18}
                        color={colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                            {item.title}
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {item.students.length} student{item.students.length === 1 ? '' : 's'}
                            {item.last_assessed ? ` · last ${fmtDateTime(item.last_assessed)}` : ''}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={(e) => { e.stopPropagation?.(); goFill(item); }}
                        style={[styles.addBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
                    >
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>New</Text>
                    </TouchableOpacity>
                </TouchableOpacity>

                {isExpanded ? (
                    <View style={{ marginTop: 8, gap: 8 }}>
                        {item.students.length === 0 ? (
                            <Text style={[styles.emptyInline, { color: colors.textSecondary }]}>
                                No assessments yet. Tap “New” to add one.
                            </Text>
                        ) : (
                            item.students.map((st) => {
                                const onPress = () => {
                                    // Drafts: open the draft straight into the
                                    // fill screen so the user can keep editing.
                                    if (st.draft_count > 0) {
                                        const draft = st.results.find((r) => !r.completed);
                                        if (draft) {
                                            goFill(item, { resultId: draft.id, studentId: st.client_id });
                                            return;
                                        }
                                    }
                                    // Completed results → matrix summary view
                                    // (mirrors web's StudentProgressReportSummaryDialog).
                                    if (st.completed_count > 0) {
                                        router.push({
                                            pathname: `/class/${classId}/progress-reports/summary`,
                                            params: {
                                                reportId: String(item.report_id),
                                                studentId: String(st.client_id),
                                            },
                                        });
                                    }
                                };
                                return (
                                    <TouchableOpacity
                                        key={`${item.report_id}-${st.client_id}`}
                                        onPress={onPress}
                                        activeOpacity={0.8}
                                        style={[styles.studentRow, { borderColor: colors.border }]}
                                    >
                                        <Avatar uri={st.photo} name={st.name} size={32} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>
                                                {st.name}
                                            </Text>
                                            {st.last_assessed ? (
                                                <Text style={[styles.studentMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                                                    {fmtDateTime(st.last_assessed)}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <View style={styles.chipsRow}>
                                            {st.completed_count ? (
                                                <Chip text={`${st.completed_count} done`} bg={(colors.success || colors.primary) + '22'} color={colors.success || colors.primary} />
                                            ) : null}
                                            {st.draft_count ? (
                                                <Chip text={`${st.draft_count} draft`} bg={(colors.warning || colors.primary) + '22'} color={colors.warning || colors.primary} />
                                            ) : null}
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                ) : null}
            </View>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        Reports
                    </Text>
                </View>
            </View>

            {isLoading && reports.length === 0 ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && reports.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={reports}
                    keyExtractor={(it) => String(it.report_id)}
                    renderItem={renderReport}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <FontAwesome name="file-text-o" size={32} color={colors.textSecondary} />
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                No progress reports linked to this class.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

function Chip({ text, bg, color }) {
    return (
        <View style={[styles.chip, { backgroundColor: bg }]}>
            <Text style={[styles.chipText, { color }]}>{text}</Text>
        </View>
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
    headerTitle: { fontSize: 16, fontWeight: '700' },
    list: { padding: 16, gap: 10, paddingBottom: 32 },
    card: { borderWidth: 1, borderRadius: 12, padding: 14 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 15, fontWeight: '700' },
    subtitle: { fontSize: 12, marginTop: 2 },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 999, borderWidth: 1,
    },
    studentRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderWidth: 1, borderRadius: 10, padding: 10,
    },
    studentName: { fontSize: 13, fontWeight: '600' },
    studentMeta: { fontSize: 11, marginTop: 1 },
    chipsRow: { flexDirection: 'row', gap: 4 },
    chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
    chipText: { fontSize: 10, fontWeight: '700' },
    emptyInline: { fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
