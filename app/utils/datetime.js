// Shared datetime helpers for parsing the various string shapes the qobox
// backend emits. React Native runs on Hermes, whose Date parser is stricter
// than V8 — several backend shapes that "just work" in a browser become
// `Invalid Date` on device (this is what froze the dashboard shift timer).
//
// Shapes observed from the staff API:
//   "2026-05-08 13:11"             — site-local, minute precision (open_shift.actual_start)
//   "2026-05-08 13:11:19"          — site-local, second precision
//   "2026-05-08 13:11:19+00"       — Postgres timestamptz raw, UTC (…_utc fields)
//   "2026-05-08T13:11:19.000000Z"  — ISO
//
// Hermes rejects a space separator and a colon-less offset ("+00"), and
// "+00Z" (offset AND Z) is invalid everywhere — so we normalize first.

const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Absolute instant. Respects an explicit timezone offset in the string. When
// the string carries no zone, `assumeUtc` decides whether to treat it as UTC
// (true) or device-local (false). Use this for elapsed-time math.
export const parseApiDate = (value, { assumeUtc = false } = {}) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(' ', 'T');

    // Explicit zone at the end? e.g. "Z", "+00", "+0000", "+10:30", "-05"
    const tz = s.match(/(Z|[+-]\d{2}(?::?\d{2})?)$/);
    if (tz) {
        const raw = tz[0];
        if (raw !== 'Z') {
            let off = raw;
            if (/^[+-]\d{2}$/.test(off)) off = `${off}:00`;            // "+00" → "+00:00"
            else if (/^[+-]\d{4}$/.test(off)) off = `${off.slice(0, 3)}:${off.slice(3)}`; // "+1030" → "+10:30"
            s = s.slice(0, s.length - raw.length) + off;
        }
    } else if (assumeUtc) {
        s = `${s}Z`;
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
};

// Wall-clock Date: the numbers in the string, taken verbatim as device-local
// components (any timezone designator is ignored). Use this for *display* of
// backend times that are already in the site's timezone, so the shown hours
// never shift with the device's own timezone.
export const parseWallClock = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const [, y, mo, da, h, mi, se] = m;
    return new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(se || 0));
};

// "7:14am" — no leading zero on the hour, lowercase meridiem, no space.
export const formatClock = (value) => {
    const d = parseWallClock(value);
    if (!d) return '';
    let h = d.getHours();
    const mer = h >= 12 ? 'pm' : 'am';
    h %= 12;
    if (h === 0) h = 12;
    return `${h}:${pad2(d.getMinutes())}${mer}`;
};

// "18 Jul 2026 @ 7:14am"
export const formatShiftStart = (value) => {
    const d = parseWallClock(value);
    if (!d) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} @ ${formatClock(d)}`;
};

// Normalize a backend time-of-day label ("4:30 pm", "04:30 PM") to "4:30pm".
export const normalizeTimeLabel = (label) => {
    if (!label) return '';
    return String(label).replace(/\s+/g, '').toLowerCase();
};

// True when the given backend datetime falls on the device's today (compared by
// wall-clock date components, consistent with how the roster surfaces "today").
export const isToday = (value) => {
    const d = parseWallClock(value);
    if (!d) return false;
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
};

// 'YYYY-MM-DD HH:mm' in the SITE's timezone, which is the shape the check-in and
// check-out endpoints expect. The Vue staff portal gets away with device-local
// time because those users sit in the same timezone as their site; on a phone we
// cannot assume that, so the instant is reformatted into the site's zone.
//
// Falls back to device-local when no timezone is supplied or it is unusable.
export const nowForApi = (timezone, when) => {
    const now = when instanceof Date ? when : new Date();

    if (!timezone) {
        return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} `
            + `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    }

    try {
        // 'en-CA' yields YYYY-MM-DD natively and 24-hour times under hour12:false.
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
            hour12: false,
        }).formatToParts(now);
        const get = (t) => parts.find((p) => p.type === t)?.value || '00';

        return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
    } catch {
        return nowForApi(undefined, now);
    }
};
