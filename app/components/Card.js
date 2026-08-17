import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Theme from '../context/ThemeContext';

// The app's card, matching the client app's day card
// (qobox-clientapp/app/components/Timetable.js): radius 16, the stronger
// border tone, and a soft shadow.
//
// The shadow is native-only on purpose. react-native-web turns the same
// offset into an unblurred box-shadow, which reads as a hard grey block
// rather than the soft Android elevation.
export const cardShadow = (colors) => (Platform.OS === 'web' ? null : {
    shadowColor: colors.cardShadow,
    shadowOffset: colors.cardShadowOffset,
    shadowOpacity: colors.cardShadowOpacity,
    elevation: colors.cardElevation,
});

export default function Card({ style, onPress, activeOpacity = 0.85, children, ...rest }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    // Two layers on purpose: the header band needs `overflow: 'hidden'` to
    // clip to the rounded corners, but on iOS that sets clipsToBounds, which
    // also clips the shadow away. So the outer layer carries the shadow and
    // the inner one does the clipping.
    const flat = StyleSheet.flatten(style) || {};
    const { margin, marginTop, marginBottom, marginLeft, marginRight,
        marginHorizontal, marginVertical, ...innerStyle } = flat;
    const outerStyle = [
        { borderRadius: innerStyle.borderRadius ?? styles.card.borderRadius },
        cardShadow(colors),
        { margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical },
    ];
    const cardStyle = [
        styles.card,
        {
            borderColor: colors.borderStrong || colors.border,
            backgroundColor: colors.cardBackground,
        },
        innerStyle,
    ];

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={activeOpacity}
                style={outerStyle}
                {...rest}
            >
                <View style={cardStyle}>{children}</View>
            </TouchableOpacity>
        );
    }
    return (
        <View style={outerStyle} {...rest}>
            <View style={cardStyle}>{children}</View>
        </View>
    );
}

// Tinted band across the top of a card. `title` sits left, `meta` (a count,
// a status, a control) right. Pass `children` instead for a custom layout.
export function CardHeader({ title, meta, style, numberOfLines = 2, children }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;

    return (
        <View
            style={[
                styles.header,
                { backgroundColor: colors.primary + '15', borderBottomColor: colors.border },
                style,
            ]}
        >
            {children ?? (
                <>
                    <Text
                        style={[styles.headerTitle, { color: colors.textPrimary }]}
                        numberOfLines={numberOfLines}
                    >
                        {title}
                    </Text>
                    {meta != null ? (
                        <Text style={[styles.headerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                            {meta}
                        </Text>
                    ) : null}
                </>
            )}
        </View>
    );
}

// Body padding for a card whose header reaches the edges.
export const cardBodyPadding = { paddingHorizontal: 16, paddingVertical: 12 };

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderRadius: 16,
        // Clips the header band to the rounded corners.
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
    headerMeta: { fontSize: 13, fontWeight: '600' },
});
