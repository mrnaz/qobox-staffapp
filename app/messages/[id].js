import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Linking,
    SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Theme from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ComposeModal from '../components/messages/ComposeModal';
import { stripHtml, adjustUnreadCount } from '../utils/messages';

// Message reader: the opened message plus its replies as a chat-style
// timeline (mine right, theirs left), optional earlier-thread loading, and a
// pinned reply composer. Modeled on tickets/[id].js.
export default function MessageDetailScreen() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const router = useRouter();
    const { id } = useLocalSearchParams();

    const [staff, setStaff] = useState(null);
    const [message, setMessage] = useState(null);
    const [earlier, setEarlier] = useState(null); // null = not loaded, [] = loaded-empty
    const [loadingEarlier, setLoadingEarlier] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [forwardVisible, setForwardVisible] = useState(false);
    const [toast, setToast] = useState(null);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError('');
            const staffJson = await AsyncStorage.getItem('staff');
            let me = null;
            try { me = staffJson ? JSON.parse(staffJson) : null; } catch {}
            setStaff(me);

            const res = await api.getMessage(id);
            const msg = res?.data || res;
            setMessage(msg);

            // Mark read if my recipient row is unread; keep the avatar badge
            // count in sync without waiting for a fresh login.
            const mine = (msg?.recipients || []).find((r) => Number(r.staff_id) === Number(me?.id));
            if (mine && !mine.msg_read) {
                api.readMessage(msg.id).catch(() => {});
                adjustUnreadCount(-1);
            }
        } catch (err) {
            console.error('Message load error', err);
            setError(err.body?.message || err.message || 'Failed to load message.');
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const loadEarlier = async () => {
        try {
            setLoadingEarlier(true);
            const res = await api.getMessageThread(message.id);
            const all = res?.data || [];
            const replyIds = new Set((message.replies || []).map((r) => r.id));
            // Everything in the chain except the shown message and its own
            // replies (already rendered) — i.e. the history above this message.
            setEarlier(all.filter((m) => m.id !== message.id && !replyIds.has(m.id)));
        } catch (err) {
            console.error('Thread load error', err);
            setToast({ message: 'Could not load earlier messages.', variant: 'error' });
        } finally {
            setLoadingEarlier(false);
        }
    };

    const sendReply = async () => {
        const body = replyText.trim();
        if (!body || sendingReply) return;
        try {
            setSendingReply(true);
            // message_subject is required in practice: the backend reply
            // handler reads it unguarded and 500s when it is missing.
            const baseSubject = message.message_subject || '';
            await api.replyMessage({
                replyto: message.id,
                message_subject: baseSubject.startsWith('RE:') ? baseSubject : `RE: ${baseSubject}`.trim(),
                message_body: body,
            });
            setReplyText('');
            load();
        } catch (err) {
            console.error('Reply error', err);
            setToast({ message: err.body?.message || err.message || 'Reply failed.', variant: 'error' });
        } finally {
            setSendingReply(false);
        }
    };

    const myRecipientRow = useMemo(
        () => (message?.recipients || []).find((r) => Number(r.staff_id) === Number(staff?.id)),
        [message, staff]
    );
    const iAmSender = message && Number(message.sender_staff_id) === Number(staff?.id);

    const markUnread = async () => {
        try {
            await api.unreadMessage(message.id);
            adjustUnreadCount(1);
            router.back();
        } catch (err) {
            setToast({ message: err.body?.message || err.message || 'Could not mark unread.', variant: 'error' });
        }
    };

    const deleteThis = async () => {
        try {
            setDeleting(true);
            if (myRecipientRow) await api.deleteMessageRecipient(myRecipientRow.id);
            else await api.deleteMessage(message.id);
            router.back();
        } catch (err) {
            console.error('Delete message error', err);
            setToast({ message: err.body?.message || err.message || 'Delete failed.', variant: 'error' });
        } finally {
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    // Chronological timeline: earlier chain (if loaded) → the message → replies.
    const timeline = useMemo(() => {
        if (!message) return [];
        return [...(earlier || []), { ...message, __root: true }, ...(message.replies || [])];
    }, [message, earlier]);

    const renderBubble = (m) => {
        const mine = Number(m.sender_staff_id) === Number(staff?.id);
        const body = stripHtml(m.message_body);
        return (
            <View
                key={`${m.id}${m.__root ? '-root' : ''}`}
                style={[
                    styles.bubble,
                    mine
                        ? { alignSelf: 'flex-end', backgroundColor: colors.primary + '18', borderColor: colors.primary + '33' }
                        : { alignSelf: 'flex-start', backgroundColor: colors.cardBackground, borderColor: colors.border },
                    m.__root && styles.rootBubble,
                ]}
            >
                <View style={styles.bubbleHeader}>
                    {!mine ? <Avatar uri={m.photo} name={m.sender_full_name || '?'} size={22} /> : null}
                    <Text style={[styles.bubbleAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
                        {mine ? 'You' : m.sender_full_name || 'Unknown'}
                        {' · '}
                        {m.msg_sent_formatted || m.msg_sent || ''}
                    </Text>
                </View>
                {body ? (
                    <Text style={[styles.bubbleText, { color: colors.textPrimary }]}>{body}</Text>
                ) : null}
                {(m.attachments || []).map((a) => (
                    <TouchableOpacity
                        key={a.id}
                        onPress={() => a.original_url && Linking.openURL(a.original_url)}
                        style={[styles.attachment, { borderColor: colors.border, backgroundColor: colors.background }]}
                    >
                        <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
                        <Text style={[styles.attachmentName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {a.name || a.file_name || 'Attachment'}
                        </Text>
                        {a.human_readable_size ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{a.human_readable_size}</Text>
                        ) : null}
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {message?.message_subject || 'Message'}
                </Text>
                {message ? (
                    <View style={{ flexDirection: 'row' }}>
                        {myRecipientRow ? (
                            <TouchableOpacity onPress={markUnread} style={styles.iconBtn}>
                                <Ionicons name="mail-unread-outline" size={20} color={colors.textPrimary} />
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity onPress={() => setForwardVisible(true)} style={styles.iconBtn}>
                            <Ionicons name="arrow-redo-outline" size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setConfirmDelete(true)} style={styles.iconBtn}>
                            <Ionicons name="trash-outline" size={20} color={colors.error || '#ef4444'} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{error}</Text>
                    <TouchableOpacity onPress={load} style={[styles.retry, { borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                        {/* Earlier-thread loader (only when this message is a reply) */}
                        {message?.replyto && earlier === null ? (
                            <TouchableOpacity
                                onPress={loadEarlier}
                                disabled={loadingEarlier}
                                style={[styles.threadBtn, { borderColor: colors.border }]}
                            >
                                {loadingEarlier ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <>
                                        <Ionicons name="time-outline" size={14} color={colors.primary} />
                                        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>
                                            Load earlier messages
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        ) : null}

                        {timeline.map(renderBubble)}
                    </ScrollView>

                    {/* Pinned reply composer */}
                    <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                        <TextInput
                            value={replyText}
                            onChangeText={setReplyText}
                            placeholder="Write a reply…"
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            style={[
                                styles.composerInput,
                                { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardBackground },
                            ]}
                        />
                        <TouchableOpacity
                            onPress={sendReply}
                            disabled={!replyText.trim() || sendingReply}
                            style={[
                                styles.sendBtn,
                                { backgroundColor: colors.primary },
                                (!replyText.trim() || sendingReply) && { opacity: 0.5 },
                            ]}
                        >
                            {sendingReply ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="send" size={18} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            )}

            <ConfirmDialog
                visible={confirmDelete}
                title="Delete message"
                message="Delete this message? This cannot be undone here."
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onConfirm={deleteThis}
                onCancel={() => setConfirmDelete(false)}
            />

            <ComposeModal
                visible={forwardVisible}
                staff={staff}
                initial={message ? {
                    subject: `FW: ${message.message_subject || ''}`.trim(),
                    body: stripHtml(message.message_body),
                } : null}
                onClose={() => setForwardVisible(false)}
                onDone={() => {
                    setForwardVisible(false);
                    setToast({ message: 'Message sent', variant: 'success' });
                }}
            />

            <Toast toast={toast} onHide={() => setToast(null)} />
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
    iconBtn: { padding: 8, borderRadius: 999 },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    empty: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    body: { padding: 16, gap: 10, paddingBottom: 24 },
    threadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 8,
        marginBottom: 4,
    },
    bubble: {
        maxWidth: '90%',
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        gap: 6,
    },
    rootBubble: { maxWidth: '100%', alignSelf: 'stretch' },
    bubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    bubbleAuthor: { fontSize: 11, flexShrink: 1 },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    attachment: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    attachmentName: { flex: 1, fontSize: 12, fontWeight: '500' },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        padding: 12,
        borderTopWidth: 1,
    },
    composerInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 9,
        fontSize: 14,
        maxHeight: 120,
    },
    sendBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
