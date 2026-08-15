import AsyncStorage from '@react-native-async-storage/async-storage';

// Message bodies come back as HTML from the web composer — flatten to plain
// text for list previews and bubbles (matches what the client app renders).
export function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Compact list-row date: time for today, "12 Mar" for this year, else with year.
// msg_sent arrives as "YYYY-MM-DD HH:mm:ss" in the site timezone — parse
// leniently and fall back to the raw string.
export function fmtMessageDate(value) {
    if (!value) return '';
    const d = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(value);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
}

// "To: Alice +2" summary for sent/draft rows.
export function recipientsSummary(message) {
    const list = message?.recipients || [];
    if (list.length === 0) return 'No recipients';
    const first = list[0]?.full_name || 'Recipient';
    return list.length > 1 ? `${first} +${list.length - 1}` : first;
}

// The red badge in StaffInfo reads staff.has_unread from the AsyncStorage
// 'staff' blob (written once at login). Keep it fresh from the inbox meta.
export async function persistUnreadCount(count) {
    if (typeof count !== 'number' || count < 0) return;
    try {
        const json = await AsyncStorage.getItem('staff');
        if (!json) return;
        const staff = JSON.parse(json);
        if (staff.has_unread === count) return;
        staff.has_unread = count;
        await AsyncStorage.setItem('staff', JSON.stringify(staff));
    } catch {}
}

export async function adjustUnreadCount(delta) {
    try {
        const json = await AsyncStorage.getItem('staff');
        if (!json) return;
        const staff = JSON.parse(json);
        const current = typeof staff.has_unread === 'number' ? staff.has_unread : 0;
        staff.has_unread = Math.max(0, current + delta);
        await AsyncStorage.setItem('staff', JSON.stringify(staff));
    } catch {}
}
