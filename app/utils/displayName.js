// Ported from the web app so a person reads the same in both:
//   resources/js/utils/displayName.js
//   resources/js/@core/utils/formatters.js  (avatarText)
//
// The avatar variant matters: when someone has a preferred name, the web
// builds their initials from "<preferred> <sname>", not "<fname> <sname>".
export function displayName(person, { list = true, avatar = false, prefix = '' } = {}) {
    if (!person) return '';

    const fname = person[`${prefix}fname`] ?? '';
    const sname = person[`${prefix}sname`] ?? '';
    const preferred = person[`${prefix}preferred_name`];

    if (!preferred) return `${fname} ${sname}`.trim();
    if (avatar) return `${preferred} ${sname}`.trim();
    if (list) return `${fname} "${preferred}" ${sname}`.trim();
    return `"${preferred}" ${sname}`.trim();
}

// The web's avatarText, verbatim in behaviour.
export function avatarText(value) {
    if (!value) return '';
    const parts = String(value).split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return parts.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

// Name to feed an <Avatar> for a person record.
export const avatarName = (person) => displayName(person, { avatar: true });

export default displayName;
