import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconColor } from '../../utils/iconColors';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Card from '../Card';

const fmtDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function LessonsTab({ classId }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();

    const [lessons, setLessons] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(
        async (opts = {}) => {
            try {
                if (!opts.refresh) setIsLoading(true);
                setError('');
                // education/lessons/{class} returns BOTH the authored lessons and
                // the class's scheduled sessions. Many orgs never author lessons —
                // sessions are then the only "lessons" a teacher can see (they're
                // also what the classes list counts as "0/64 lessons"), so we keep
                // them as a fallback list.
                const res = await api.getClassLessons(classId);
                const list = res?.lessons || res?.data || res || [];
                setLessons(Array.isArray(list) ? list : []);
                setSessions(Array.isArray(res?.sessions) ? res.sessions : []);
            } catch (err) {
                console.error('Lessons load error', err);
                setError(err.body?.message || err.message || 'Failed to load lessons.');
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [classId]
    );

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => {
        setIsRefreshing(true);
        load({ refresh: true });
    };

    const openLesson = (lesson) =>
        router.push({
            pathname: `/class/${classId}/lesson/${lesson.id}`,
            params: { lesson: JSON.stringify(lesson) },
        });

    const renderItem = ({ item }) => (
        <Card
            onPress={() => openLesson(item)}
            activeOpacity={0.8}
            style={styles.row}
        >
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                    {item.title || `Lesson #${item.id}`}
                </Text>
                {item.lesson_date || item.date ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {fmtDate(item.lesson_date || item.date)}
                    </Text>
                ) : null}
                {item.duration_minutes ? (
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {item.duration_minutes} min
                    </Text>
                ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Card>
    );

    // Fallback row when no lessons are authored: one scheduled session, titled
    // by its linked lesson(s) when any exist. Tappable only when it can open a
    // linked lesson's detail page.
    const renderSession = ({ item }) => {
        const linked = Array.isArray(item.lessons) ? item.lessons : [];
        const title = linked.length
            ? linked.map((l) => l.title).filter(Boolean).join(', ') || 'Lesson'
            : (item.label || 'No lesson planned');
        const roomName = item.room?.name || item.room_name;
        return (
            <Card
                onPress={() => { if (linked[0]) openLesson(linked[0]); }}
                disabled={!linked[0]}
                activeOpacity={0.8}
                style={styles.row}
            >
                <View style={{ flex: 1, gap: 4 }}>
                    <Text
                        style={[
                            styles.title,
                            { color: linked.length ? colors.textPrimary : colors.textSecondary },
                            !linked.length && { fontStyle: 'italic', fontWeight: '400' },
                        ]}
                        numberOfLines={2}
                    >
                        {title}
                    </Text>
                    {item.session_start_formatted || item.session_start ? (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {item.session_start_formatted || item.session_start}
                        </Text>
                    ) : null}
                    {roomName ? (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{roomName}</Text>
                    ) : null}
                </View>
                {linked[0] ? (
                    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                ) : null}
            </Card>
        );
    };

    const showingSessions = lessons.length === 0 && sessions.length > 0;

    if (isLoading && lessons.length === 0 && sessions.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && lessons.length === 0 && sessions.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={32} color={iconColor('alert-circle-outline', colors)} />
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                <TouchableOpacity onPress={() => load()} style={[styles.retry, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <FlatList
            data={showingSessions ? sessions : lessons}
            keyExtractor={(it, i) => String(it.id ?? i)}
            renderItem={showingSessions ? renderSession : renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListHeaderComponent={
                showingSessions ? (
                    <Text style={[styles.listHeader, { color: colors.textSecondary }]}>
                        {sessions.length} scheduled session{sessions.length === 1 ? '' : 's'}
                    </Text>
                ) : null
            }
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="book-outline" size={32} color={iconColor('book-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No lessons yet.</Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    list: { padding: 16, paddingBottom: 32, gap: 10 },
    listHeader: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 14,
    },
    title: { fontSize: 14, fontWeight: '600' },
    subtitle: { fontSize: 12 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
