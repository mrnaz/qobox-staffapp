import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Theme from '../context/ThemeContext';

// Avatar with automatic fallback to initials if the photo URL fails to load
// (404, broken media URL, network error, etc.). Reused across the app.
//
// Props:
//   uri      string | null  — remote image URL
//   name     string          — full name, used to compute initials
//   size     number          — square size in dp (default 36)
//   bgColor  string          — placeholder background color (default theme.primary)
//   textColor string         — initials text color (default white)
const initialsOf = (name) =>
    String(name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || '?';

export default function Avatar({ uri, name, size = 36, bgColor, textColor = '#fff' }) {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const [failed, setFailed] = useState(false);

    // If the URI changes (e.g. switching users), reset the failure flag so we
    // re-attempt loading the new image.
    useEffect(() => { setFailed(false); }, [uri]);

    const radius = size / 2;
    const showImage = uri && !failed;

    if (showImage) {
        return (
            <Image
                source={{ uri }}
                onError={() => setFailed(true)}
                style={{ width: size, height: size, borderRadius: radius }}
            />
        );
    }

    return (
        <View
            style={[
                styles.placeholder,
                {
                    width: size, height: size, borderRadius: radius,
                    backgroundColor: bgColor || colors.primary,
                },
            ]}
        >
            <Text
                style={[
                    styles.text,
                    { color: textColor, fontSize: Math.max(10, size * 0.38) },
                ]}
            >
                {initialsOf(name)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    placeholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontWeight: '700',
    },
});
