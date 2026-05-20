import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '../context/ThemeContext';

// Cross-platform toast. Stays mounted at the bottom of the screen as an
// absolutely-positioned overlay; show by passing a `message`. Auto-dismisses
// after `duration` ms (default 2500). Use variant=`error` for red, `success`
// for green, `info` for neutral.
//
// Usage:
//   const [toast, setToast] = useState(null);
//   ...
//   <Toast toast={toast} onHide={() => setToast(null)} />
//   ...
//   setToast({ message: 'Saved', variant: 'success' });
export default function Toast({ toast, onHide, duration = 2500 }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const insets = useSafeAreaInsets();
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    const hideTimer = useRef(null);

    useEffect(() => {
        if (!toast) return;
        // Fade-in + rise
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();

        // Auto-hide
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
                Animated.timing(translateY, { toValue: 20, duration: 180, useNativeDriver: true }),
            ]).start(() => onHide && onHide());
        }, duration);

        return () => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, [toast, duration, onHide, opacity, translateY]);

    if (!toast) return null;

    const variant = toast.variant || 'info';
    const palette = {
        success: { bg: (colors.success || '#22c55e') + 'EE', icon: 'checkmark-circle' },
        error:   { bg: (colors.error   || '#ef4444') + 'EE', icon: 'alert-circle' },
        info:    { bg: (colors.primary || '#3b82f6') + 'EE', icon: 'information-circle' },
    }[variant];

    return (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: 16 + (insets.bottom || 0) }]}>
            <Animated.View
                style={[
                    styles.toast,
                    { backgroundColor: palette.bg, opacity, transform: [{ translateY }] },
                ]}
            >
                <Ionicons name={palette.icon} size={18} color="#fff" />
                <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0, right: 0,
        alignItems: 'center',
        // High zIndex so we sit above save bars / sheets.
        zIndex: 9999,
        ...(Platform.OS === 'web' ? { pointerEvents: 'none' } : null),
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        maxWidth: '92%',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    text: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
