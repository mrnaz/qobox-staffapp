import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoBack } from '../utils/nav';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import HomeTab from '../components/class/HomeTab';
import LessonsTab from '../components/class/LessonsTab';
import StudentsTab from '../components/class/StudentsTab';
import CalendarTab from '../components/class/CalendarTab';
import AssignmentsTab from '../components/class/AssignmentsTab';
import TestsTab from '../components/class/TestsTab';
import ResourcesTab from '../components/class/ResourcesTab';

// Mirrors the client app's class-profile tab set + icons (FontAwesome), with the
// staff app's existing Lessons / Assignments / Tests tabs kept in place.
const TABS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'lessons', label: 'Lessons', icon: 'book' },
    { id: 'students', label: 'Students', icon: 'users' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'assignments', label: 'Assignments', icon: 'list' },
    { id: 'tests', label: 'Tests', icon: 'check-square-o' },
    { id: 'resources', label: 'Resources', icon: 'folder' },
];

export default function ClassProfileScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const goBack = useGoBack('/(main)/classes');

    const [activeTab, setActiveTab] = useState('home');
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setError('');
                const res = await api.getClass(id);
                setClassData(res?.class || res?.data || res);
            } catch (err) {
                console.error('Class load error', err);
                setError(err.body?.message || err.message || 'Failed to load class.');
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    // `courses` and `staff` come back as arrays of objects; joining them
    // directly printed "[object Object]" in the header.
    const nameOf = (v) => (typeof v === 'string' ? v : v?.title || v?.full_name || v?.name || '');
    const courseLabel = Array.isArray(classData?.courses)
        ? classData.courses.map(nameOf).filter(Boolean).join(', ')
        : nameOf(classData?.course) || classData?.course_title || '';
    const teacherLabel = Array.isArray(classData?.staff)
        ? nameOf(classData.staff.find((m) => m?.role === 'teacher') || classData.staff[0])
        : nameOf(classData?.teacher);
    const subtitle = [courseLabel, teacherLabel].filter(Boolean).join(' • ');

    const renderTab = () => {
        switch (activeTab) {
            case 'home':
                return <HomeTab classId={id} />;
            case 'lessons':
                return <LessonsTab classId={id} />;
            case 'students':
                return <StudentsTab classId={id} />;
            case 'calendar':
                return <CalendarTab classId={id} />;
            case 'assignments':
                return <AssignmentsTab classId={id} />;
            case 'tests':
                return (
                    <TestsTab
                        classId={id}
                        onOpenProgressReports={() => router.push(`/class/${id}/progress-reports`)}
                    />
                );
            case 'resources':
                return <ResourcesTab classId={id} />;
            default:
                return null;
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => goBack()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {classData?.title || classData?.class_title || 'Class'}
                    </Text>
                    {subtitle ? (
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
            </View>

            {/* Sub-tabs — horizontal scroll (7 tabs), matches the client app */}
            <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabBarContent}
                >
                    {TABS.map((t) => {
                        const active = activeTab === t.id;
                        return (
                            <TouchableOpacity
                                key={t.id}
                                onPress={() => setActiveTab(t.id)}
                                style={[styles.tabBtn, { borderBottomColor: active ? colors.primary : 'transparent' }]}
                            >
                                <FontAwesome
                                    name={t.icon}
                                    size={16}
                                    color={active ? colors.primary : colors.textSecondary}
                                    style={{ marginBottom: 4 }}
                                />
                                <Text style={{
                                    color: active ? colors.primary : colors.textSecondary,
                                    fontWeight: active ? '600' : '400',
                                    fontSize: 11,
                                }}>
                                    {t.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && !classData ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textDisabled} />
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {renderTab()}
                </View>
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
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerSub: { fontSize: 12, marginTop: 2 },
    tabBar: { borderBottomWidth: 1 },
    tabBarContent: { paddingHorizontal: 8 },
    tabBtn: {
        paddingHorizontal: 12,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomWidth: 2,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
