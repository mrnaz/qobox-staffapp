import { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import Theme from '../../../context/ThemeContext';
import Avatar from '../../../components/Avatar';

// Student × report summary screen — same intent as the web's
// StudentProgressReportSummaryDialog.vue but laid out as a vertical stack of
// "report cards" (one per saved result) instead of a matrix table. Cards are
// newest first; each card lists the assessments and their outcomes, plus a
// general-comments tail. Tap a card to drill into the result.
const fmtDateLong = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export default function ProgressReportSummaryScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const { id: classId, reportId, studentId } = useLocalSearchParams();

    const [template, setTemplate] = useState(null);
    const [details, setDetails] = useState([]); // full results with outcomes (newest first)
    const [studentMeta, setStudentMeta] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setIsLoading(true);
                setError('');

                const [tplRes, classResults] = await Promise.all([
                    api.getProgressReportTemplate(reportId),
                    api.getClassProgressReportResults(classId),
                ]);
                setTemplate(tplRes?.data || tplRes);

                const raw =
                    classResults?.data ||
                    (Array.isArray(classResults) ? classResults : []) ||
                    [];
                const list = (Array.isArray(raw) ? raw : []).filter(
                    (r) =>
                        Number(r.client_id ?? r.client?.id) === Number(studentId) &&
                        Number(r.report_id ?? r.report?.id) === Number(reportId)
                );

                const firstWithClient = list.find((r) => r.client);
                if (firstWithClient?.client) {
                    setStudentMeta({
                        name: firstWithClient.client.name ||
                            `${firstWithClient.client.fname || ''} ${firstWithClient.client.sname || ''}`.trim(),
                        photo: firstWithClient.client.list_photo || firstWithClient.client.photo || null,
                    });
                }

                if (list.length === 0) {
                    setDetails([]);
                    return;
                }

                const settled = await Promise.allSettled(
                    list.map((r) => api.getProgressReportResult(r.id))
                );
                const full = settled
                    .filter((s) => s.status === 'fulfilled')
                    .map((s, idx) => s.value?.data || s.value || list[idx])
                    .filter(Boolean)
                    // Newest first for the mobile card stack — the web table is
                    // oldest-left because it scrolls right; on a vertical
                    // phone feed, newest-on-top is the expected pattern.
                    .sort((a, b) => {
                        const ta = new Date(a.created_at || a.updated_at || 0).getTime();
                        const tb = new Date(b.created_at || b.updated_at || 0).getTime();
                        return tb - ta;
                    });
                setDetails(full);
            } catch (err) {
                console.error('Summary load error', err);
                setError(err.body?.message || err.message || 'Failed to load summary.');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [classId, reportId, studentId]);

    // Group rows: ungrouped assessments first, then groups with children.
    // Each "row" gets rendered inside every card; the cell content per card
    // comes from that card's outcomesMap entry.
    const rows = useMemo(() => {
        if (!template) return [];
        const out = [];
        const ungrouped = template.assessments || [];
        const groups = template.item_groups || [];
        const groupedIds = new Set();
        for (const g of groups) {
            for (const a of g.assessments || []) {
                if (a.id) groupedIds.add(a.id);
            }
        }
        for (const a of ungrouped) {
            if (!groupedIds.has(a.id)) {
                out.push({ key: `single-${a.id}`, type: 'assessment', assessment: a });
            }
        }
        for (const g of groups) {
            out.push({ key: `g-${g.id}`, type: 'group-header', label: g.label });
            for (const a of g.assessments || []) {
                out.push({ key: `g-item-${a.id}`, type: 'assessment', assessment: a, indented: true });
            }
        }
        return out;
    }, [template]);

    const openResult = (result) => {
        if (!result) return;
        router.push({
            pathname: `/class/${classId}/progress-reports/fill`,
            params: {
                reportId: String(reportId),
                resultId: String(result.id),
                studentId: String(studentId),
                ...(result.completed ? { readonly: '1' } : {}),
            },
        });
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Avatar uri={studentMeta?.photo} name={studentMeta?.name || ''} size={32} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {studentMeta?.name || 'Student'}
                    </Text>
                    <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {template?.title || 'Report'}
                    </Text>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                </View>
            ) : details.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No assessments yet for this student.
                    </Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.list}>
                    <Text style={[styles.listTitle, { color: colors.textSecondary }]}>
                        {details.length} assessment{details.length === 1 ? '' : 's'} · newest first
                    </Text>
                    {details.map((r) => (
                        <ResultCard
                            key={r.id}
                            result={r}
                            rows={rows}
                            onPress={() => openResult(r)}
                            colors={colors}
                        />
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

// One card per saved result (one date). Lists every assessment item with its
// outcome inline; tap the card to open the result.
function ResultCard({ result, rows, onPress, colors }) {
    const isDraft = !result.completed;
    const outcomeMap = useMemo(() => {
        const m = {};
        for (const o of result.outcomes || []) m[o.assessment_id] = o;
        return m;
    }, [result]);

    const accent = isDraft ? (colors.warning || colors.primary) : (colors.success || colors.primary);

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
        >
            {/* Card header */}
            <View style={styles.cardHeader}>
                <View style={[styles.dot, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.cardDate, { color: colors.textPrimary }]} numberOfLines={1}>
                        {fmtDateLong(result.created_at || result.updated_at)}
                    </Text>
                    <Text style={[styles.cardTime, { color: colors.textSecondary }]} numberOfLines={1}>
                        {fmtTime(result.created_at || result.updated_at)}
                        {result.staff?.name ? ` · by ${result.staff.name}` : ''}
                    </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: accent + '22' }]}>
                    <Text style={[styles.chipText, { color: accent }]}>{isDraft ? 'DRAFT' : 'DONE'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>

            {/* Body — assessments */}
            <View style={{ marginTop: 8 }}>
                {rows.map((row) => {
                    if (row.type === 'group-header') {
                        return (
                            <Text
                                key={row.key}
                                style={[styles.groupLabel, { color: colors.textSecondary, borderTopColor: colors.border }]}
                                numberOfLines={1}
                            >
                                {row.label}
                            </Text>
                        );
                    }
                    const outcome = outcomeMap[row.assessment.id] || null;
                    return (
                        <View
                            key={row.key}
                            style={[
                                styles.itemRow,
                                { borderTopColor: colors.border },
                                row.indented && { paddingLeft: 16 },
                            ]}
                        >
                            <Text style={[styles.itemLabel, { color: colors.textPrimary }]} numberOfLines={2}>
                                {row.assessment.label}
                            </Text>
                            <View style={styles.itemValue}>
                                <OutcomeValue outcome={outcome} assessment={row.assessment} colors={colors} />
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* General comment tail */}
            {result.comment ? (
                <View style={[styles.commentBox, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '40' }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                    <Text style={[styles.commentText, { color: colors.textSecondary }]} numberOfLines={3}>
                        {result.comment}
                    </Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

function OutcomeValue({ outcome, assessment, colors }) {
    if (!outcome) {
        return <Text style={{ color: colors.textSecondary, opacity: 0.5, fontSize: 12 }}>—</Text>;
    }
    const t = assessment?.type;
    const items = [];

    if (t === 'P') {
        if (outcome.passed === true) {
            items.push(
                <Text key="p" style={{ color: colors.success || colors.primary, fontWeight: '700', fontSize: 13 }}>Pass</Text>
            );
        } else if (outcome.passed === false) {
            items.push(
                <Text key="f" style={{ color: colors.error || '#ef4444', fontWeight: '700', fontSize: 13 }}>Fail</Text>
            );
        } else {
            items.push(<Unspecified key="u" colors={colors} />);
        }
    } else if (t === 'S') {
        if (outcome.score !== null && outcome.score !== undefined) {
            items.push(
                <Text key="s" style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }}>
                    {outcome.score}/{assessment.max_value || 100}
                </Text>
            );
        } else {
            items.push(<Unspecified key="u" colors={colors} />);
        }
    } else if (t === 'R') {
        if (outcome.rubric_selection) {
            const rubric = (assessment.rubrics || []).find((rb) => rb.id === outcome.rubric_selection);
            const bg = rubric?.color?.light?.background || rubric?.color?.dark?.background || '#9ca3af';
            items.push(
                <View key="r" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: bg }} />
                    {rubric?.label ? (
                        <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
                            {rubric.label}
                        </Text>
                    ) : null}
                </View>
            );
        } else {
            items.push(<Unspecified key="u" colors={colors} />);
        }
    } else if (t === 'C') {
        if (outcome.comment) {
            items.push(
                <Ionicons key="c" name="chatbubble-ellipses" size={14} color={colors.success || colors.primary} />
            );
        } else {
            items.push(<Unspecified key="u" colors={colors} />);
        }
    }

    // Trailing comment indicator for non-comment-type items
    if (t !== 'C' && outcome.comment) {
        items.push(
            <Ionicons
                key="ic"
                name="chatbubble-ellipses"
                size={12}
                color={colors.success || colors.primary}
                style={{ marginLeft: 6 }}
            />
        );
    }

    return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{items}</View>;
}

function Unspecified({ colors }) {
    return <Text style={{ color: colors.textSecondary, opacity: 0.5, fontSize: 12 }}>—</Text>;
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    list: { padding: 16, paddingBottom: 32, gap: 12 },
    listTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    card: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    cardDate: { fontSize: 14, fontWeight: '700' },
    cardTime: { fontSize: 11, marginTop: 2 },
    chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    groupLabel: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingVertical: 8,
        borderTopWidth: 1,
        marginTop: 4,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingVertical: 8,
        borderTopWidth: 1,
    },
    itemLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
    itemValue: { alignItems: 'flex-end' },
    commentBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
        marginTop: 10,
    },
    commentText: { flex: 1, fontSize: 12, lineHeight: 16 },
});
