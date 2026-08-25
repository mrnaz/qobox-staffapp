import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Pressable,
    Modal,
    FlatList,
    ActivityIndicator,
    Alert,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from './Avatar';
import Card from './Card';
import { iconColor } from '../utils/iconColors';

// Daily attendance marking modal — mobile counterpart of the staff web
// DailyAttendanceMarkingDialog.vue. The scope/course selector is ported —
// students are scoped server-side to the courses/classes the staff member
// teaches or assists. The per-student advanced editor (notes/arrived/departed)
// on the web is not ported yet; users can mark statuses, search, see counts,
// and submit.

const STATUS_META = {
    present: { label: 'Present',  menuLabel: 'Present',      icon: 'checkbox' },
    absent:  { label: 'Absent',   menuLabel: 'Absent',       icon: 'close-circle' },
    late:    { label: 'Late',     menuLabel: 'Arrived Late', icon: 'time' },
    left:    { label: 'Left',     menuLabel: 'Left Early',   icon: 'exit' },
    notset:  { label: 'Unmarked', menuLabel: 'Unmarked',     icon: 'square-outline' },
};

// Resolve each status to one of the app's standard theme tokens (instead of the
// old hardcoded hex) so the chips/icons match the rest of the UI and light/dark.
const statusColor = (colors, status) => ({
    present: colors.success,
    absent:  colors.error,
    late:    colors.warning,
    left:    colors.info,
    notset:  colors.textDisabled,
}[status] || colors.textSecondary);

// Order shown in the picker — matches the web AttendanceStatusSelector.
const SELECTOR_ORDER = ['present', 'absent', 'late', 'left', 'notset'];

const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
};

export default function DailyAttendanceModal({
    visible,
    date,
    academicPeriodId,
    siteId,
    attendanceId: initialAttendanceId, // may be null when no record exists yet
    canSubmit,
    onClose,
    onSaved,
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const insets = useSafeAreaInsets();

    const [students, setStudents] = useState([]);
    const [statusMap, setStatusMap] = useState({}); // clientId → 'present'|'absent'|...
    const [attendanceId, setAttendanceId] = useState(initialAttendanceId || null);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [staffId, setStaffId] = useState(null);
    const [abilities, setAbilities] = useState([]);
    const [filterStatus, setFilterStatus] = useState(null); // 'present'|'absent'|'late'|'left'|'notset'|null
    const [selectorStudent, setSelectorStudent] = useState(null); // student whose status picker is open
    const [anchor, setAnchor] = useState(null); // { top, left, width } screen position of the popup
    const [scopeOptions, setScopeOptions] = useState([]); // [{ label, value, id, type }]
    const [selectedScope, setSelectedScope] = useState(null); // one entry from scopeOptions, or null (all)
    const [isGlobalAttendance, setIsGlobalAttendance] = useState(false);
    const [scopesError, setScopesError] = useState('');
    const [isScopePickerOpen, setIsScopePickerOpen] = useState(false);

    useEffect(() => {
        (async () => {
            const [staffJson, abilitiesJson] = await Promise.all([
                AsyncStorage.getItem('staff'),
                AsyncStorage.getItem('abilities'),
            ]);
            try { setStaffId(staffJson ? JSON.parse(staffJson)?.id : null); } catch { setStaffId(null); }
            try {
                const parsed = abilitiesJson ? JSON.parse(abilitiesJson) : [];
                setAbilities(Array.isArray(parsed) ? parsed : []);
            } catch { setAbilities([]); }
        })();
    }, []);

    // Mirror the web DailyAttendanceMarkingDialog: only staff who can manage
    // students see the Submit button. Sysadmins implicitly have all abilities.
    const canManageAttendance =
        abilities.includes('manage_students') || abilities.includes('sysadmin');

    useEffect(() => {
        setAttendanceId(initialAttendanceId || null);
    }, [initialAttendanceId]);

    const loadData = useCallback(async () => {
        if (!visible) return;
        setIsLoading(true);
        setError('');

        // Scopes failing must never block or blank the student list — it only
        // means the selector can't be shown, so it gets its own try/catch and
        // never rejects out of loadData.
        try {
            const scopesRes = await api.getDailyAttendanceScopes({
                period_id: academicPeriodId,
                site_id: siteId,
            });
            const courseOptions = (scopesRes?.courses || []).map((c) => ({
                label: c.title,
                value: `course_${c.id}`,
                id: c.id,
                type: 'course',
            }));
            const classOptions = (scopesRes?.classes || []).map((c) => ({
                label: c.title,
                value: `class_${c.id}`,
                id: c.id,
                type: 'class',
            }));
            courseOptions.sort((a, b) => a.label.localeCompare(b.label));
            classOptions.sort((a, b) => a.label.localeCompare(b.label));
            setScopeOptions([...courseOptions, ...classOptions]);
            setIsGlobalAttendance(!!scopesRes?.is_global);
            setScopesError('');
        } catch (err) {
            console.error('Daily attendance scopes load error', err);
            setScopeOptions([]);
            setIsGlobalAttendance(false);
            setScopesError(err.body?.message || err.message || 'Could not load your courses and classes.');
        }

        try {
            const params = {
                period_id: academicPeriodId,
                site_id: siteId,
                limit: 2000,
            };
            if (attendanceId) params.report_id = attendanceId;
            if (selectedScope?.type === 'course') params.course_id = selectedScope.id;
            else if (selectedScope?.type === 'class') params.class_id = selectedScope.id;

            const studentsRes = await api.getDailyAttendanceStudents(params);
            const studentList = Array.isArray(studentsRes?.students) ? studentsRes.students : [];
            setStudents(studentList);

            const map = {};
            studentList.forEach((s) => {
                const clientId = s.id || s.client_id;
                if (clientId && s.status) map[String(clientId)] = s.status;
            });
            setStatusMap(map);
        } catch (err) {
            console.error('Daily attendance modal load error', err);
            // Clear the roster and its derived counts too — otherwise the summary
            // bar keeps showing the previous (possibly differently-scoped) numbers
            // right above an error message that contradicts them.
            setStudents([]);
            setStatusMap({});
            setError(err.body?.message || err.message || 'Failed to load students.');
        } finally {
            setIsLoading(false);
        }
    }, [visible, academicPeriodId, siteId, attendanceId, selectedScope]);

    useEffect(() => {
        if (visible) loadData();
        if (!visible) {
            setSearch('');
            setFilterStatus(null);
            setIsScopePickerOpen(false);
            // Unlike search/filterStatus this isn't just view state: a stuck scope
            // silently narrows both the roster and the summary counts on the next
            // day's report, and Submit finalises the whole day, not just what's
            // visible. This component stays mounted across opens, so it must be
            // reset explicitly on close rather than freshly initialized each time.
            setSelectedScope(null);
        }
    }, [visible, loadData]);

    const ensureAttendance = async () => {
        if (attendanceId) return attendanceId;
        const res = await api.createDailyAttendance({
            date,
            period_id: academicPeriodId,
            staff_id: staffId,
            site_id: siteId,
        });
        const newId =
            res?.id ?? res?.attendanceId ?? res?.attendance_id ?? res?.original?.id ?? null;
        if (!newId) throw new Error('Could not create attendance record.');
        setAttendanceId(newId);
        return newId;
    };

    const openSelector = (student, e) => {
        const { pageX, pageY } = e.nativeEvent;
        const { width, height } = Dimensions.get('window');
        const POPUP_W = 230;
        const POPUP_H = 5 * 46 + 12; // 5 rows + vertical padding
        let left = pageX - POPUP_W + 24; // hang off the right side, near the tapped pill
        left = Math.max(12, Math.min(left, width - POPUP_W - 12));
        let top = pageY + 14; // open just below the tap
        if (top + POPUP_H > height - 16) top = Math.max(48, pageY - POPUP_H - 8); // flip up near the bottom
        setAnchor({ top, left, width: POPUP_W });
        setSelectorStudent(student);
    };

    const handleSelectStatus = async (status) => {
        const student = selectorStudent;
        setSelectorStudent(null);
        if (!student) return;
        const clientId = student.id || student.client_id;
        const cur = statusMap[String(clientId)] || 'notset';
        if (status === cur) return; // already set — nothing to do
        const previous = { ...statusMap };
        setStatusMap((prev) => ({ ...prev, [String(clientId)]: status }));
        try {
            const aid = await ensureAttendance();
            const res = await api.toggleDailyAttendance({
                attendance_id: aid,
                client_id: clientId,
                staff_id: staffId,
                reporter_id: staffId,
                status,
            });
            const serverStatus = res?.status ?? status;
            setStatusMap((prev) => {
                const copy = { ...prev };
                if (serverStatus === null) delete copy[String(clientId)];
                else copy[String(clientId)] = serverStatus;
                return copy;
            });
        } catch (err) {
            console.error('Set attendance status error', err);
            setStatusMap(previous);
            Alert.alert('Could not update', err.body?.message || err.message || 'Please try again.');
        }
    };

    const handleSubmit = async () => {
        if (!attendanceId) {
            Alert.alert('Nothing to submit', 'Mark at least one student first.');
            return;
        }
        try {
            setIsSubmitting(true);
            await api.submitDailyAttendance({
                attendance_id: attendanceId,
                reporter_id: staffId,
            });
            onSaved?.({ attendanceId, date });
            onClose?.();
        } catch (err) {
            console.error('Submit attendance error', err);
            Alert.alert('Submit failed', err.body?.message || err.message || 'Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const counts = useMemo(() => {
        const c = { present: 0, absent: 0, late: 0, left: 0, notset: 0 };
        const total = students.length;
        Object.values(statusMap).forEach((s) => {
            if (c[s] !== undefined) c[s] += 1;
        });
        c.notset = Math.max(0, total - (c.present + c.absent + c.late + c.left));
        return c;
    }, [statusMap, students.length]);

    const visibleStudents = useMemo(() => {
        const q = search.trim().toLowerCase();
        return students.filter((s) => {
            const name = `${s.fname || ''} ${s.sname || ''}`.toLowerCase();
            if (q && !name.includes(q)) return false;
            if (filterStatus) {
                const cur = statusMap[String(s.id || s.client_id)] || 'notset';
                if (cur !== filterStatus) return false;
            }
            return true;
        });
    }, [students, search, filterStatus, statusMap]);

    const renderItem = ({ item }) => {
        const clientId = item.id || item.client_id;
        const status = statusMap[String(clientId)] || 'notset';
        const meta = STATUS_META[status];
        const sColor = statusColor(colors, status);
        return (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <Avatar
                    uri={item.list_photo || item.photo || null}
                    name={`${item.fname || ''} ${item.sname || ''}`}
                    id={clientId}
                    size={40}
                />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.fname} {item.sname}
                    </Text>
                    {item.class ? (
                        <Text style={[styles.subline, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.class}
                        </Text>
                    ) : null}
                </View>
                <TouchableOpacity
                    onPress={(e) => openSelector(item, e)}
                    style={[styles.statusPill, { borderColor: sColor, backgroundColor: sColor + '22' }]}
                >
                    <Ionicons name={meta.icon} size={16} color={sColor} />
                    <Text style={[styles.statusLabel, { color: sColor }]}>{meta.label}</Text>
                    <Ionicons name="chevron-down" size={12} color={sColor} />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: 12 + insets.top }]}>
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>Daily attendance</Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {fmtDate(date)}
                        </Text>
                    </View>
                </View>

                {/* Summary — all 5 totals in one box, one line */}
                <View style={styles.summaryWrap}>
                    <Card style={styles.summaryBox}>
                        {['present', 'absent', 'late', 'left', 'notset'].map((key) => {
                            const meta = STATUS_META[key];
                            const sColor = statusColor(colors, key);
                            const active = filterStatus === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    onPress={() => setFilterStatus(active ? null : key)}
                                    style={[styles.summaryItem, active && { backgroundColor: sColor + '14' }]}
                                >
                                    <Ionicons name={meta.icon} size={14} color={sColor} />
                                    <Text style={[styles.summaryCount, { color: colors.textPrimary }]}>
                                        {counts[key]}
                                    </Text>
                                    <Text
                                        style={[styles.summaryLabel, { color: colors.textSecondary }]}
                                        numberOfLines={1}
                                    >
                                        {meta.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </Card>
                </View>

                {/* Scope selector — shown when there's a choice to make, or a stale
                    selection to clear even if a later scopes reload failed. */}
                {(scopeOptions.length > 0 || selectedScope) ? (
                    <View style={styles.scopeWrap}>
                        <TouchableOpacity
                            onPress={() => setIsScopePickerOpen(true)}
                            style={[styles.scopeTrigger, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}
                        >
                            <Ionicons name="funnel-outline" size={16} color={colors.textSecondary} />
                            <Text
                                style={[styles.scopeTriggerLabel, { color: selectedScope ? colors.textPrimary : colors.textSecondary }]}
                                numberOfLines={1}
                            >
                                {selectedScope ? selectedScope.label : 'All my courses and classes'}
                            </Text>
                            {selectedScope ? (
                                <TouchableOpacity
                                    onPress={() => setSelectedScope(null)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                                </TouchableOpacity>
                            ) : (
                                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                            )}
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Search */}
                <View style={styles.searchWrap}>
                    <View style={[styles.searchBox, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}>
                        <Ionicons name="search" size={16} color={colors.textSecondary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.textPrimary }]}
                            placeholder="Search by student name"
                            placeholderTextColor={colors.textSecondary}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {search ? (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Student list */}
                {isLoading && students.length === 0 ? (
                    <View style={styles.center}>
                        <ActivityIndicator color={colors.primary} />
                    </View>
                ) : error ? (
                    <View style={styles.center}>
                        <Ionicons name="alert-circle-outline" size={32} color={iconColor('alert-circle-outline', colors)} />
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                        <TouchableOpacity onPress={loadData} style={[styles.retry, { borderColor: colors.primary }]}>
                            <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={visibleStudents}
                        keyExtractor={(it, i) => String(it.id || it.client_id || i)}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={
                            scopesError ? (
                                <View style={styles.center}>
                                    <Ionicons name="alert-circle-outline" size={32} color={iconColor('alert-circle-outline', colors)} />
                                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                        {scopesError}
                                    </Text>
                                    <TouchableOpacity onPress={loadData} style={[styles.retry, { borderColor: colors.primary }]}>
                                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : scopeOptions.length === 0 && !isGlobalAttendance ? (
                                <View style={styles.center}>
                                    <Ionicons name="school-outline" size={32} color={iconColor('school-outline', colors)} />
                                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                        You are not assigned as a teacher or assistant to any course or class.
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.center}>
                                    <Ionicons name="people-outline" size={32} color={iconColor('people-outline', colors)} />
                                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                        {search || filterStatus ? 'No students match your filter.' : 'No students found.'}
                                    </Text>
                                </View>
                            )
                        }
                    />
                )}

                {/* Footer */}
                <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: 12 + insets.bottom }]}>
                    {canSubmit && canManageAttendance ? (
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={isSubmitting || !attendanceId}
                            style={[styles.btn, {
                                backgroundColor: colors.primary,
                                opacity: (isSubmitting || !attendanceId) ? 0.5 : 1,
                                flex: 1,
                            }]}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.btnText}>Submit attendance</Text>
                            )}
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                        onPress={onClose}
                        disabled={isSubmitting}
                        style={[styles.btnOutline, { borderColor: colors.borderStrong || colors.border, flex: (canSubmit && canManageAttendance) ? 0.5 : 1 }]}
                    >
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Close</Text>
                    </TouchableOpacity>
                </View>

                {/* Status picker — small popup anchored at the tapped pill, web dropdown parity */}
                <Modal
                    visible={!!selectorStudent}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setSelectorStudent(null)}
                >
                    <Pressable style={{ flex: 1 }} onPress={() => setSelectorStudent(null)}>
                        {anchor ? (
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => {}}
                                style={[styles.popup, {
                                    top: anchor.top,
                                    left: anchor.left,
                                    width: anchor.width,
                                    backgroundColor: colors.cardBackground,
                                    borderColor: colors.border,
                                }]}
                            >
                                {SELECTOR_ORDER.map((key) => {
                                    const m = STATUS_META[key];
                                    const sColor = statusColor(colors, key);
                                    const cur = selectorStudent
                                        ? statusMap[String(selectorStudent.id || selectorStudent.client_id)] || 'notset'
                                        : 'notset';
                                    const isSel = cur === key;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            onPress={() => handleSelectStatus(key)}
                                            style={[styles.popupItem, isSel && { backgroundColor: sColor + '1A' }]}
                                        >
                                            <Ionicons name={m.icon} size={20} color={sColor} />
                                            <Text style={[styles.popupLabel, { color: colors.textPrimary, fontWeight: isSel ? '700' : '500' }]}>
                                                {m.menuLabel}
                                            </Text>
                                            <View style={{ flex: 1 }} />
                                            {isSel ? <Ionicons name="checkmark" size={18} color={sColor} /> : null}
                                        </TouchableOpacity>
                                    );
                                })}
                            </TouchableOpacity>
                        ) : null}
                    </Pressable>
                </Modal>

                {/* Scope picker — "All my courses and classes" plus every course/class option */}
                <Modal
                    visible={isScopePickerOpen}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIsScopePickerOpen(false)}
                >
                    <Pressable style={styles.scopeOverlay} onPress={() => setIsScopePickerOpen(false)}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => {}}
                            style={[styles.scopeSheet, {
                                backgroundColor: colors.cardBackground,
                                borderColor: colors.border,
                                paddingBottom: 12 + insets.bottom,
                            }]}
                        >
                            <View style={styles.scopeSheetHeader}>
                                <Text style={[styles.scopeSheetTitle, { color: colors.textPrimary }]}>
                                    Courses &amp; classes
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setIsScopePickerOpen(false)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Ionicons name="close" size={20} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={scopeOptions}
                                keyExtractor={(it) => it.value}
                                style={styles.scopeList}
                                ListHeaderComponent={
                                    <TouchableOpacity
                                        onPress={() => { setSelectedScope(null); setIsScopePickerOpen(false); }}
                                        style={[styles.scopeOption, !selectedScope && { backgroundColor: colors.primary + '14' }]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={[styles.scopeOptionLabel, {
                                                    color: colors.textPrimary,
                                                    fontWeight: !selectedScope ? '700' : '500',
                                                }]}
                                            >
                                                All my courses and classes
                                            </Text>
                                        </View>
                                        {!selectedScope ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                                    </TouchableOpacity>
                                }
                                renderItem={({ item }) => {
                                    const isSel = selectedScope?.value === item.value;
                                    return (
                                        <TouchableOpacity
                                            onPress={() => { setSelectedScope(item); setIsScopePickerOpen(false); }}
                                            style={[styles.scopeOption, isSel && { backgroundColor: colors.primary + '14' }]}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={[styles.scopeOptionLabel, {
                                                        color: colors.textPrimary,
                                                        fontWeight: isSel ? '700' : '500',
                                                    }]}
                                                    numberOfLines={1}
                                                >
                                                    {item.label}
                                                </Text>
                                                <Text style={[styles.scopeOptionTag, { color: colors.textSecondary }]}>
                                                    {item.type === 'course' ? 'Course' : 'Class'}
                                                </Text>
                                            </View>
                                            {isSel ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </TouchableOpacity>
                    </Pressable>
                </Modal>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        gap: 4,
    },
    iconBtn: { padding: 8 },
    title: { fontSize: 16, fontWeight: '700' },
    subtitle: { fontSize: 12 },
    summaryWrap: {
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    summaryBox: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 2,
        borderRadius: 6,
        gap: 2,
    },
    summaryLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
    summaryCount: { fontSize: 16, fontWeight: '700' },
    searchWrap: { paddingHorizontal: 16, paddingVertical: 4 },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },
    list: { paddingHorizontal: 16, paddingVertical: 6, paddingBottom: 16 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { fontSize: 14, fontWeight: '600' },
    subline: { fontSize: 11 },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    statusLabel: { fontSize: 11, fontWeight: '700' },
    footer: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
    },
    btnText: { color: '#fff', fontWeight: '700' },
    btnOutline: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 60 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    popup: {
        position: 'absolute',
        borderRadius: 14,
        borderWidth: 1,
        paddingVertical: 6,
        paddingHorizontal: 6,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    popupItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    popupLabel: { fontSize: 14 },
    scopeWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    scopeTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    scopeTriggerLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
    scopeOverlay: { flex: 1, justifyContent: 'flex-end' },
    scopeSheet: {
        borderTopWidth: 1,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 8,
        paddingTop: 8,
        maxHeight: '70%',
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 8,
    },
    scopeSheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingBottom: 8,
    },
    scopeSheetTitle: { fontSize: 15, fontWeight: '700' },
    scopeList: { paddingHorizontal: 4 },
    scopeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    scopeOptionLabel: { fontSize: 14 },
    scopeOptionTag: { fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
});
