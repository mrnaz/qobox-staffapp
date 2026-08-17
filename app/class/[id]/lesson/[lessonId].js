import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '../../../utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { iconColor } from '../../../utils/iconColors';
import Theme from '../../../context/ThemeContext';
import Card, { CardHeader, cardBodyPadding } from '../../../components/Card';

const stripHtml = (html = '') => html.replace(/<[^>]*>/g, '').trim();

const fmtDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function LessonDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const params = useLocalSearchParams();
    const goBack = useGoBack(params.id ? `/class/${params.id}` : '/(main)/classes');

    const lesson = (() => {
        try { return params.lesson ? JSON.parse(params.lesson) : null; } catch { return null; }
    })();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
                        <Ionicons name="document-outline" size={32} color={iconColor('document-outline', colors)} />
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>Lesson data unavailable.</Text>
                    </View>
                ) : (
                    <>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>{lesson.title}</Text>
                        {lesson.lesson_date || lesson.date ? (
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>
                                {fmtDate(lesson.lesson_date || lesson.date)}
                            </Text>
                        ) : null}
                        {lesson.duration_minutes ? (
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>
                                {lesson.duration_minutes} minutes
                            </Text>
                        ) : null}

                        {(lesson.objectives || lesson.objective) ? (
                            <Section label="Objectives" colors={colors}>
                                <Text style={[styles.body_text, { color: colors.textPrimary }]}>
                                    {stripHtml(lesson.objectives || lesson.objective)}
                                </Text>
                            </Section>
                        ) : null}

                        {(lesson.content || lesson.description) ? (
                            <Section label="Content" colors={colors}>
                                <Text style={[styles.body_text, { color: colors.textPrimary }]}>
                                    {stripHtml(lesson.content || lesson.description)}
                                </Text>
                            </Section>
                        ) : null}

                        {lesson.notes ? (
                            <Section label="Notes" colors={colors}>
                                <Text style={[styles.body_text, { color: colors.textPrimary }]}>
                                    {stripHtml(lesson.notes)}
                                </Text>
                            </Section>
                        ) : null}

                        {!lesson.objectives && !lesson.objective && !lesson.content && !lesson.description && !lesson.notes ? (
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

function Section({ label, children }) {
    return (
        <Card style={styles.section}>
            <CardHeader title={label} />
            <View style={cardBodyPadding}>{children}</View>
        </Card>
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
    section: { marginTop: 18 },
    body_text: { fontSize: 14, lineHeight: 20 },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center' },
});
