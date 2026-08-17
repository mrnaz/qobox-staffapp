import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { parseApiDate } from '../utils/datetime';

// Live ticking timer showing elapsed time since `startTimeUtc`.
//
// `startTimeUtc` is a shift's start datetime as returned by the
// staff-roster-log/query endpoint. It may carry an explicit UTC offset
// (the `…_utc` fields, e.g. "2026-05-09 11:32:00+00") or be a zone-less,
// site-local string (e.g. "2026-05-09 11:32"). We parse it as an absolute
// instant — treating zone-less values as UTC — and diff against Date.now(),
// so the elapsed value ticks correctly.
//
// Note: Hermes (React Native's engine) rejects several of these string shapes
// that a browser would accept, which is why parsing goes through parseApiDate.
//
// Mirrors the Vue web's ShiftTimer behavior (see resources/js/_staff/views/pages/staff/shift-log/components/ShiftTimer.vue).
export default function ShiftTimer({ startTimeUtc, timezone, style }) {
    const [elapsedSec, setElapsedSec] = useState(0);

    useEffect(() => {
        // Zone-less values from the shift endpoints are the SITE's wall clock,
        // not UTC. Reading them as UTC put the start hours into the future for
        // an eastern site, and elapsed time is clamped at zero — which is why
        // the timer sat still instead of counting.
        const start = parseApiDate(startTimeUtc, { assumeUtc: !timezone, timeZone: timezone });
        if (!start) {
            setElapsedSec(0);
            return;
        }
        let startMs = start.getTime();

        // Belt and braces: if the server still hands us a start in the future,
        // count from now rather than freezing at zero.
        if (startMs > Date.now() + 60_000) startMs = Date.now();

        const compute = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
        compute();
        const id = setInterval(compute, 1000);
        return () => clearInterval(id);
    }, [startTimeUtc, timezone]);

    const days = Math.floor(elapsedSec / 86400);
    const hours = Math.floor((elapsedSec % 86400) / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    const secs = elapsedSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    const display = `${days > 0 ? `${days}d ` : ''}${hours}:${pad(mins)}:${pad(secs)}`;

    return <Text style={style}>{display}</Text>;
}
