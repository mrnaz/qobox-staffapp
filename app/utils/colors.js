// Color palette used by progress-report rubrics. Mirrors the qobox web
// `resources/js/utils/colors.js` palette so dots look identical on mobile.
//
// Each entry exposes `light` and `dark` variants. Use `resolveRubricColor(name)`
// to get a single hex string suitable for a dot background. Falls back to
// neutral gray when the name is unknown / null.

const PALETTE = {
    Purple:    { light: { bg: '#E5D8FD', text: '#6E4DD8' }, dark: { bg: '#3B2E66', text: '#B49CF0' } },
    Indigo:    { light: { bg: '#D6DEFF', text: '#3F51B5' }, dark: { bg: '#2C3667', text: '#A6B5FF' } },
    Azure:     { light: { bg: '#CFE8FF', text: '#1E88E5' }, dark: { bg: '#1F3B5E', text: '#9CC8F2' } },
    Teal:      { light: { bg: '#CFEFEC', text: '#00897B' }, dark: { bg: '#1F4641', text: '#88D1C8' } },
    Cyan:      { light: { bg: '#CCEEF3', text: '#0097A7' }, dark: { bg: '#1F4147', text: '#7FC8D2' } },
    Turquoise: { light: { bg: '#CCEFE4', text: '#00897B' }, dark: { bg: '#1F4640', text: '#7AC5B0' } },
    Lime:      { light: { bg: '#E2F2C8', text: '#7CB342' }, dark: { bg: '#3D4924', text: '#B2D687' } },
    Emerald:   { light: { bg: '#CFE9D7', text: '#2E7D32' }, dark: { bg: '#1F3F26', text: '#84C593' } },
    Sunflower: { light: { bg: '#FFEDC2', text: '#F57F17' }, dark: { bg: '#5E441A', text: '#FCC97B' } },
    Amber:     { light: { bg: '#FFE6BF', text: '#E65100' }, dark: { bg: '#5E3B15', text: '#FBB67E' } },
    Tangerine: { light: { bg: '#FFD8C1', text: '#E64A19' }, dark: { bg: '#5E2E15', text: '#FBA983' } },
    Ruby:      { light: { bg: '#FFD1D1', text: '#C62828' }, dark: { bg: '#5C1F1F', text: '#F49494' } },
    Rose:      { light: { bg: '#FFD8E1', text: '#C2185B' }, dark: { bg: '#5C1F31', text: '#F498B5' } },
    Magenta:   { light: { bg: '#F8CCE5', text: '#AD1457' }, dark: { bg: '#52203C', text: '#E090BC' } },
    Steel:     { light: { bg: '#D6DCE0', text: '#455A64' }, dark: { bg: '#2A3338', text: '#9CB1BD' } },
    Choco:     { light: { bg: '#E3D4C8', text: '#825C35' }, dark: { bg: '#41332C', text: '#A67758' } },
};

const NEUTRAL = '#9ca3af';

// `value` can be:
//   - a color name string (e.g. "Ruby")  ← current backend format
//   - an object with .light/.dark.background  ← legacy backend format
//   - null/undefined
// `mode` is 'light' (default) or 'dark'. Returns a hex string for the dot bg.
export function resolveRubricColor(value, mode = 'light') {
    if (!value) return NEUTRAL;

    // Legacy object form
    if (typeof value === 'object') {
        return value[mode]?.background || value.light?.background || value.dark?.background || NEUTRAL;
    }

    // String name → palette lookup
    const entry = PALETTE[value];
    if (!entry) return NEUTRAL;
    return entry[mode]?.bg || entry.light.bg;
}

// Rubric dot colour. Rubrics created through the web get a colour assigned by
// position (colorsPalette[index % length] in StoreUpdateProgressReportAssessment
// Dialog.vue), but older rows have none and were all rendering grey. Fall back
// to the same position-based colour so a scale reads as distinct steps.
const PALETTE_NAMES = Object.keys(PALETTE);

export function rubricColor(rubric, index = 0, mode = 'light') {
    if (rubric?.color) return resolveRubricColor(rubric.color, mode);
    const name = PALETTE_NAMES[index % PALETTE_NAMES.length];
    return resolveRubricColor(name, mode);
}

// Avatar tint, matching the web app exactly: resources/js/components/avatar/
// Avatar.vue picks colorsPalette[(id % 13) + 1], so the same person keeps the
// same colour on both. Index 0 (Purple) and the last two are intentionally
// never used there.
const AVATAR_PALETTE = [
    { light: { bg: '#EBDEF7', text: '#9E60FD' }, dark: { bg: '#473769', text: '#994DFF' } }, // Purple
    { light: { bg: '#E1E1F7', text: '#7B6EFD' }, dark: { bg: '#31377E', text: '#6C61FF' } }, // Indigo
    { light: { bg: '#D6E8F7', text: '#2C7AFE' }, dark: { bg: '#28465F', text: '#378EEF' } }, // Azure
    { light: { bg: '#DBE9E9', text: '#008080' }, dark: { bg: '#27454B', text: '#2DA3A4' } }, // Teal
    { light: { bg: '#C5F4F4', text: '#00B7A9' }, dark: { bg: '#2B4A51', text: '#11AC9C' } }, // Cyan
    { light: { bg: '#C5F4E1', text: '#00C560' }, dark: { bg: '#2A4D48', text: '#0CC16C' } }, // Turquoise
    { light: { bg: '#CAF5CA', text: '#00C400' }, dark: { bg: '#2B4A39', text: '#11B516' } }, // Lime
    { light: { bg: '#DFEDBB', text: '#6DC400' }, dark: { bg: '#3C4A37', text: '#6DB011' } }, // Emerald
    { light: { bg: '#F4F4B6', text: '#C4B700' }, dark: { bg: '#41483C', text: '#B2B52B' } }, // Sunflower
    { light: { bg: '#F8E8C5', text: '#DD9213' }, dark: { bg: '#494637', text: '#DB9B0B' } }, // Amber
    { light: { bg: '#F7E2D1', text: '#FF7000' }, dark: { bg: '#534234', text: '#E56907' } }, // Tangerine
    { light: { bg: '#F7DBDB', text: '#FE2323' }, dark: { bg: '#532F34', text: '#F23839' } }, // Ruby
    { light: { bg: '#F7DDEA', text: '#FF008E' }, dark: { bg: '#552E4B', text: '#EF1C92' } }, // Rose
    { light: { bg: '#F7DBF7', text: '#FF00FF' }, dark: { bg: '#552E62', text: '#E906EB' } }, // Magenta
];

// `id` is the entity id (client/staff). Falls back to a stable hash of the
// name so an avatar without an id still gets a consistent colour.
export function avatarColors(id, name, mode = 'light') {
    let n = Number(id);
    if (!Number.isFinite(n)) {
        n = 0;
        for (const ch of String(name || '')) n = (n * 31 + ch.charCodeAt(0)) % 100000;
    }
    const entry = AVATAR_PALETTE[(Math.abs(n) % 13) + 1];
    return entry[mode === 'dark' ? 'dark' : 'light'];
}
