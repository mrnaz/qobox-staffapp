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
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import { PRIORITIES, PRIORITY_META } from '../utils/tickets';
import { capturePhotoCompressed, pickPhotoCompressed, appendPhotoToForm } from '../utils/photo';

// Reusable Create / Edit ticket form.
// `existing` (optional) — when provided, the modal switches to edit mode and
// PUTs the diff. When omitted, it POSTs a new ticket.
//   onSaved(savedTicket) is called after a successful save.
export default function TicketFormModal({ visible, onClose, onSaved, staff, existing = null }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const isEdit = !!existing;

    const [title, setTitle] = useState('');
    const [location, setLocation] = useState('');
    const [categoryId, setCategoryId] = useState(null);
    const [priority, setPriority] = useState('N');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [categories, setCategories] = useState([]);
    const [photos, setPhotos] = useState([]); // [{ uri, width, height, mimeType }]

    useEffect(() => {
        if (!visible) return;
        // Pre-fill when editing, otherwise reset to defaults
        setTitle(existing?.title || '');
        setLocation(existing?.location || '');
        setPriority(existing?.priority || 'N');
        setDescription(existing?.description || '');
        // existing.category may be the object {id, label} or [] when null
        const existingCatId = existing?.category && !Array.isArray(existing.category)
            ? existing.category.id
            : (existing?.category_id ?? null);
        setCategoryId(existingCatId);
        setPhotos([]);
        // Load categories
        (async () => {
            try {
                const res = await api.getMaintenanceCategories();
                const list = res?.data || res || [];
                setCategories(Array.isArray(list) ? list : []);
            } catch {
                setCategories([]);
            }
        })();
    }, [visible, existing]);

    const handleCapturePhoto = async () => {
        try {
            const photo = await capturePhotoCompressed();
            if (photo) setPhotos((prev) => [...prev, photo]);
        } catch (err) {
            console.error('Camera error', err);
            Alert.alert('Camera error', err.message || 'Could not capture photo.');
        }
    };

    const handlePickPhoto = async () => {
        try {
            const photo = await pickPhotoCompressed();
            if (photo) setPhotos((prev) => [...prev, photo]);
        } catch (err) {
            console.error('Image picker error', err);
            Alert.alert('Photo library', err.message || 'Could not pick photo.');
        }
    };

    const removePhoto = (i) => {
        setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    };

    const submit = async () => {
        if (!title.trim()) {
            Alert.alert('Validation', 'Please enter a title.');
            return;
        }
        if (!isEdit && !staff?.id) {
            Alert.alert('Error', 'Could not determine your staff profile. Please sign in again.');
            return;
        }
        try {
            setSubmitting(true);
            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                location: location.trim() || null,
                category_id: categoryId,
                priority,
            };
            let saved;
            if (isEdit) {
                const res = await api.updateMaintenanceReport(existing.id, payload);
                saved = res?.maintenanceReport || res?.data || res;
            } else {
                saved = await api.createMaintenanceReport({ ...payload, reported_by: staff.id });
            }

            // Upload any attached photos to the maintenance-reports/files endpoint.
            // Photos are already scaled to fit in 2000x2000 and re-encoded as
            // JPG @ 90% by capturePhotoCompressed.
            const savedId = saved?.id ?? saved?.maintenanceReport?.id ?? saved?.data?.id ?? existing?.id;
            if (photos.length > 0 && savedId) {
                const form = new FormData();
                form.append('id', String(savedId));
                for (let i = 0; i < photos.length; i++) {
                    await appendPhotoToForm(
                        form,
                        `files[${i}]`,
                        photos[i],
                        `ticket_${savedId}_${i + 1}.jpg`,
                    );
                }
                try {
                    await api.requestForm('maintenance-reports/files', 'POST', form);
                } catch (uploadErr) {
                    console.error('Photo upload error', uploadErr);
                    Alert.alert('Photos not uploaded', 'The ticket was saved, but photos failed to upload. Please try again from the ticket detail.');
                }
            }
            onSaved?.(saved);
        } catch (err) {
            console.error(isEdit ? 'Edit ticket error' : 'Create ticket error', err);
            Alert.alert(
                isEdit ? 'Could not update ticket' : 'Could not save ticket',
                err.body?.message
                    || err.body?.errors?.title?.[0]
                    || err.message
                    || 'Please try again.'
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
                <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                        {isEdit ? 'Edit ticket' : 'New ticket'}
                    </Text>
                    <TouchableOpacity onPress={submit} disabled={submitting} style={styles.iconBtn}>
                        {submitting ? (
                            <ActivityIndicator color={colors.primary} />
                        ) : (
                            <Text style={{ color: colors.primary, fontWeight: '700' }}>Save</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
                    <Field label="Title *" colors={colors}>
                        <TextInput
                            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                            placeholder="Short summary"
                            placeholderTextColor={colors.textSecondary}
                            value={title}
                            onChangeText={setTitle}
                            autoFocus={!isEdit}
                        />
                    </Field>

                    <Field label="Location" colors={colors}>
                        <TextInput
                            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                            placeholder="Where is this happening?"
                            placeholderTextColor={colors.textSecondary}
                            value={location}
                            onChangeText={setLocation}
                        />
                    </Field>

                    {categories.length > 0 ? (
                        <Field label="Category" colors={colors}>
                            <View style={styles.chipRow}>
                                {categories.map((cat) => {
                                    const active = categoryId === cat.id;
                                    return (
                                        <TouchableOpacity
                                            key={cat.id}
                                            onPress={() => setCategoryId(active ? null : cat.id)}
                                            style={[styles.chip, {
                                                borderColor: active ? colors.primary : colors.border,
                                                backgroundColor: active ? colors.primary + '22' : colors.cardBackground,
                                            }]}
                                        >
                                            <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: 13 }}>
                                                {cat.label || cat.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </Field>
                    ) : (
                        <View style={[styles.note, { borderColor: colors.border }]}>
                            <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                                No categories are configured.
                            </Text>
                        </View>
                    )}

                    <Field label="Priority" colors={colors}>
                        <View style={styles.chipRow}>
                            {PRIORITIES.map((p) => {
                                const active = priority === p.value;
                                const meta = PRIORITY_META[p.value];
                                const c = meta.color(colors);
                                return (
                                    <TouchableOpacity
                                        key={p.value}
                                        onPress={() => setPriority(p.value)}
                                        style={[styles.chip, {
                                            borderColor: active ? c : colors.border,
                                            backgroundColor: active ? c + '22' : colors.cardBackground,
                                        }]}
                                    >
                                        <Ionicons name={meta.icon} size={13} color={active ? c : colors.textSecondary} />
                                        <Text style={{ color: active ? c : colors.textPrimary, fontSize: 13 }}>
                                            {p.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Field>

                    <Field label="Description" colors={colors}>
                        <TextInput
                            style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                            placeholder="Provide details so we can act on it"
                            placeholderTextColor={colors.textSecondary}
                            value={description}
                            onChangeText={setDescription}
                            multiline
                            textAlignVertical="top"
                        />
                    </Field>

                    <Field label="Photos" colors={colors}>
                        <View style={styles.photoActions}>
                            <TouchableOpacity
                                onPress={handleCapturePhoto}
                                style={[styles.photoBtn, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                            >
                                <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>Take photo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handlePickPhoto}
                                style={[styles.photoBtn, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}
                            >
                                <Ionicons name="image-outline" size={18} color={colors.textPrimary} />
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>From library</Text>
                            </TouchableOpacity>
                        </View>
                        {photos.length > 0 ? (
                            <View style={styles.thumbnailRow}>
                                {photos.map((p, i) => (
                                    <View key={p.uri} style={styles.thumbnailWrap}>
                                        <Image source={{ uri: p.uri }} style={styles.thumbnail} />
                                        <TouchableOpacity
                                            onPress={() => removePhoto(i)}
                                            style={[styles.thumbnailRemove, { backgroundColor: colors.error || '#ff3300' }]}
                                        >
                                            <Ionicons name="close" size={14} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </Field>
                </ScrollView>
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
    textarea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 100 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderRadius: 999,
        paddingHorizontal: 12, paddingVertical: 6,
    },
    note: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
    },
    photoActions: { flexDirection: 'row', gap: 10 },
    photoBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 12, paddingVertical: 10,
        borderWidth: 1, borderRadius: 8, flex: 1, justifyContent: 'center',
    },
    thumbnailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    thumbnailWrap: { position: 'relative' },
    thumbnail: { width: 84, height: 84, borderRadius: 8 },
    thumbnailRemove: {
        position: 'absolute', top: -6, right: -6,
        width: 22, height: 22, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
    },
});
