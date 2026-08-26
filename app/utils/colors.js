// Color palette used by progress-report rubrics. Mirrors the qobox web
// `resources/js/utils/colors.js` palette so dots look identical on mobile.
//
// Each entry exposes `light` and `dark` variants. Use `resolveRubricColor(name)`
// to get a single hex string suitable for a dot background. Falls back to
// neutral gray when the name is unknown / null.

import { lightColors, darkColors } from '../constants/theme';

// Order matches the web app's colorsPalette (resources/js/utils/colors.js) so
// the same id maps to the same colour everywhere. Index 0 and the last two are
// intentionally skipped, matching Avatar.vue's `(id % 13) + 1`.
const AVATAR_KEYS = [
    'purple', 'indigo', 'azure', 'teal', 'cyan', 'turquoise', 'lime', 'emerald',
    'sunflower', 'amber', 'tangerine', 'ruby', 'rose', 'magenta', 'steel', 'choco',
];

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

// `id` is the entity id (client/staff). Falls back to a stable hash of the
// name so an avatar without an id still gets a consistent colour. Sourced
// from theme.js's chip colours (not a separate hardcoded palette) so tuning
// a chip colour in theme.js can't silently desync avatar tints again.
export function avatarColors(id, name, mode = 'light') {
    let n = Number(id);
    if (!Number.isFinite(n)) {
        n = 0;
        for (const ch of String(name || '')) n = (n * 31 + ch.charCodeAt(0)) % 100000;
    }
    const key = AVATAR_KEYS[(Math.abs(n) % 13) + 1];
    const palette = mode === 'dark' ? darkColors : lightColors;
    const { background, text } = palette[key];
    return { bg: background, text };
}

// Flatten a tint onto a background so the result is fully opaque.
//
// Translucent fills (`accent + '18'`) look right everywhere except Android,
// where a view that carries `elevation` and a see-through background lets the
// elevation shadow show through as a grey block. Blending to a solid colour
// gives the same appearance with nothing to see through.
export function tintOver(tint, background, alpha = 0.09) {
    const parse = (hex) => {
        const h = String(hex || '').trim().replace(/^#/, '');
        const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        // Only 6-digit hex blends; anything else (rgba(), a named colour)
        // falls through to the caller's original value.
        if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
        return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    };
    const fg = parse(tint);
    const bg = parse(background);
    if (!fg || !bg) return tint;
    const channel = (i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha));
    return '#' + [0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('');
}
