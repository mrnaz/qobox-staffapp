import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useGoBack } from '../../../utils/nav';
import { Ionicons } from '@expo/vector-icons';
import RenderHtml from 'react-native-render-html';
import Theme from '../../../context/ThemeContext';
import Card, { CardHeader, cardBodyPadding, cardGap } from '../../../components/Card';
import { lessonDuration, lessonWhen } from '../../../utils/lessons';

const hasText = (html) => Boolean(String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());

// The lesson's written content, in the order a teacher reads it. These are the
// column names the API actually returns (LessonsTransformer / the Lesson
// model); the older `objectives`/`content`/`notes` guesses never matched any
// field, which is why every lesson looked empty.
const CONTENT_SECTIONS = [
    { label: 'Lesson plan',   keys: ['lesson_plan'] },
    { label: 'Lesson outline', keys: ['lesson_outline', 'objectives', 'objective'] },
    { label: 'Teacher notes', keys: ['teacher_notes', 'notes'] },
];

export default function LessonDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const params = useLocalSearchParams();
    const goBack = useGoBack(params.id ? `/class/${params.id}` : '/(main)/classes');

    const lesson = (() => {
        try { return params.lesson ? JSON.parse(params.lesson) : null; } catch { return null; }
    })();

    const sections = lesson
        ? CONTENT_SECTIONS
            .map(({ label, keys }) => ({ label, html: keys.map((k) => lesson[k]).find(hasText) }))
            .filter((s) => s.html)
        : [];

    // Topics and learning units the lesson covers — content in their own right,
    // and often the only thing filled in.
    const syllabus = Array.isArray(lesson?.lesson_syllabuses) ? lesson.lesson_syllabuses : [];

    const when = lessonWhen(lesson);
    const minutes = lessonDuration(lesson);

    const contentWidth = Dimensions.get('window').width - 72;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => goBack()} style={styles.iconButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {lesson?.title || 'Lesson'}
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                {!lesson ? (
                    <View style={styles.center}>
                        <Ionicons name="document-outline" size={32} color={colors.textDisabled} />
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>Lesson data unavailable.</Text>
                    </View>
                ) : (
                    <>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>{lesson.title}</Text>
                        {when ? (
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>{when}</Text>
                        ) : null}
                        {minutes ? (
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>
                                {minutes} minutes
                            </Text>
                        ) : null}

                        {sections.map(({ label, html }) => (
                            <Card key={label} style={styles.section}>
                                <CardHeader title={label} />
                                <View style={cardBodyPadding}>
                                    <RenderHtml
                                        contentWidth={contentWidth}
                                        source={{ html: String(html) }}
                                        baseStyle={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }}
                                        tagsStyles={{
                                            p:      { marginVertical: 4, color: colors.textPrimary },
                                            h1:     { fontSize: 18, fontWeight: 'bold', marginVertical: 8, color: colors.textPrimary },
                                            h2:     { fontSize: 16, fontWeight: 'bold', marginVertical: 6, color: colors.textPrimary },
                                            h3:     { fontSize: 15, fontWeight: '600', marginVertical: 4, color: colors.textPrimary },
                                            b:      { fontWeight: 'bold', color: colors.textPrimary },
                                            strong: { fontWeight: 'bold', color: colors.textPrimary },
                                            i:      { fontStyle: 'italic', color: colors.textPrimary },
                                            em:     { fontStyle: 'italic', color: colors.textPrimary },
                                            a:      { color: colors.primary, textDecorationLine: 'underline' },
                                            ul:     { marginVertical: 4, paddingLeft: 16 },
                                            ol:     { marginVertical: 4, paddingLeft: 16 },
                                            li:     { marginVertical: 2, color: colors.textPrimary },
                                        }}
                                    />
                                </View>
                            </Card>
                        ))}

                        {syllabus.length ? (
                            <Card style={styles.section}>
                                <CardHeader title="Syllabus" meta={syllabus.length} />
                                {syllabus.map((item, index) => (
                                    <View
                                        key={String(item.id ?? index)}
                                        style={[
                                            styles.syllabusRow,
                                            index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                                        ]}
                                    >
                                        <Text style={[styles.syllabusTitle, { color: colors.textPrimary }]}>
                                            {item.learning_unit?.title || item.topic?.title || 'Untitled'}
                                        </Text>
                                        {item.learning_unit?.title && item.topic?.title ? (
                                            <Text style={[styles.syllabusMeta, { color: colors.textSecondary }]}>
                                                {item.topic.title}
                                            </Text>
                                        ) : null}
                                    </View>
                                ))}
                            </Card>
                        ) : null}

                        {sections.length === 0 && syllabus.length === 0 ? (
                            <View style={styles.center}>
                                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                                    No detail content available for this lesson.
                                </Text>
                            </View>
                        ) : null}
                    </>
                )}
            </ScrollView>
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
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
    body: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 20, fontWeight: '700' },
    meta: { fontSize: 13, marginTop: 4 },
    section: { marginTop: cardGap },
    syllabusRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
    syllabusTitle: { fontSize: 14, fontWeight: '600' },
    syllabusMeta: { fontSize: 12 },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center' },
});
