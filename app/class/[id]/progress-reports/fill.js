import { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    TextInput,
    Modal,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../../services/api';
import Theme from '../../../context/ThemeContext';
import Avatar from '../../../components/Avatar';
import Toast from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';

// Assessment types come from the backend `progress_report_assessments.type`
// column: 'P' pass/fail, 'S' score, 'R' rubric, 'C' comment-only.
const TYPE_PASS_FAIL = 'P';
const TYPE_SCORE = 'S';
const TYPE_RUBRIC = 'R';

export default function FillProgressReportScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { id: classId, reportId, resultId, studentId, readonly } = useLocalSearchParams();

    const isReadonly = readonly === '1' || readonly === 'true';
    const isEditMode = Boolean(resultId);

    const [staff, setStaff] = useState(null);
    const [template, setTemplate] = useState(null);
    const [students, setStudents] = useState([]);

    const [formStudentId, setFormStudentId] = useState(studentId ? Number(studentId) : null);
    const [generalComment, setGeneralComment] = useState('');
    const [outcomes, setOutcomes] = useState({}); // { [assessment_id]: { passed?, score?, rubric_selection?, comment? } }
    // Whether the result we loaded was already completed. Web only locks the
    // student picker when a result is *completed*; drafts can still be
    // re-targeted to a different student.
    const [loadedCompleted, setLoadedCompleted] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const [picker, setPicker] = useState(null); // { type: 'student' | 'assessment', assessment? }
    const [toast, setToast] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                setIsLoading(true);
                setError('');
                const [staffJson, tpl, classStudents, result] = await Promise.all([
                    AsyncStorage.getItem('staff'),
                    api.getProgressReportTemplate(reportId),
                    api.getClassStudents(classId, { all: 'true', scope: 'linked' }).catch(() => null),
                    resultId ? api.getProgressReportResult(resultId) : Promise.resolve(null),
                ]);

                try { setStaff(staffJson ? JSON.parse(staffJson) : null); } catch { setStaff(null); }
                setTemplate(tpl?.data || tpl);

                const list =
                    classStudents?.students ||
                    classStudents?.data ||
                    classStudents?.clients ||
                    classStudents ||
                    [];
                setStudents(Array.isArray(list) ? list : []);

                const r = result?.data || result;
                if (r) {
                    setFormStudentId(r.client_id);
                    setLoadedCompleted(Boolean(r.completed));
                    setGeneralComment(r.comment || '');
                    const map = {};
                    for (const o of r.outcomes || []) {
                        map[o.assessment_id] = {
                            passed: o.passed ?? null,
                            score: o.score ?? null,
                            rubric_selection: o.rubric_selection ?? null,
                            comment: o.comment ?? '',
                        };
                    }
                    setOutcomes(map);
                }
            } catch (err) {
                console.error('Fill load error', err);
                setError(err.body?.message || err.message || 'Failed to load progress report.');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [classId, reportId, resultId]);

    // Flatten all assessments in display order (ungrouped first, then each group).
    // The web app uses `tableRows` to render mixed group headers / single rows.
    const rows = useMemo(() => {
        if (!template) return [];
        const rs = [];
        for (const a of template.assessments || []) {
            rs.push({ type: 'single', assessment: a, key: `a-${a.id}` });
        }
        for (const g of template.item_groups || []) {
            rs.push({ type: 'group', group: g, key: `g-${g.id}` });
            for (const a of g.assessments || []) {
                rs.push({ type: 'single', assessment: a, group: g, key: `a-${a.id}` });
            }
        }
        return rs;
    }, [template]);

    const selectedStudent = useMemo(
        () => students.find((s) => Number(s.id ?? s.client_id) === Number(formStudentId)),
        [students, formStudentId]
    );

    const setOutcome = (assessmentId, patch) => {
        setOutcomes((prev) => ({
            ...prev,
            [assessmentId]: { ...(prev[assessmentId] || {}), ...patch },
        }));
    };

    const save = async (asCompleted) => {
        // The save buttons are disabled when these conditions fail, but we
        // still defensively guard here in case the disabled-state ever
        // regresses or is bypassed.
        if (!formStudentId) {
            setToast({ message: 'Please select a student first.', variant: 'error' });
            return;
        }
        if (!staff?.id) {
            setToast({ message: 'Profile not loaded. Please sign in again.', variant: 'error' });
            return;
        }
        // Strip empty outcomes (no input AND no comment) so we don't persist noise.
        const cleaned = {};
        for (const [aid, v] of Object.entries(outcomes)) {
            const hasInput =
                v.passed !== null && v.passed !== undefined ||
                (v.score !== null && v.score !== undefined && v.score !== '') ||
                (v.rubric_selection !== null && v.rubric_selection !== undefined) ||
                (v.comment && String(v.comment).trim() !== '');
            if (hasInput) cleaned[aid] = { ...v, assessment_id: Number(aid) };
        }

        const payload = {
            report_id: Number(reportId),
            client_id: Number(formStudentId),
            class_id: Number(classId),
            staff_id: staff.id,
            comment: generalComment || null,
            completed: Boolean(asCompleted),
            assessment_results: cleaned,
        };

        try {
            setIsSaving(true);
            if (isEditMode) {
                await api.updateProgressReportResult(resultId, payload);
            } else {
                await api.storeProgressReportResult(payload);
            }
            // Show success briefly, then go back. Using a short delay so the
            // user can see the confirmation on screens where navigation is
            // instant.
            setToast({ message: asCompleted ? 'Saved & completed' : 'Draft saved', variant: 'success' });
            setTimeout(() => router.back(), 700);
        } catch (err) {
            console.error('Save progress report error', err);
            setToast({
                message: err.body?.message || err.message || 'Could not save the report.',
                variant: 'error',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const onDelete = () => {
        if (!isEditMode) return;
        setConfirmDelete(true);
    };

    const doDelete = async () => {
        try {
            setIsSaving(true);
            await api.deleteProgressReportResult(resultId);
            setConfirmDelete(false);
            setToast({ message: 'Result deleted', variant: 'success' });
            setTimeout(() => router.back(), 600);
        } catch (err) {
            setConfirmDelete(false);
            setToast({
                message: err.body?.message || err.message || 'Could not delete.',
                variant: 'error',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {template?.title || 'Report'}
                        </Text>
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                            {isReadonly ? 'View' : isEditMode ? 'Edit' : 'New assessment'}
                        </Text>
                    </View>
                    {isEditMode && !isReadonly ? (
                        <TouchableOpacity onPress={onDelete} style={styles.iconBtn} disabled={isSaving}>
                            <Ionicons name="trash-outline" size={20} color={colors.error || '#ef4444'} />
                        </TouchableOpacity>
                    ) : null}
                </View>

                <ScrollView contentContainerStyle={styles.body}>
                    {/* Student picker — locked when read-only or when editing a
                        result that's already been marked completed. Drafts
                        remain re-targetable, matching the web behaviour. */}
                    <Label colors={colors}>Student</Label>
                    <TouchableOpacity
                        onPress={() => {
                            if (isReadonly || (isEditMode && loadedCompleted)) return;
                            setPicker({ type: 'student' });
                        }}
                        activeOpacity={0.8}
                        disabled={isReadonly || (isEditMode && loadedCompleted)}
                        style={[styles.fieldBtn, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                    >
                        {selectedStudent ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <Avatar
                                    uri={selectedStudent.list_photo || selectedStudent.photo}
                                    name={selectedStudent.name || `${selectedStudent.fname || ''} ${selectedStudent.sname || ''}`}
                                    size={28}
                                />
                                <Text style={[styles.fieldText, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {selectedStudent.name ||
                                        `${selectedStudent.fname || ''} ${selectedStudent.sname || ''}`.trim()}
                                </Text>
                            </View>
                        ) : (
                            <Text style={[styles.fieldPlaceholder, { color: colors.textSecondary }]}>
                                Select a student…
                            </Text>
                        )}
                        {!isReadonly && !(isEditMode && loadedCompleted) ? (
                            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                        ) : null}
                    </TouchableOpacity>

                    {/* General comment */}
                    <Label colors={colors} style={{ marginTop: 16 }}>General comments</Label>
                    <TextInput
                        value={generalComment}
                        onChangeText={setGeneralComment}
                        editable={!isReadonly}
                        placeholder="Add a general comment…"
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        style={[styles.textarea, {
                            borderColor: colors.border,
                            backgroundColor: colors.cardBackground,
                            color: colors.textPrimary,
                        }]}
                    />

                    {/* Assessment rows */}
                    <Label colors={colors} style={{ marginTop: 16 }}>Assessments</Label>
                    <View style={{ gap: 8 }}>
                        {rows.length === 0 ? (
                            <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                This template has no assessment items.
                            </Text>
                        ) : (
                            rows.map((row) => {
                                if (row.type === 'group') {
                                    return (
                                        <View key={row.key} style={{ marginTop: 8 }}>
                                            <Text style={[styles.groupTitle, { color: colors.textPrimary }]}>
                                                {row.group.label}
                                            </Text>
                                            {row.group.description ? (
                                                <Text style={[styles.groupDesc, { color: colors.textSecondary }]}>
                                                    {row.group.description}
                                                </Text>
                                            ) : null}
                                        </View>
                                    );
                                }
                                const a = row.assessment;
                                const value = outcomes[a.id] || {};
                                return (
                                    <AssessmentItem
                                        key={row.key}
                                        assessment={a}
                                        value={value}
                                        disabled={isReadonly || !formStudentId}
                                        onChange={(patch) => setOutcome(a.id, patch)}
                                        onOpenComment={() => setPicker({ type: 'comment', assessment: a })}
                                        onOpenRubric={() => setPicker({ type: 'rubric', assessment: a })}
                                        onOpenScore={() => setPicker({ type: 'score', assessment: a })}
                                        colors={colors}
                                    />
                                );
                            })
                        )}
                    </View>
                </ScrollView>

                {/* Save bar — hidden while a picker is open so the bottom-sheet
                    can sit flush against the screen bottom instead of stacking
                    above the buttons. */}
                {!isReadonly && !picker ? (
                    <View style={[
                        styles.saveBar,
                        {
                            borderTopColor: colors.border,
                            backgroundColor: colors.background,
                            paddingBottom: 12 + (insets.bottom || 0),
                        },
                    ]}>
                        {!formStudentId ? (
                            <Text style={[styles.saveHint, { color: colors.textSecondary }]}>
                                Select a student to enable saving
                            </Text>
                        ) : null}
                        <View style={styles.saveBtnRow}>
                            <TouchableOpacity
                                onPress={() => save(false)}
                                disabled={isSaving || !formStudentId}
                                style={[
                                    styles.btnSecondary,
                                    {
                                        borderColor: colors.border,
                                        backgroundColor: colors.cardBackground,
                                        opacity: (!formStudentId || isSaving) ? 0.5 : 1,
                                    },
                                ]}
                            >
                                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Save draft</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => save(true)}
                                disabled={isSaving || !formStudentId}
                                style={[
                                    styles.btnPrimary,
                                    {
                                        backgroundColor: colors.primary,
                                        opacity: (!formStudentId || isSaving) ? 0.5 : 1,
                                    },
                                ]}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: '700' }}>Save & complete</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}
            </KeyboardAvoidingView>

            {/* Pickers */}
            <PickerModal
                visible={!!picker}
                onClose={() => setPicker(null)}
                colors={colors}
            >
                {picker?.type === 'student' ? (
                    <StudentPicker
                        students={students}
                        selected={formStudentId}
                        onSelect={(id) => { setFormStudentId(id); setPicker(null); }}
                        colors={colors}
                    />
                ) : null}
                {picker?.type === 'rubric' ? (
                    <RubricPicker
                        assessment={picker.assessment}
                        value={outcomes[picker.assessment.id] || {}}
                        onSave={(patch) => { setOutcome(picker.assessment.id, patch); setPicker(null); }}
                        colors={colors}
                    />
                ) : null}
                {picker?.type === 'score' ? (
                    <ScorePicker
                        assessment={picker.assessment}
                        value={outcomes[picker.assessment.id] || {}}
                        onSave={(patch) => { setOutcome(picker.assessment.id, patch); setPicker(null); }}
                        colors={colors}
                    />
                ) : null}
                {picker?.type === 'comment' ? (
                    <CommentPicker
                        assessment={picker.assessment}
                        value={outcomes[picker.assessment.id] || {}}
                        onSave={(patch) => { setOutcome(picker.assessment.id, patch); setPicker(null); }}
                        colors={colors}
                    />
                ) : null}
            </PickerModal>

            <ConfirmDialog
                visible={confirmDelete}
                title="Delete result?"
                message="This will remove all answers for this student. This cannot be undone."
                confirmLabel="Delete"
                destructive
                busy={isSaving}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={doDelete}
            />

            <Toast toast={toast} onHide={() => setToast(null)} />
        </SafeAreaView>
    );
}

function Label({ children, colors, style }) {
    return (
        <Text style={[styles.label, { color: colors.textSecondary }, style]}>{children}</Text>
    );
}

function AssessmentItem({ assessment, value, disabled, onChange, onOpenComment, onOpenRubric, onOpenScore, colors }) {
    const t = assessment.type;

    const renderValue = () => {
        if (t === TYPE_PASS_FAIL) {
            return (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[
                        { v: true, label: 'Pass', good: true },
                        { v: false, label: 'Fail', good: false },
                    ].map((opt) => {
                        const selected = value.passed === opt.v;
                        const accent = opt.good ? (colors.success || colors.primary) : (colors.error || '#ef4444');
                        return (
                            <TouchableOpacity
                                key={opt.label}
                                disabled={disabled}
                                onPress={() => onChange({ passed: selected ? null : opt.v })}
                                style={[styles.pill, {
                                    borderColor: selected ? accent : colors.border,
                                    backgroundColor: selected ? accent + '22' : 'transparent',
                                }]}
                            >
                                <Text style={{ color: selected ? accent : colors.textPrimary, fontWeight: '600', fontSize: 12 }}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            );
        }
        if (t === TYPE_SCORE) {
            const max = assessment.max_value || 100;
            const score = value.score;
            const empty = score === null || score === undefined || score === '';
            return (
                <TouchableOpacity disabled={disabled} onPress={onOpenScore} style={[styles.pill, { borderColor: colors.border }]}>
                    <Text style={{ color: empty ? colors.textSecondary : colors.textPrimary, fontWeight: '600', fontSize: 12 }}>
                        {empty ? 'Set score' : `${score} / ${max}`}
                    </Text>
                </TouchableOpacity>
            );
        }
        if (t === TYPE_RUBRIC) {
            const selected = (assessment.rubrics || []).find((r) => r.id === value.rubric_selection);
            const dot = selected?.color?.light?.background || selected?.color?.dark?.background || '#9ca3af';
            return (
                <TouchableOpacity disabled={disabled} onPress={onOpenRubric} style={[styles.pill, { borderColor: colors.border, flexDirection: 'row', gap: 6 }]}>
                    {selected ? (
                        <>
                            <View style={[styles.dot, { backgroundColor: dot }]} />
                            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 12 }}>{selected.label}</Text>
                        </>
                    ) : (
                        <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 12 }}>Choose…</Text>
                    )}
                </TouchableOpacity>
            );
        }
        return null;
    };

    return (
        <View style={[styles.assessmentCard, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.assessmentLabel, { color: colors.textPrimary }]}>
                    {assessment.label}
                    {assessment.required ? <Text style={{ color: colors.error || '#ef4444' }}> *</Text> : null}
                </Text>
                {assessment.description ? (
                    <Text style={[styles.assessmentDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                        {assessment.description}
                    </Text>
                ) : null}
                {value.comment ? (
                    <View style={[styles.commentBubble, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '44' }]}>
                        <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.primary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1 }} numberOfLines={3}>
                            {value.comment}
                        </Text>
                    </View>
                ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {renderValue()}
                <TouchableOpacity disabled={disabled} onPress={onOpenComment}>
                    <Ionicons
                        name={value.comment ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                        size={18}
                        color={value.comment ? colors.primary : colors.textSecondary}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

function PickerModal({ visible, onClose, children, colors }) {
    const insets = useSafeAreaInsets();
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            hardwareAccelerated
            onRequestClose={onClose}
        >
            {/* Outer wrapper paints the entire screen with the scrim and aligns
                the sheet to the bottom edge. */}
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={onClose}
                    style={{ flex: 1 }}
                />
                {/* The sheet itself. flexShrink + a fixed maxHeight keeps it
                    capped, while `paddingBottom = inset` paints the
                    cardBackground through the home-indicator zone so there's
                    no black strip below it on real devices. */}
                <View style={{
                    backgroundColor: colors.cardBackground,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    paddingTop: 8,
                    paddingBottom: (insets.bottom || 0) + 8,
                    maxHeight: '85%',
                }}>
                    <View style={{
                        alignSelf: 'center',
                        width: 36, height: 4, borderRadius: 2,
                        backgroundColor: colors.border, marginBottom: 12,
                    }} />
                    {children}
                </View>
            </View>
        </Modal>
    );
}

function StudentPicker({ students, selected, onSelect, colors }) {
    const [q, setQ] = useState('');
    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return students;
        return students.filter((s) => {
            const name = s.name || `${s.fname || ''} ${s.sname || ''}`.trim();
            return name.toLowerCase().includes(term);
        });
    }, [students, q]);

    return (
        <View style={{ paddingHorizontal: 16, flexShrink: 1 }}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Select student</Text>
            <View style={[styles.searchWrap, { borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                <TextInput
                    value={q}
                    onChangeText={setQ}
                    placeholder="Search…"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                />
            </View>
            <ScrollView style={{ flexShrink: 1 }}>
                {filtered.map((s) => {
                    const id = s.id ?? s.client_id;
                    const name = s.name || `${s.fname || ''} ${s.sname || ''}`.trim();
                    const isSel = Number(id) === Number(selected);
                    return (
                        <TouchableOpacity
                            key={id}
                            onPress={() => onSelect(id)}
                            style={[styles.pickerRow, { borderColor: colors.border }]}
                        >
                            <Avatar uri={s.list_photo || s.photo} name={name} size={32} />
                            <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '600' }} numberOfLines={1}>
                                {name}
                            </Text>
                            {isSel ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                        </TouchableOpacity>
                    );
                })}
                {filtered.length === 0 ? (
                    <Text style={[styles.empty, { color: colors.textSecondary, paddingVertical: 16 }]}>
                        No students found.
                    </Text>
                ) : null}
            </ScrollView>
        </View>
    );
}

function RubricPicker({ assessment, value, onSave, colors }) {
    const [selected, setSelected] = useState(value.rubric_selection || null);
    const [comment, setComment] = useState(value.comment || '');
    // Sort by the rubric `sort` column so options render in the intended order
    // (e.g. Beginning → Developing → Proficient → Excellent). Web does the
    // same in RubricAssessmentDialog.vue.
    const sortedRubrics = useMemo(
        () => [...(assessment.rubrics || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
        [assessment]
    );
    return (
        <View style={{ paddingHorizontal: 16 }}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>{assessment.label}</Text>
            <ScrollView style={{ flexShrink: 1, maxHeight: 280 }}>
                {sortedRubrics.map((r) => {
                    const dot = r.color?.light?.background || r.color?.dark?.background || '#9ca3af';
                    const isSel = selected === r.id;
                    return (
                        <TouchableOpacity
                            key={r.id}
                            onPress={() => setSelected(isSel ? null : r.id)}
                            style={[styles.rubricRow, {
                                borderColor: isSel ? colors.primary : colors.border,
                                backgroundColor: isSel ? colors.primary + '14' : 'transparent',
                            }]}
                        >
                            <View style={[styles.dot, { backgroundColor: dot, width: 12, height: 12 }]} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{r.label}</Text>
                                {r.description ? (
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
                                        {r.description}
                                    </Text>
                                ) : null}
                            </View>
                            {isSel ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
            <Label colors={colors} style={{ marginTop: 12 }}>Comment (optional)</Label>
            <TextInput
                value={comment}
                onChangeText={setComment}
                multiline
                placeholder="Add a comment…"
                placeholderTextColor={colors.textSecondary}
                style={[styles.textarea, { borderColor: colors.border, color: colors.textPrimary }]}
            />
            <TouchableOpacity
                onPress={() => onSave({ rubric_selection: selected, comment })}
                style={[styles.modalSave, { backgroundColor: colors.primary }]}
            >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
        </View>
    );
}

function ScorePicker({ assessment, value, onSave, colors }) {
    const max = assessment.max_value || 100;
    const [score, setScore] = useState(
        value.score !== null && value.score !== undefined ? String(value.score) : ''
    );
    const [comment, setComment] = useState(value.comment || '');

    // Strip non-digits and clamp to [0, max] so we never save out-of-range
    // values — matches the web ScoreAssessmentDialog clamping behaviour.
    const onScoreChange = (t) => {
        const cleaned = t.replace(/[^0-9.]/g, '');
        if (cleaned === '') {
            setScore('');
            return;
        }
        const num = Number(cleaned);
        if (Number.isNaN(num)) return;
        if (num > max) {
            setScore(String(max));
        } else if (num < 0) {
            setScore('0');
        } else {
            setScore(cleaned);
        }
    };

    const onSavePress = () => {
        if (score === '') {
            onSave({ score: null, comment });
            return;
        }
        const num = Number(score);
        const clamped = Number.isNaN(num) ? null : Math.max(0, Math.min(max, num));
        onSave({ score: clamped, comment });
    };

    return (
        <View style={{ paddingHorizontal: 16 }}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>{assessment.label}</Text>
            <Label colors={colors}>Score (out of {max})</Label>
            <TextInput
                value={score}
                onChangeText={onScoreChange}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            />
            <Label colors={colors} style={{ marginTop: 12 }}>Comment (optional)</Label>
            <TextInput
                value={comment}
                onChangeText={setComment}
                multiline
                placeholder="Add a comment…"
                placeholderTextColor={colors.textSecondary}
                style={[styles.textarea, { borderColor: colors.border, color: colors.textPrimary }]}
            />
            <TouchableOpacity
                onPress={onSavePress}
                style={[styles.modalSave, { backgroundColor: colors.primary }]}
            >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
        </View>
    );
}

function CommentPicker({ assessment, value, onSave, colors }) {
    const [comment, setComment] = useState(value.comment || '');
    return (
        <View style={{ paddingHorizontal: 16 }}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>{assessment.label}</Text>
            <TextInput
                value={comment}
                onChangeText={setComment}
                multiline
                autoFocus
                placeholder="Type your comment…"
                placeholderTextColor={colors.textSecondary}
                style={[styles.textarea, { borderColor: colors.border, color: colors.textPrimary, minHeight: 120 }]}
            />
            <TouchableOpacity
                onPress={() => onSave({ comment })}
                style={[styles.modalSave, { backgroundColor: colors.primary }]}
            >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
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
    iconBtn: { padding: 8, borderRadius: 999 },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 2 },
    body: { padding: 16, paddingBottom: 96, gap: 4 },
    label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    fieldBtn: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderRadius: 10, padding: 12, gap: 8,
    },
    fieldText: { fontSize: 14, fontWeight: '600' },
    fieldPlaceholder: { fontSize: 14, flex: 1 },
    input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
    textarea: {
        borderWidth: 1, borderRadius: 10, padding: 12,
        fontSize: 14, minHeight: 70, textAlignVertical: 'top',
    },
    groupTitle: { fontSize: 14, fontWeight: '700' },
    groupDesc: { fontSize: 12, marginTop: 2 },
    assessmentCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        borderWidth: 1, borderRadius: 12, padding: 12,
    },
    assessmentLabel: { fontSize: 13, fontWeight: '700' },
    assessmentDesc: { fontSize: 11 },
    pill: {
        paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    commentBubble: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderRadius: 8, padding: 6,
    },
    saveBar: {
        padding: 12, borderTopWidth: 1,
        gap: 8,
    },
    saveBtnRow: {
        flexDirection: 'row', gap: 8,
    },
    saveHint: {
        fontSize: 12, textAlign: 'center', fontStyle: 'italic',
    },
    btnSecondary: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderRadius: 10, paddingVertical: 12,
    },
    btnPrimary: {
        flex: 1.4, alignItems: 'center', justifyContent: 'center',
        borderRadius: 10, paddingVertical: 12,
    },
    pickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
    },
    searchInput: { flex: 1, paddingVertical: 0 },
    pickerRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderBottomWidth: 1, paddingVertical: 10,
    },
    rubricRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6,
    },
    modalSave: {
        marginTop: 16, padding: 12, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
