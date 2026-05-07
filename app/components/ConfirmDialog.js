import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
} from 'react-native';
import Theme from '../context/ThemeContext';

// Cross-platform confirm dialog. RN's `Alert.alert` is unreliable on Web
// (multi-button confirms often don't render), so we use a styled Modal that
// works the same on iOS / Android / Web.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <ConfirmDialog
//       visible={open}
//       title="Delete ticket?"
//       message="This will permanently remove it."
//       confirmLabel="Delete"
//       destructive
//       busy={isDeleting}
//       onCancel={() => setOpen(false)}
//       onConfirm={async () => { await doDelete(); setOpen(false); }}
//   />
export default function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    busy = false,
    onConfirm,
    onCancel,
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const confirmColor = destructive
        ? (colors.error || colors.warning)
        : colors.primary;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <TouchableOpacity
                activeOpacity={1}
                onPress={busy ? undefined : onCancel}
                style={styles.overlay}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {}}
                    style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                >
                    {title ? (
                        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                    ) : null}
                    {message ? (
                        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
                    ) : null}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            onPress={onCancel}
                            disabled={busy}
                            style={[styles.btn, styles.btnGhost, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
                        >
                            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                                {cancelLabel}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onConfirm}
                            disabled={busy}
                            style={[styles.btn, { backgroundColor: confirmColor, opacity: busy ? 0.7 : 1 }]}
                        >
                            {busy ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={{ color: '#fff', fontWeight: '700' }}>
                                    {confirmLabel}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        borderWidth: 1,
        borderRadius: 14,
        padding: 20,
        gap: 8,
    },
    title: { fontSize: 17, fontWeight: '700' },
    message: { fontSize: 14, lineHeight: 20, marginTop: 2 },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 16,
    },
    btn: {
        minWidth: 90,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnGhost: {
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
});
