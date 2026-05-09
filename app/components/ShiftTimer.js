import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';

// Live ticking timer showing elapsed time since `startTimeUtc`.
//
// `startTimeUtc` is a UTC-naive string like "2026-05-09 11:32:00" (the
// `actual_start_utc` / `open_shift_actual_start_utc` field returned by the
// staff-roster-log/query endpoint). We treat it as UTC and diff against
// Date.now(), so the elapsed value is correct regardless of device timezone.
//
// Mirrors the Vue web's ShiftTimer behavior (see resources/js/_staff/views/pages/staff/shift-log/components/ShiftTimer.vue).
export default function ShiftTimer({ startTimeUtc, style }) {
    const [elapsedSec, setElapsedSec] = useState(0);

    useEffect(() => {
        if (!startTimeUtc) {
            setElapsedSec(0);
            return;
        }
        // Convert "2026-05-09 11:32:00" → "2026-05-09T11:32:00Z" so JS treats as UTC.
        const iso = startTimeUtc.replace(' ', 'T') + 'Z';
        const startMs = new Date(iso).getTime();
        if (Number.isNaN(startMs)) {
            setElapsedSec(0);
            return;
        }
        const compute = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
        compute();
        const id = setInterval(compute, 1000);
        return () => clearInterval(id);
    }, [startTimeUtc]);

    const days = Math.floor(elapsedSec / 86400);
    const hours = Math.floor((elapsedSec % 86400) / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    const secs = elapsedSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    const display = `${days > 0 ? `${days}d ` : ''}${hours}:${pad(mins)}:${pad(secs)}`;

    return <Text style={style}>{display}</Text>;
}
