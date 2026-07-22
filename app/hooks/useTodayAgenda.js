import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import api from '../services/api';
import { isToday } from '../utils/datetime';

const fmtDateForApi = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// First array-valued property among `keys`, else `v` if it's already an array.
const pickArray = (v, ...keys) => {
    for (const k of keys) if (Array.isArray(v?.[k])) return v[k];
    return Array.isArray(v) ? v : [];
};

// Loads today's classes, calendar events, and PTM meetings for a staff member,
// each filtered to today in the device-local timezone. A failure in one source
// never blanks the others (Promise.allSettled). Refetches whenever the consuming
// screen regains focus; `refresh` is exposed for pull-to-refresh.
//
// Shared by the dashboard (counts) and the Today page (full lists) so the
// today-filtering logic lives in exactly one place.
export default function useTodayAgenda(staffId, orgId) {
    const [classes, setClasses] = useState([]);
    const [events, setEvents] = useState([]);
    const [ptms, setPtms] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!staffId) {
            setClasses([]); setEvents([]); setPtms([]); setLoading(false);
            return;
        }
        setLoading(true);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const from = fmtDateForApi(today);
        const to = fmtDateForApi(tomorrow);

        const [tt, cal, pt] = await Promise.allSettled([
            api.getStaffTimetable(staffId, { start_date: from, end_date: to }),
            api.getCalendarEvents({ from, to, staff_id: staffId, org_id: orgId }),
            api.getStaffPtms(staffId, { start_date: from, end_date: to }),
        ]);

        setClasses(
            tt.status === 'fulfilled'
                ? pickArray(tt.value, 'timetable', 'data').filter((s) => isToday(s.session_start || s.start))
                : []
        );
        setEvents(
            cal.status === 'fulfilled'
                ? pickArray(cal.value, 'events', 'data').filter((e) => isToday(e.start_at || e.start_date || e.start))
                : []
        );
        setPtms(
            pt.status === 'fulfilled'
                ? pickArray(pt.value, 'ptms', 'data').filter((p) => isToday(p.timeslot?.ptm_start))
                : []
        );

        setLoading(false);
    }, [staffId, orgId]);

    useEffect(() => { load(); }, [load]);
    useFocusEffect(useCallback(() => { load(); }, [load]));

    return { classes, events, ptms, loading, refresh: load };
}
