import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Modal,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { ensureAcademicPeriod } from '../utils/academicPeriod';
import { VISIBILITY_META } from '../utils/albums';

// Visibility, in the order the backend understands it. `restricted` is
// deliberately absent: it only means anything alongside a list of classes,
// courses, teams and student groups to grant access to, which is a picker this
// screen has no room for. Staff who need it build the album on the web portal;
// here you get the two that are meaningful on their own.
const VISIBILITIES = ['public', 'private'];

export default function AlbumFormModal({ visible, onClose, onSaved }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const insets = useSafeAreaInsets();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [visibility, setVisibility] = useState('public');
    const [periodId, setPeriodId] = useState(null);
    const [periodName, setPeriodName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setTitle('');
        setDescription('');
        setVisibility('public');
        // The album belongs to an academic period and the API requires one, so
        // resolve the active period up front rather than failing on save.
        (async () => {
            try {
                const { id, period } = await ensureAcademicPeriod();
                setPeriodId(id);
                // The periods endpoint calls it `label` — same field PeriodPicker reads.
                setPeriodName(period?.label || '');
            } catch (err) {
                console.error('Album period resolve error', err);
                setPeriodId(null);
                setPeriodName('');
            }
        })();
    }, [visible]);

    const submit = async () => {
        if (!title.trim()) {
            Alert.alert('Validation', 'Please enter a title.');
            return;
        }
        if (!periodId) {
            Alert.alert('No academic period', 'An album has to belong to an academic period, and none could be resolved. Please try again.');
            return;
        }
        try {
            setSubmitting(true);
            await api.createPhotoAlbum({
                title: title.trim(),
                description: description.trim() || null,
                visibility,
                period_id: periodId,
            });
            onSaved?.();
        } catch (err) {
            console.error('Create album error', err);
            Alert.alert(
                'Could not create album',
                err.body?.message || err.body?.errors?.title?.[0] || err.message || 'Please try again.'
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: colors.background }}
            >
                <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background, paddingTop: 12 + insets.top }]}>
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New album</Text>
                    <View style={styles.iconBtn} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
                    <Field label="Title *" colors={colors}>
                        <TextInput
                            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}
                            placeholder="What is this album of?"
                            placeholderTextColor={colors.textSecondary}
                            value={title}
                            onChangeText={setTitle}
                            autoFocus
                        />
                    </Field>

                    <Field label="Description" colors={colors}>
                        <TextInput
                            style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.borderStrong || colors.border, backgroundColor: colors.cardBackground }]}
                            placeholder="Optional context for whoever opens it"
                            placeholderTextColor={colors.textSecondary}
                            value={description}
                            onChangeText={setDescription}
                            multiline
                            textAlignVertical="top"
                        />
                    </Field>

                    <Field label="Who can see it" colors={colors}>
                        <View style={styles.chipRow}>
                            {VISIBILITIES.map((v) => {
                                const meta = VISIBILITY_META[v];
                                const active = visibility === v;
                                const palette = colors[meta.palette];
                                const tint = palette?.text || colors.primary;
                                return (
                                    <TouchableOpacity
                                        key={v}
                                        onPress={() => setVisibility(v)}
                                        style={[styles.chip, {
                                            borderColor: active ? tint : (colors.borderStrong || colors.border),
                                            backgroundColor: active ? tint + '22' : colors.cardBackground,
                                        }]}
                                    >
                                        <Ionicons name={meta.icon} size={13} color={active ? tint : colors.textSecondary} />
                                        <Text style={{ color: active ? tint : colors.textPrimary, fontSize: 13 }}>
                                            {meta.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={[styles.hint, { color: colors.textSecondary }]}>
                            {visibility === 'public'
                                ? 'Everyone in the organisation can open this album.'
                                : 'Only you can open this album until someone is granted access on the web portal.'}
                        </Text>
                    </Field>

                    {periodName ? (
                        <Text style={[styles.periodNote, { color: colors.textSecondary }]}>
                            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                            {'  '}Filed under {periodName}
                        </Text>
                    ) : null}
                </ScrollView>

                <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: 12 + insets.bottom }]}>
                    <TouchableOpacity
                        onPress={submit}
                        disabled={submitting}
                        activeOpacity={0.85}
                        style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="checkmark" size={18} color="#fff" />
                                <Text style={styles.saveBtnText}>Create album</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function Field({ label, children, colors }) {
    return (
        <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {label}
            </Text>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    iconBtn: { paddingHorizontal: 12, paddingVertical: 6, minWidth: 60, alignItems: 'center' },
    input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    textarea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 90 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderRadius: 999,
        paddingHorizontal: 12, paddingVertical: 6,
    },
    hint: { fontSize: 12, lineHeight: 17 },
    periodNote: { fontSize: 12 },
    footer: {
        borderTopWidth: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 10,
        paddingVertical: 14,
    },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
