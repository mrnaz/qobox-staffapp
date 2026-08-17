import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import Theme from '../context/ThemeContext';
import { FontAwesome } from '@expo/vector-icons';
import { iconColor } from '../utils/iconColors';

export default function ThemeToggle() {
    const { useTheme } = Theme;
    const { mode, toggleMode, theme } = useTheme();
    const { colors } = theme;
    const icon = mode === 'dark' ? 'sun-o' : 'moon-o';

    return (
        <TouchableOpacity
            onPress={toggleMode}
            style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: colors.cardBackground,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
            }}
        >
            <FontAwesome
                name={icon}
                size={14}
                color={iconColor(icon, colors)}
            />
            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                {mode === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </Text>
        </TouchableOpacity>
    );
}
