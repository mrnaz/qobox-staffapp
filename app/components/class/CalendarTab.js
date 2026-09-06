import React, { useCallback } from 'react';
import api from '../../services/api';
import CalendarView from '../CalendarView';

const startOf = (ev) => ev.start_at || ev.start_date || ev.start || ev.session_start || ev.date;
const endOf = (ev) => ev.end_at || ev.end_date || ev.end || ev.session_end;
const fmtDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "Calendar" tab — class-scoped agenda, using the same CalendarView the
// general Calendar screen uses (qobox-clientapp's layout + the calendar-type
// filter), scoped to this class's own sessions/events instead of org-wide.
export default function CalendarTab({ classId }) {
    const loadEvents = useCallback(async ({ from, to }) => {
        // Backend ClassesController@get_calendar reads start_date/end_date
        // (not from/to like the global calendar endpoint).
        const res = await api.getClassCalendar(classId, {
            start_date: fmtDate(from),
            end_date: fmtDate(to),
        });
        const list = res?.events || res?.calendar || res?.sessions || res?.data || res || [];
        // Normalize class-session field names to the shape CalendarView expects.
        return (Array.isArray(list) ? list : []).map((ev) => ({
            ...ev,
            title: ev.title || ev.name || ev.class_title || 'Session',
            start_at: startOf(ev),
            end_at: endOf(ev),
        }));
    }, [classId]);

    return <CalendarView loadEvents={loadEvents} reloadKey={classId} />;
}
