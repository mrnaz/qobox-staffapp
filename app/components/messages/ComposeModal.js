import React, { useEffect, useRef, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import api from '../../services/api';
import Theme from '../../context/ThemeContext';
import Avatar from '../Avatar';
import Card from '../Card';
import ConfirmDialog from '../ConfirmDialog';
import { iconColor } from '../../utils/iconColors';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the client app's 10 MB cap

// New-message / forward / draft composer. Recipient search hits the global
// search endpoint with context=messaging (other staff, students, guardians of
// the token-site's org). Send goes through messages/send; drafts through
// messages (POST) / messages/{id} (PUT) without sent_at.
export default function ComposeModal({ visible, staff, initial = null, onClose, onDone }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const insets = useSafeAreaInsets();

    const [recipients, setRecipients] = useState([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(null); // 'send' | 'draft'
    const [formError, setFormError] = useState('');
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const searchSeq = useRef(0);

    // (Re)prime the form only on the closed -> open transition. `initial` is
    // often a fresh object literal from the parent, so depending on it here
    // would reset the form (wiping what the user typed) on every parent
    // re-render while the modal is open.
    const initialRef = useRef(initial);
    initialRef.current = initial;
    useEffect(() => {
        if (!visible) return;
        const seed = initialRef.current;
        setRecipients(seed?.recipients || []);
        setQuery('');
        setResults([]);
        setSubject(seed?.subject || '');
        setBody(seed?.body || '');
        setAttachments([]);
        setBusy(null);
        setFormError('');
    }, [visible]);

    // Debounced recipient search, min 2 chars.
    useEffect(() => {
        if (!visible) return;
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const seq = ++searchSeq.current;
        const t = setTimeout(async () => {
            try {
                const res = await api.searchMessageRecipients(q);
                if (seq !== searchSeq.current) return;
                const list = Array.isArray(res) ? res : res?.data || [];
                const chosen = new Set(recipients.map((r) => r.key));
                setResults(
                    list
                        .map((r) => ({
                            key: `${r.result_type || r.type}-${r.result_id || r.id}`,
                            result_type: r.result_type || r.type,
                            result_id: r.result_id,
                            full_name: r.full_name || `${r.fname || ''} ${r.sname || ''}`.trim(),
                            photo: r.photo || null,
                            tag: r.type || r.result_type || '',
                        }))
                        .filter((r) => r.result_id && !chosen.has(r.key))
                );
            } catch (err) {
                if (seq === searchSeq.current) setResults([]);
                console.error('Recipient search error', err);
            } finally {
                if (seq === searchSeq.current) setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query, visible, recipients]);

    const addRecipient = (r) => {
        setRecipients((prev) => [...prev, r]);
        setQuery('');
        setResults([]);
    };

    const removeRecipient = (key) => {
        setRecipients((prev) => prev.filter((r) => r.key !== key));
    };

    const pickFiles = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const ok = picked.assets.filter((a) => !a.size || a.size <= MAX_FILE_BYTES);
            if (ok.length < picked.assets.length) {
                setFormError('Files over 10 MB were skipped.');
            }
            if (ok.length === 0) return;

            setUploading(true);
            const form = new FormData();
            for (const a of ok) {
                form.append('files[]', {
                    uri: a.uri,
                    type: a.mimeType || 'application/octet-stream',
                    name: a.name || 'file',
                });
            }
            form.append('collection_name', 'message-attachments-temp');
            const res = await api.uploadTempFiles(form);
            const uploaded = (res?.temp_files || []).map((f) => ({
                id: f.id,
                name: f.name || f.file_name || 'file',
                size: f.size,
            }));
            setAttachments((prev) => [...prev, ...uploaded]);
        } catch (err) {
            console.error('Attachment upload error', err);
            setFormError(err.body?.message || err.message || 'Attachment upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const removeAttachment = async (file) => {
        setAttachments((prev) => prev.filter((a) => a.id !== file.id));
        api.removeTempFile(file.id).catch(() => {});
    };

    const hasContent = () =>
        recipients.length > 0 || subject.trim() || body.trim() || attachments.length > 0;

    const requestClose = () => {
        if (busy) return;
        if (hasContent() && !initial?.draftId) setConfirmDiscard(true);
        else onClose();
    };

    // `send` accepts either {staff_id}/{client_id} or {result_type, result_id},
    // but the draft endpoints only read the former — they write recipient rows
    // straight from these keys. Emit the shape both understand.
    const toRecipientPayload = (r) => {
        const t = String(r.result_type || '').toLowerCase();
        if (t === 'staff') return { staff_id: r.result_id };
        if (t === 'student' || t === 'guardian' || t === 'client') return { client_id: r.result_id };
        return { result_type: r.result_type, result_id: r.result_id };
    };

    const buildPayload = () => ({
        // `send` takes the sender from auth, but the draft endpoints persist
        // the row as-is — without this the insert violates the
        // "messages must have a sender" check constraint and 500s.
        sender_staff_id: staff?.id,
        message_subject: subject.trim(),
        message_body: body.trim(),
        recipients: recipients.map(toRecipientPayload),
        attachment_ids: attachments.map((a) => a.id),
    });

    const send = async () => {
        setFormError('');
        if (recipients.length === 0) {
            setFormError('Add at least one recipient.');
            return;
        }
        if (!body.trim()) {
            setFormError('Message body cannot be empty.');
            return;
        }
        try {
            setBusy('send');
            const payload = { ...buildPayload(), sent_at: true };
            if (initial?.draftId) payload.id = initial.draftId;
            await api.sendMessage(payload);
            onDone?.('sent');
        } catch (err) {
            console.error('Send message error', err);
            setFormError(err.body?.message || err.message || 'Could not send the message.');
        } finally {
            setBusy(null);
        }
    };

    const saveDraft = async () => {
        setFormError('');
        if (!hasContent()) {
            setFormError('Nothing to save yet.');
            return;
        }
        if (!staff?.id) {
            setFormError('Could not identify you. Please sign in again.');
            return;
        }
        // Saving rewrites the draft's recipient rows from this payload, so an
        // empty list would silently delete the ones it already has.
        if (initial?.draftId && recipients.length === 0) {
            setFormError('Add at least one recipient before saving this draft.');
            return;
        }
        try {
            setBusy('draft');
            const payload = buildPayload();
            if (initial?.draftId) await api.updateMessage(initial.draftId, payload);
            else await api.storeMessage(payload);
            onDone?.('draft');
        } catch (err) {
            console.error('Save draft error', err);
            setFormError(err.body?.message || err.message || 'Could not save the draft.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
            <KeyboardAvoidingView
                style={[styles.container, { backgroundColor: colors.background }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: 10 + insets.top }]}>
                    <TouchableOpacity onPress={requestClose} style={styles.iconBtn}>
                        <Ionicons name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                        {initial?.draftId ? 'Edit draft' : 'New message'}
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                    {/* Recipients */}
                    <Text style={[styles.label, { color: colors.textSecondary }]}>To</Text>
                    {recipients.length > 0 ? (
                        <View style={styles.chipsRow}>
                            {recipients.map((r) => (
                                <View
                                    key={r.key}
                                    style={[styles.chip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}
                                >
                                    <Avatar uri={r.photo} name={r.full_name} id={r.result_id} size={18} />
                                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                                        {r.full_name}
                                    </Text>
                                    <TouchableOpacity onPress={() => removeRecipient(r.key)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                        <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    ) : null}
                    <View style={[styles.input, styles.searchRow, { borderColor: colors.borderStrong || colors.border, backgroundColor: colors.inputBackground || colors.cardBackground }]}>
                        <Ionicons name="person-add-outline" size={15} color={iconColor('person-add-outline', colors)} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search staff, students, guardians…"
                            placeholderTextColor={colors.textSecondary}
                            style={{ flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 }}
                        />
                        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                    </View>
                    {results.length > 0 ? (
                        <Card style={styles.resultsBox}>
                            {results.slice(0, 8).map((r) => (
                                <TouchableOpacity key={r.key} onPress={() => addRecipient(r)} style={styles.resultRow}>
                                    <Avatar uri={r.photo} name={r.full_name} id={r.result_id} size={28} />
                                    <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }} numberOfLines={1}>
                                        {r.full_name}
                                    </Text>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, textTransform: 'capitalize' }}>
                                        {r.tag}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </Card>
                    ) : null}

                    {/* Subject */}
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Subject</Text>
                    <TextInput
                        value={subject}
                        onChangeText={setSubject}
                        placeholder="Subject (optional)"
                        placeholderTextColor={colors.textSecondary}
                        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.inputBackground || colors.cardBackground }]}
                    />

                    {/* Body */}
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Message</Text>
                    <TextInput
                        value={body}
                        onChangeText={setBody}
                        placeholder="Write your message…"
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                        style={[styles.input, styles.bodyInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.inputBackground || colors.cardBackground }]}
                    />

                    {/* Attachments */}
                    <View style={styles.attachHeader}>
                        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Attachments</Text>
                        <TouchableOpacity
                            onPress={pickFiles}
                            disabled={uploading}
                            style={[styles.attachBtn, { borderColor: colors.primary }]}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <>
                                    <Ionicons name="attach" size={14} color={colors.primary} />
                                    <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Add file</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                    {attachments.map((a) => (
                        <View key={a.id} style={[styles.attachmentRow, { borderColor: colors.border, backgroundColor: colors.cardBackground }]}>
                            <Ionicons name="document-outline" size={16} color={iconColor('document-outline', colors)} />
                            <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }} numberOfLines={1}>
                                {a.name}
                            </Text>
                            <TouchableOpacity onPress={() => removeAttachment(a)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    ))}

                    {formError ? (
                        <Text style={{ color: colors.error || '#ef4444', fontSize: 13, marginTop: 8 }}>{formError}</Text>
                    ) : null}
                </ScrollView>

                {/* Pinned footer */}
                <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: 12 + insets.bottom }]}>
                    <TouchableOpacity
                        onPress={saveDraft}
                        disabled={!!busy || uploading}
                        style={[styles.footerBtn, { borderColor: colors.border }]}
                    >
                        {busy === 'draft' ? (
                            <ActivityIndicator size="small" color={colors.textPrimary} />
                        ) : (
                            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Save draft</Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={send}
                        disabled={!!busy || uploading}
                        style={[styles.footerBtn, styles.sendBtn, { backgroundColor: colors.primary }, (!!busy || uploading) && { opacity: 0.6 }]}
                    >
                        {busy === 'send' ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="send" size={15} color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <ConfirmDialog
                    visible={confirmDiscard}
                    title="Discard message"
                    message="You have unsent changes. Discard them?"
                    confirmLabel="Discard"
                    destructive
                    onConfirm={() => { setConfirmDiscard(false); onClose(); }}
                    onCancel={() => setConfirmDiscard(false)}
                />
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    iconBtn: { padding: 8, borderRadius: 999 },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    form: { padding: 16, paddingBottom: 24 },
    label: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 14,
        marginBottom: 6,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingLeft: 4,
        paddingRight: 8,
        paddingVertical: 4,
        maxWidth: '100%',
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
    },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    resultsBox: { marginTop: 6 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
    bodyInput: { minHeight: 130 },
    attachHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        marginBottom: 6,
    },
    attachBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    attachmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 6,
    },
    footer: {
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
        borderTopWidth: 1,
    },
    footerBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 13,
    },
    sendBtn: { borderWidth: 0 },
});
