import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { iconColor } from '../../utils/iconColors';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Card, { CardHeader, cardGap } from '../Card';
import { lessonDuration, lessonWhen } from '../../utils/lessons';


// One divided row inside the list card — same shape as the Students list.
function Row({ colors, index, onPress, disabled, title, titleStyle, lines, chevron }) {
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            disabled={disabled}
            onPress={onPress}
            style={[
                styles.row,
                // The header band closes the top, so only rows after the first
                // draw a divider.
                index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
            ]}
        >
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.title, { color: colors.textPrimary }, titleStyle]} numberOfLines={2}>
                    {title}
                </Text>
                {lines.filter(Boolean).map((line, i) => (
                    <Text key={i} style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {line}
                    </Text>
                ))}
            </View>
            {chevron ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            ) : null}
        </TouchableOpacity>
    );
}

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

    const renderLesson = (item, index) => (
        <Row
            key={String(item.id ?? index)}
            colors={colors}
            index={index}
            onPress={() => openLesson(item)}
            title={item.title || `Lesson #${item.id}`}
            lines={[
                lessonWhen(item),
                lessonDuration(item) ? `${lessonDuration(item)} min` : null,
            ]}
            chevron
        />
    );

    // Fallback row when no lessons are authored: one scheduled session, titled
    // by its linked lesson(s) when any exist. Tappable only when it can open a
    // linked lesson's detail page.
    const renderSession = (item, index) => {
        const linked = Array.isArray(item.lessons) ? item.lessons : [];
        const title = linked.length
            ? linked.map((l) => l.title).filter(Boolean).join(', ') || 'Lesson'
            : (item.label || 'No lesson planned');
        return (
            <Row
                key={String(item.id ?? index)}
                colors={colors}
                index={index}
                disabled={!linked[0]}
                onPress={() => { if (linked[0]) openLesson(linked[0]); }}
                title={title}
                titleStyle={!linked.length && {
                    color: colors.textSecondary,
                    fontStyle: 'italic',
                    fontWeight: '400',
                }}
                lines={[
                    item.session_start_formatted || item.session_start,
                    item.room?.name || item.room_name,
                ]}
                chevron={Boolean(linked[0])}
            />
        );
    };

    const showingSessions = lessons.length === 0 && sessions.length > 0;
    const rows = showingSessions ? sessions : lessons;

    if (isLoading && rows.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (error && rows.length === 0) {
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
        <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            {rows.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="book-outline" size={32} color={iconColor('book-outline', colors)} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No lessons yet.</Text>
                </View>
            ) : (
                <Card>
                    <CardHeader
                        title={showingSessions ? 'Scheduled sessions' : 'Lessons'}
                        meta={rows.length}
                    />
                    {rows.map(showingSessions ? renderSession : renderLesson)}
                </Card>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    list: { flexGrow: 1, padding: 16, paddingBottom: 32, gap: cardGap },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    title: { fontSize: 14, fontWeight: '700' },
    subtitle: { fontSize: 12 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
