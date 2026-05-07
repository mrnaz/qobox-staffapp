import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import LessonsTab from '../components/class/LessonsTab';
import AssignmentsTab from '../components/class/AssignmentsTab';

const TABS = [
    { id: 'lessons', label: 'Lessons', icon: 'book' },
    { id: 'assignments', label: 'Assignments', icon: 'list' },
];

export default function ClassProfileScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { id } = useLocalSearchParams();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState('lessons');
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

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {classData?.title || classData?.class_title || 'Class'}
                    </Text>
                    {classData?.course || classData?.course_title ? (
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            {classData.course || classData.course_title}
                        </Text>
                    ) : null}
                </View>
            </View>

            {/* Sub-tabs */}
            <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
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
                                    fontWeight: active ? '600' : '400',
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
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error && !classData ? (
                <ScrollView contentContainerStyle={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
                </ScrollView>
            ) : (
                <View style={{ flex: 1 }}>
                    {activeTab === 'lessons' && <LessonsTab classId={id} />}
                    {activeTab === 'assignments' && <AssignmentsTab classId={id} />}
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
    tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
    tabBtn: { flex: 1, paddingVertical: 10 },
    tabContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
