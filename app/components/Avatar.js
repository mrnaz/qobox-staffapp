import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Theme from '../context/ThemeContext';
import { avatarColors } from '../utils/colors';
import { avatarText } from '../utils/displayName';

// Avatar with automatic fallback to initials if the photo URL fails to load
// (404, broken media URL, network error, etc.). Reused across the app.
//
// Props:
//   uri      string | null  — remote image URL
//   name     string          — full name, used to compute initials
//   size     number          — square size in dp (default 36)
//   id       number|string  — entity id; picks the same tint the web app gives
//                             this person (see avatarColors)
//   bgColor  string          — override the computed background
//   textColor string         — override the computed initials color
//   bordered bool            — hairline ring; used where the avatar sits on
//                             the page rather than inside a card


export default function Avatar({ uri, name, id, size = 36, bgColor, textColor, bordered = false }) {
    const { useTheme } = Theme;
    const { theme, mode } = useTheme();
    const { colors } = theme;
    const tint = avatarColors(id, name, mode);
    const [failed, setFailed] = useState(false);

    // If the URI changes (e.g. switching users), reset the failure flag so we
    // re-attempt loading the new image.
    useEffect(() => { setFailed(false); }, [uri]);

    const radius = size / 2;
    const showImage = uri && !failed;
    const ring = bordered
        ? { borderWidth: 2, borderColor: colors.borderStrong || colors.border }
        : null;

    if (showImage) {
        return (
            <Image
                source={{ uri }}
                onError={() => setFailed(true)}
                style={[{ width: size, height: size, borderRadius: radius }, ring]}
            />
        );
    }

    return (
        <View
            style={[
                styles.placeholder,
                {
                    width: size, height: size, borderRadius: radius,
                    backgroundColor: bgColor || tint.bg,
                },
                ring,
            ]}
        >
            <Text
                style={[
                    styles.text,
                    { color: textColor || tint.text, fontSize: Math.max(10, size * 0.38) },
                ]}
            >
                {avatarText(name) || '?'}
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
