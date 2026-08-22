import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Theme from '../context/ThemeContext';
import { tintOver } from '../utils/colors';

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

// `#RRGGBBAA` -> the same colour composited on what sits behind the card.
// That is the screen, not the card fill: this is the outermost layer, so a
// see-through colour here would show the page through. Anything else (an
// opaque colour, rgba(), a named colour, undefined) is returned untouched,
// falling back to the card background when nothing was given.
function flattenFill(fill, colors) {
    if (!fill) return colors.cardBackground;
    const match = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(String(fill).trim());
    if (!match) return fill;
    return tintOver('#' + match[1], colors.background, parseInt(match[2], 16) / 255);
}

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
        marginHorizontal, marginVertical, backgroundColor, ...innerStyle } = flat;

    // The fill lives on the outer layer, with the shadow. Android draws
    // `elevation` from the view's own background, so the layer that casts the
    // shadow must be the one that is painted.
    //
    // It must also be opaque. A see-through fill (`accent + '18'`) lets that
    // elevation shadow read through the card as a grey block on Android, so an
    // alpha fill is flattened onto the card background first: same colour, but
    // with nothing left to see through.
    const outerStyle = [
        {
            borderRadius: innerStyle.borderRadius ?? styles.card.borderRadius,
            backgroundColor: flattenFill(backgroundColor, colors),
        },
        cardShadow(colors),
        { margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical },
    ];
    const cardStyle = [
        styles.card,
        {
            borderColor: colors.borderStrong || colors.border,
            backgroundColor: 'transparent',
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

// The one gap between stacked cards. Taken from the student profile, where the
// spacing between the "Personal" and "Contact" cards is the reference the rest
// of the app is matched to — use it for list `gap` and for a card's own
// `marginBottom` so every screen breathes the same way.
export const cardGap = 16;

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
