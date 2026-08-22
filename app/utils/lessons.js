// Shared reading of a lesson's schedule.
//
// A lesson row carries no date of its own — the API gives it one only through
// the session it is scheduled into. `class_session` is the upcoming one when
// the backend resolved it; otherwise the first entry of `class_sessions`.
export const lessonSession = (lesson) =>
    lesson?.class_session
    || (Array.isArray(lesson?.class_sessions) ? lesson.class_sessions[0] : null)
    || null;

const fmtDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// The API's timestamps are naive site-timezone strings ("2026-02-01 10:30").
// Hermes does not parse that shape reliably, so read the parts directly. Both
// ends share a timezone, which is all a duration needs.
const parseNaive = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(value ?? ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

// Minutes the session runs for. NOT `session_length` — that column holds a
// slot kind ('single', 'double'), so printing it as minutes reads "single min".
export const lessonDuration = (lesson) => {
    const session = lessonSession(lesson);
    const start = parseNaive(session?.session_start);
    const end = parseNaive(session?.session_end);
    if (start == null || end == null || end <= start) return null;
    return Math.round((end - start) / 60000);
};

// "18 Aug 2026 9:00am" when the backend pre-formatted it, else a plain date.
export const lessonWhen = (lesson) => {
    const session = lessonSession(lesson);
    return session?.session_start_formatted
        || fmtDate(session?.session_start || lesson?.lesson_date || lesson?.date);
};
