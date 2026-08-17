import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

// Time-only entry for the shift sheets.
//
// A check-in belongs to a shift that is already rostered for a given day, so
// the date is not the staff member's to change — only the time is. That also
// keeps us off Android's unsupported "datetime" mode (its ANDROID_MODE is
// only { date, time }), which threw and took the screen down.
export default function ShiftTimePicker({ visible, value, onChange, onClose }) {
    if (!visible) return null;

    return (
        <DateTimePicker
            value={value}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, date) => {
                // Android fires once and closes itself; iOS keeps the spinner open.
                if (Platform.OS === 'android') onClose?.();
                if (event?.type === 'dismissed' || !date) return;
                // Keep the shift's own date, take only the clock reading.
                const merged = new Date(value);
                merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
                onChange(merged);
            }}
        />
    );
}
