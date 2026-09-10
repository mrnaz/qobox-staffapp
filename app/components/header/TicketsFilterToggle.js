import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Theme from '../../context/ThemeContext';
import { useTicketsFilter } from '../../context/TicketsFilterContext';

// Rendered next to the "Tickets" title in the shared page header
// ((main)/_layout.js) so the Submitted/Assigned toggle lives at the top of
// the page instead of in the Tickets screen's own toolbar.
export default function TicketsFilterToggle() {
    const { useTheme } = Theme;
    const { theme } = useTheme();
    const { colors } = theme;
    const { filter, setFilter } = useTicketsFilter();

    const option = (key, label) => (
        <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: filter === key ? colors.primary : 'transparent',
            }}
        >
            <Text style={{
                fontSize: 12,
                fontWeight: '600',
                color: filter === key ? colors.onPrimary : colors.textSecondary,
            }}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <View style={{
            flexDirection: 'row',
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        }}>
            {option('submitted', 'Submitted')}
            {option('assigned', 'Assigned')}
        </View>
    );
}
