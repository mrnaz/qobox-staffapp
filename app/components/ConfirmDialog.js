import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Theme from '../context/ThemeContext';

// Cross-platform confirm dialog. RN's `Alert.alert` is unreliable on Web
// (multi-button confirms often don't render), so we use a styled Modal that
// works the same on iOS / Android / Web.
//
// Optional `inputLabel` / `inputPlaceholder` add a single text field; the
// entered value is passed to `onConfirm(value)`. Set `inputRequired` to
// disable the confirm button until the user types something.
export default function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    busy = false,
    inputLabel,
    inputPlaceholder,
    inputRequired = false,
    inputMultiline = false,
    onConfirm,
    onCancel,
}) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    const [value, setValue] = useState('');
    useEffect(() => { if (!visible) setValue(''); }, [visible]);

    const confirmColor = destructive
        ? (colors.error || colors.warning)
        : colors.primary;

    const hasInput = !!inputPlaceholder || !!inputLabel;
    const canConfirm = !inputRequired || value.trim().length > 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onCancel}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
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

                        {hasInput ? (
                            <View style={{ marginTop: 12, gap: 6 }}>
                                {inputLabel ? (
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                                        {inputLabel}{inputRequired ? ' *' : ''}
                                    </Text>
                                ) : null}
                                <TextInput
                                    style={[
                                        inputMultiline ? styles.textarea : styles.input,
                                        {
                                            color: colors.textPrimary,
                                            borderColor: colors.border,
                                            backgroundColor: colors.background,
                                        },
                                    ]}
                                    placeholder={inputPlaceholder}
                                    placeholderTextColor={colors.textSecondary}
                                    value={value}
                                    onChangeText={setValue}
                                    multiline={inputMultiline}
                                    textAlignVertical={inputMultiline ? 'top' : 'auto'}
                                    autoFocus
                                    editable={!busy}
                                />
                            </View>
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
                                onPress={() => onConfirm(value.trim())}
                                disabled={busy || !canConfirm}
                                style={[
                                    styles.btn,
                                    { backgroundColor: confirmColor, opacity: busy || !canConfirm ? 0.5 : 1 },
                                ]}
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
            </KeyboardAvoidingView>
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
    inputLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
    },
    textarea: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        minHeight: 80,
    },
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
