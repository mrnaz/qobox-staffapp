import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import TimetableWeekView from '../components/TimetableWeekView';
import { ensureAcademicPeriod } from '../utils/academicPeriod';

const TABS = [
    { id: 'info',      label: 'Info',      icon: 'user' },
    { id: 'classes',   label: 'Classes',   icon: 'graduation-cap' },
    { id: 'guardians', label: 'Guardians', icon: 'users' },
    { id: 'medical',   label: 'Medical',   icon: 'heartbeat' },
    { id: 'timetable', label: 'Timetable', icon: 'clock-o' },
];

export default function StudentDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const { id } = useLocalSearchParams();

    const [activeTab, setActiveTab] = useState('info');
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const res = await api.getStudent(id);
            setStudent(res?.student || res?.data || res);
        } catch (err) {
            console.error('Student load error', err);
            setError(err.body?.message || err.message || 'Failed to load student.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const fullName =
        student?.full_name ||
        `${student?.fname || ''} ${student?.sname || ''}`.trim() ||
        'Student';

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Avatar uri={student?.list_photo || student?.photo} name={fullName} size={32} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {fullName}
                    </Text>
                    {student?.clientref ? (
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {student.clientref}
                        </Text>
                    ) : null}
                </View>
                {/* Web shows these as colored alert icons in the profile card
                    header; mirroring them so staff see medical / legal context
                    immediately. */}
                {student?.flag_medical ? (
                    <View style={[styles.flagPill, { backgroundColor: (colors.error || '#ef4444') + '22' }]}>
                        <FontAwesome name="medkit" size={12} color={colors.error || '#ef4444'} />
                    </View>
                ) : null}
                {student?.flag_legal ? (
                    <View style={[styles.flagPill, { backgroundColor: (colors.warning || '#f59e0b') + '22' }]}>
                        <FontAwesome name="exclamation-triangle" size={12} color={colors.warning || '#f59e0b'} />
                    </View>
                ) : null}
            </View>

            {/* Sub-tabs (scrollable) */}
            <View style={[styles.tabBarWrap, { borderBottomColor: colors.border }]}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabBar}
                >
                    {TABS.map((t) => {
                        const active = activeTab === t.id;
                        return (
                            <TouchableOpacity
                                key={t.id}
                                onPress={() => setActiveTab(t.id)}
                                style={styles.tabBtn}
                            >
                                <View style={styles.tabContent}>
                                    <FontAwesome
                                        name={t.icon}
                                        size={14}
                                        color={active ? colors.primary : colors.textSecondary}
                                    />
                                    <Text style={{
                                        color: active ? colors.primary : colors.textSecondary,
                                        fontWeight: active ? '700' : '500',
                                        fontSize: 13,
                                    }}>
                                        {t.label}
                                    </Text>
                                </View>
                                <View style={{
                                    height: 2, marginTop: 6, borderRadius: 1,
                                    backgroundColor: active ? colors.primary : 'transparent',
                                }} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && !student ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={load} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {activeTab === 'info'      && <InfoTab student={student} colors={colors} />}
                    {activeTab === 'classes'   && <ClassesTab studentId={id} colors={colors} />}
                    {activeTab === 'guardians' && <GuardiansTab student={student} colors={colors} />}
                    {activeTab === 'medical'   && <MedicalTab student={student} colors={colors} />}
                    {activeTab === 'timetable' && <TimetableTab studentId={id} />}
                </View>
            )}
        </SafeAreaView>
    );
}

// ---- Info -----------------------------------------------------------------

function calcAge(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    return age;
}

function InfoTab({ student, colors }) {
    if (!student) return null;

    const address = [
        student.address_1,
        student.address_2,
        student.suburbcity,
        student.stateprov,
        student.country,
    ]
        .filter(Boolean)
        .join(', ');

    const age = calcAge(student.dob);
    const dobDisplay = student.dob_formatted || student.dob
        ? `${student.dob_formatted || student.dob}${age !== null ? ` (${age} y/o)` : ''}`
        : null;

    return (
        <ScrollView contentContainerStyle={styles.tabBody}>
            <Section title="Personal" colors={colors}>
                <Field label="Full name" value={student.full_name || `${student.fname || ''} ${student.sname || ''}`.trim()} colors={colors} />
                <Field label="Date of birth" value={dobDisplay} colors={colors} />
                <Field label="Gender" value={student.gender} colors={colors} />
                <Field label="Reference" value={student.clientref} colors={colors} />
            </Section>

            <Section title="Contact" colors={colors}>
                <Field
                    label="Email"
                    value={student.email}
                    colors={colors}
                    onPress={student.email ? () => Linking.openURL(`mailto:${student.email}`) : null}
                />
                <Field
                    label="Mobile"
                    value={student.mobilephone}
                    colors={colors}
                    onPress={student.mobilephone ? () => Linking.openURL(`tel:${student.mobilephone}`) : null}
                />
                <Field
                    label="Home"
                    value={student.homephone}
                    colors={colors}
                    onPress={student.homephone ? () => Linking.openURL(`tel:${student.homephone}`) : null}
                />
                <Field label="Address" value={address} colors={colors} multiline />
            </Section>

            {student.legal_status || student.flag_legal ? (
                <Section title="Legal" colors={colors}>
                    <Field label="Status" value={student.legal_status} colors={colors} />
                    {student.flag_legal ? (
                        <Field label="Flag" value={student.flag_legal} colors={colors} multiline />
                    ) : null}
                </Section>
            ) : null}
        </ScrollView>
    );
}

// ---- Classes --------------------------------------------------------------

function ClassesTab({ studentId, colors }) {
    const router = useRouter();
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (opts = {}) => {
        try {
            if (!opts.refresh) setLoading(true);
            setError('');
            const { id: periodId } = await ensureAcademicPeriod();
            const params = {};
            if (periodId) params.period_id = periodId;
            const res = await api.getStudentClasses(studentId, params);
            const list = res?.classes || res?.data || res || [];
            setClasses(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Student classes load error', err);
            setError(err.body?.message || err.message || 'Failed to load classes.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [studentId]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }

    return (
        <ScrollView
            contentContainerStyle={styles.tabBody}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => { setRefreshing(true); load({ refresh: true }); }}
                    tintColor={colors.primary}
                />
            }
        >
            {error ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
            ) : classes.length === 0 ? (
                <View style={styles.emptyBlock}>
                    <Ionicons name="school-outline" size={28} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No classes enrolled.
                    </Text>
                </View>
            ) : (
                classes.map((c, idx) => {
                    // ClientsRepository::get_classes (raw SQL) returns
                    // class_id, class_title, course_title, staff_fname,
                    // staff_sname, session_start, room_name.
                    const classId = c.class_id ?? c.id;
                    const title = c.class_title || c.title || `Class ${idx + 1}`;
                    const course = c.course_title || c.course;
                    const teacher = c.staff_fname || c.staff_sname
                        ? `${c.staff_fname || ''} ${c.staff_sname || ''}`.trim()
                        : c.teacher;
                    const next = c.session_start
                        ? `${new Date(c.session_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${new Date(c.session_start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                        : null;
                    const room = c.room_name;
                    return (
                        <TouchableOpacity
                            key={classId ?? `${title}-${idx}`}
                            activeOpacity={0.85}
                            onPress={() => classId && router.push(`/class/${classId}`)}
                            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                        >
                            <View style={styles.cardRow}>
                                <FontAwesome name="graduation-cap" size={16} color={colors.primary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                        {title}
                                    </Text>
                                    {course ? (
                                        <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                                            {course}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                            {teacher || next || room ? (
                                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                                    {teacher ? (
                                        <View style={styles.metaPair}>
                                            <FontAwesome name="user" size={11} color={colors.textSecondary} />
                                            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                                                {teacher}
                                            </Text>
                                        </View>
                                    ) : null}
                                    {next ? (
                                        <View style={styles.metaPair}>
                                            <FontAwesome name="clock-o" size={11} color={colors.textSecondary} />
                                            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                                                {next}
                                                {room ? ` · ${room}` : ''}
                                            </Text>
                                        </View>
                                    ) : room ? (
                                        <View style={styles.metaPair}>
                                            <FontAwesome name="map-marker" size={11} color={colors.textSecondary} />
                                            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                                                {room}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            ) : null}
                        </TouchableOpacity>
                    );
                })
            )}
        </ScrollView>
    );
}

// ---- Guardians ------------------------------------------------------------

function GuardiansTab({ student, colors }) {
    const guardians = Array.isArray(student?.guardians) ? student.guardians : [];

    return (
        <ScrollView contentContainerStyle={styles.tabBody}>
            {guardians.length === 0 ? (
                <View style={styles.emptyBlock}>
                    <Ionicons name="people-outline" size={28} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No guardians on record.
                    </Text>
                </View>
            ) : (
                guardians.map((g, idx) => (
                    <View
                        key={g.id ?? `${g.name}-${idx}`}
                        style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                    >
                        <View style={styles.cardRow}>
                            <View style={{
                                width: 36, height: 36, borderRadius: 18,
                                backgroundColor: colors.primary + '22',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FontAwesome name="user" size={16} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {g.name || 'Unnamed'}
                                </Text>
                                {g.type ? (
                                    <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {g.type}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    </View>
                ))
            )}
        </ScrollView>
    );
}

// ---- Medical --------------------------------------------------------------

function MedicalTab({ student, colors }) {
    if (!student) return null;
    const hasAny = student.medical_history || student.medical_treatments
        || student.dietary_requirement || student.flag_medical;

    return (
        <ScrollView contentContainerStyle={styles.tabBody}>
            {!hasAny ? (
                <View style={styles.emptyBlock}>
                    <Ionicons name="medkit-outline" size={28} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No medical details on record.
                    </Text>
                </View>
            ) : (
                <Section title="Medical" colors={colors}>
                    <Field label="Medical history" value={student.medical_history} colors={colors} multiline />
                    <Field label="Treatments" value={student.medical_treatments} colors={colors} multiline />
                    <Field label="Dietary requirements" value={student.dietary_requirement} colors={colors} multiline />
                    {student.flag_medical ? (
                        <Field label="Medical flag" value={student.flag_medical} colors={colors} multiline />
                    ) : null}
                </Section>
            )}
        </ScrollView>
    );
}

// ---- Timetable ------------------------------------------------------------
//
// Re-uses the same week-grid view as the main "My Timetable" tab so the UX is
// identical — colored class blocks on an hour grid, swipeable day strip, "now"
// marker, and tap-to-open detail modal.

function TimetableTab({ studentId }) {
    const loader = useCallback(
        async ({ startDate, endDate }) => {
            const res = await api.getStudentTimetable(studentId, {
                start_date: startDate,
                end_date: endDate,
            });
            return res?.timetable || res?.data || res || [];
        },
        [studentId]
    );

    return <TimetableWeekView loader={loader} enabled={Boolean(studentId)} />;
}

// ---- Shared primitives ----------------------------------------------------

function Section({ title, children, colors }) {
    return (
        <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
            <View style={[styles.sectionBody, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                {children}
            </View>
        </View>
    );
}

function Field({ label, value, colors, multiline, onPress }) {
    const display = value !== undefined && value !== null && value !== '' ? String(value) : '—';
    const tappable = onPress && display !== '—';
    const valueColor = tappable ? colors.primary : colors.textPrimary;
    const body = (
        <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text
                style={[styles.fieldValue, { color: valueColor }]}
                numberOfLines={multiline ? undefined : 1}
            >
                {display}
            </Text>
        </View>
    );
    if (tappable) {
        return (
            <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
                {body}
            </TouchableOpacity>
        );
    }
    return body;
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
    flagPill: {
        width: 28, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', marginLeft: 4,
    },
    tabBarWrap: { borderBottomWidth: 1 },
    tabBar: { paddingHorizontal: 8 },
    tabBtn: { paddingVertical: 10, paddingHorizontal: 12 },
    tabContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptyBlock: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    tabBody: { padding: 16, paddingBottom: 32 },
    sectionTitle: {
        fontSize: 11, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.6,
        marginBottom: 6, paddingHorizontal: 4,
    },
    sectionBody: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
    fieldRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderTopWidth: 1,
    },
    fieldLabel: { fontSize: 12, fontWeight: '500', flex: 1 },
    fieldValue: { fontSize: 13, fontWeight: '600', flex: 1.4, textAlign: 'right' },
    card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardTitle: { fontSize: 14, fontWeight: '700' },
    cardSub: { fontSize: 12, marginTop: 2 },
    cardFooter: {
        marginTop: 10, paddingTop: 8, borderTopWidth: 1,
        flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    },
    metaPair: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
    metaText: { fontSize: 11, flexShrink: 1 },
});
