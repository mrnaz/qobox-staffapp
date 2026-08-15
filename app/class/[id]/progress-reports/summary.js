import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    FlatList,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import Theme from '../../../context/ThemeContext';
import Avatar from '../../../components/Avatar';
import { resolveRubricColor } from '../../../utils/colors';

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

    // Horizontal pager state — one assessment per page, newest first.
    const { width: pageWidth } = useWindowDimensions();
    const pagerRef = useRef(null);
    const [page, setPage] = useState(0);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError('');

            // Pull the template, all class results, and the class roster
            // in parallel. The roster gives us a name+photo fallback when
            // the student has zero results yet (otherwise the header would
            // just say "Student").
            const [tplRes, classResults, classStudents] = await Promise.all([
                api.getProgressReportTemplate(reportId),
                api.getClassProgressReportResults(classId),
                api.getClassStudents(classId, { all: 'true', scope: 'linked' }).catch(() => null),
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

            // Prefer the freshly-loaded client info from a past result,
            // but fall back to the class roster so the header is always
            // populated.
            const firstWithClient = list.find((r) => r.client);
            if (firstWithClient?.client) {
                setStudentMeta({
                    name: firstWithClient.client.name ||
                        `${firstWithClient.client.fname || ''} ${firstWithClient.client.sname || ''}`.trim(),
                    photo: firstWithClient.client.list_photo || firstWithClient.client.photo || null,
                });
            } else {
                const stList = classStudents?.students || classStudents?.data || classStudents?.clients || classStudents || [];
                const match = (Array.isArray(stList) ? stList : []).find(
                    (s) => Number(s.id ?? s.client_id ?? s.student_id) === Number(studentId)
                );
                if (match) {
                    setStudentMeta({
                        name: match.name ||
                            `${match.fname || match.student_fname || ''} ${match.sname || match.student_sname || ''}`.trim(),
                        photo: match.list_photo || match.photo || null,
                    });
                }
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
    }, [classId, reportId, studentId]);

    // Re-run on every focus so a newly-saved assessment appears immediately
    // when the user navigates back from the fill screen.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    // After a reload the list may have grown (new assessment) or shrunk —
    // snap back to the newest card so the counter never points past the end.
    useEffect(() => {
        setPage(0);
        pagerRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [details.length]);

    const goTo = (index) => {
        const clamped = Math.max(0, Math.min(index, details.length - 1));
        setPage(clamped);
        pagerRef.current?.scrollToOffset({ offset: clamped * pageWidth, animated: true });
    };

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

    const newAssessment = () => {
        router.push({
            pathname: `/class/${classId}/progress-reports/fill`,
            params: {
                reportId: String(reportId),
                studentId: String(studentId),
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
                    <Text
                        style={[styles.headerTitle, { color: colors.textPrimary }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {template?.title || 'Report'}
                    </Text>
                    <Text
                        style={[styles.headerSub, { color: colors.textSecondary }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {studentMeta?.name || 'Student'}
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
                // Zero-state — no assessments yet. Show a big CTA so the staff
                // member can jump straight into the first one.
                <View style={styles.center}>
                    <Ionicons name="document-text-outline" size={36} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No assessments yet for this student.
                    </Text>
                    <TouchableOpacity
                        onPress={newAssessment}
                        activeOpacity={0.85}
                        style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
                    >
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                            Start first assessment
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {/* Pager bar: prev/next arrows + "1 of N" counter on the
                        left, the "+ New assessment" action on the right. */}
                    <View style={styles.titleRow}>
                        <View style={styles.pagerControls}>
                            <TouchableOpacity
                                onPress={() => goTo(page - 1)}
                                disabled={page === 0}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={[
                                    styles.pagerBtn,
                                    { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                    page === 0 && { opacity: 0.35 },
                                ]}
                            >
                                <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={[styles.pagerCounter, { color: colors.textSecondary }]}>
                                {page + 1} of {details.length}
                            </Text>
                            <TouchableOpacity
                                onPress={() => goTo(page + 1)}
                                disabled={page === details.length - 1}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={[
                                    styles.pagerBtn,
                                    { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                    page === details.length - 1 && { opacity: 0.35 },
                                ]}
                            >
                                <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            onPress={newAssessment}
                            activeOpacity={0.85}
                            style={[styles.newBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]}
                        >
                            <Ionicons name="add" size={14} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                                New assessment
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* One assessment per page; swipe or use the arrows. Each
                        page scrolls vertically on its own so tall cards stay
                        fully reachable. */}
                    <FlatList
                        ref={pagerRef}
                        data={details}
                        keyExtractor={(r) => String(r.id)}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onScroll={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
                            if (idx !== page && idx >= 0 && idx < details.length) setPage(idx);
                        }}
                        scrollEventThrottle={16}
                        getItemLayout={(_, index) => ({
                            length: pageWidth,
                            offset: pageWidth * index,
                            index,
                        })}
                        renderItem={({ item }) => (
                            <ScrollView
                                style={{ width: pageWidth }}
                                contentContainerStyle={styles.page}
                                showsVerticalScrollIndicator={false}
                            >
                                <ResultCard
                                    result={item}
                                    rows={rows}
                                    onPress={() => openResult(item)}
                                    colors={colors}
                                />
                            </ScrollView>
                        )}
                    />
                </View>
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
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.itemLabel, { color: colors.textPrimary }]} numberOfLines={2}>
                                    {row.assessment.label}
                                </Text>
                                {/* Per-item comment, shown in full inside the
                                    same green bubble the fill screen uses so
                                    both screens read identically. */}
                                {outcome?.comment ? (
                                    <View style={[styles.commentBubble, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '44' }]}>
                                        <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.primary} />
                                        <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 15, flex: 1 }}>
                                            {outcome.comment}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
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
                    <Text style={[styles.commentText, { color: colors.textSecondary }]}>
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
            const bg = resolveRubricColor(rubric?.color);
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
        // Comment-type items render their text in full under the label —
        // nothing to show in the value column when a comment exists.
        if (!outcome.comment) {
            items.push(<Unspecified key="u" colors={colors} />);
        }
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
    page: { paddingHorizontal: 16, paddingBottom: 32 },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
    },
    pagerControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pagerBtn: {
        width: 28,
        height: 28,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pagerCounter: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        minWidth: 44,
        textAlign: 'center',
    },
    newBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    ctaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 999,
        marginTop: 8,
    },
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
    itemLabel: { fontSize: 13, fontWeight: '500' },
    commentBubble: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderRadius: 8, padding: 6,
        marginTop: 4,
    },
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
