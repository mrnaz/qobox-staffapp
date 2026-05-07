// ─── Light palette (Fable-inspired: warm cream, forest green, clean whites) ───
export const lightColors = {
    primary: '#2d5a3f',
    primaryLight: '#4a7a5a',
    primaryDark: '#1e4030',

    background: '#ede8e0',
    backgroundLight: '#f5f0eb',
    backgroundDark: '#e0d8ce',

    surface: '#ffffff',

    textPrimary: '#111111',
    textSecondary: '#444444',
    textDisabled: '#888280',

    success: '#2d5a3f',
    warning: '#b06820',
    error: '#b02820',
    info: '#1e5e96',

    border: '#c8bdb0',

    cardBackground: '#ffffff',
    cardShadow: '#000',
    cardShadowOpacity: 0,
    cardShadowRadius: 0,
    cardElevation: 0,
    cardShadowOffset: { width: 0, height: 0 },
    cardBorderWidth: 1,
    cardBorderRadius: 16,

    inputBackground: '#ede8df',
    divider: '#e5ddd4',

    onPrimary: '#ffffff',

    purple: {
        border: '#D7C0F9',
        background: '#EBDEF7',
        text: '#7a4fd6',
    },
    indigo: {
        border: '#C9C6F9',
        background: '#E1E1F7',
        text: '#5c50d6',
    },
    azure: {
        border: '#ACCBF9',
        background: '#D6E8F7',
        text: '#2060d6',
    },
    teal: {
        border: '#A4CECE',
        background: '#DBE9E9',
        text: '#006b6b',
    },
    cyan: {
        border: '#94E2DD',
        background: '#C5F4F4',
        text: '#009b8d',
    },
    turquoise: {
        border: '#94E6BE',
        background: '#C5F4E1',
        text: '#00a855',
    },
    lime: {
        border: '#97E697',
        background: '#CAF5CA',
        text: '#00a000',
    },
    emerald: {
        border: '#BFE18C',
        background: '#DFEDBB',
        text: '#5a9e00',
    },
    sunflower: {
        border: '#DAD68D',
        background: '#F4F4B6',
        text: '#a89700',
    },
    amber: {
        border: '#EED098',
        background: '#F8E8C5',
        text: '#b87800',
    },
    tangerine: {
        border: '#F9C69D',
        background: '#F7E2D1',
        text: '#d45e00',
    },
    ruby: {
        border: '#F9AEAE',
        background: '#F7DBDB',
        text: '#d01818',
    },
    rose: {
        border: '#F9A6D4',
        background: '#F7DDEA',
        text: '#cc0070',
    },
    magenta: {
        border: '#F9A4F9',
        background: '#F7DBF7',
        text: '#cc00cc',
    },
    steel: {
        border: '#CBCBCB',
        background: '#E7E7E7',
        text: '#666666',
    },
    choco: {
        border: '#CCB59F',
        background: '#E3D4C8',
        text: '#6b4420',
    },
};

// ─── Dark palette (warm dark, not cold blue-gray) ───────────────────────────
export const darkColors = {
    primary: '#52c97a',
    primaryLight: '#72e096',
    primaryDark: '#38a060',

    background: '#16161e',
    backgroundLight: '#202030',
    backgroundDark: '#0e0e14',

    surface: '#202030',

    textPrimary: '#f0ece4',
    textSecondary: '#b0b0c8',
    textDisabled: '#707080',

    success: '#52c97a',
    warning: '#e8a040',
    error: '#e85555',
    info: '#58a0e0',

    border: '#48485e',

    cardBackground: '#2a2a3e',
    cardShadow: '#000',
    cardShadowOpacity: 0,
    cardShadowRadius: 0,
    cardElevation: 0,
    cardShadowOffset: { width: 0, height: 0 },
    cardBorderWidth: 1,
    cardBorderRadius: 16,

    inputBackground: '#27273a',
    divider: '#35354a',

    onPrimary: '#ffffff',

    purple: {
        border: '#5B3E8F',
        background: '#473769',
        text: '#b070ff',
    },
    indigo: {
        border: '#47479F',
        background: '#31377E',
        text: '#8880ff',
    },
    azure: {
        border: '#2E5883',
        background: '#28465F',
        text: '#5aabff',
    },
    teal: {
        border: '#2B5F63',
        background: '#27454B',
        text: '#40c0c0',
    },
    cyan: {
        border: '#256262',
        background: '#2B4A51',
        text: '#20d0c0',
    },
    turquoise: {
        border: '#236A50',
        background: '#2A4D48',
        text: '#20d880',
    },
    lime: {
        border: '#256530',
        background: '#2B4A39',
        text: '#40d840',
    },
    emerald: {
        border: '#49642D',
        background: '#3C4A37',
        text: '#90d040',
    },
    sunflower: {
        border: '#5E6439',
        background: '#41483C',
        text: '#d0cc40',
    },
    amber: {
        border: '#6E5B2C',
        background: '#494637',
        text: '#e0a830',
    },
    tangerine: {
        border: '#774C29',
        background: '#534234',
        text: '#e07830',
    },
    ruby: {
        border: '#7B3438',
        background: '#532F34',
        text: '#f05050',
    },
    rose: {
        border: '#7B2B5E',
        background: '#552E4B',
        text: '#f040a8',
    },
    magenta: {
        border: '#7A2484',
        background: '#552E62',
        text: '#f040f0',
    },
    steel: {
        border: '#5D6267',
        background: '#434A50',
        text: '#c0c0c0',
    },
    choco: {
        border: '#665042',
        background: '#41332C',
        text: '#c09060',
    },
};

export const fontSizes = {
    xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
    '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48,
};

export const spacing = {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64,
};

export const borderRadius = {
    none: 0, sm: 6, md: 10, lg: 16, xl: 20, full: 9999,
};

export const shadows = {
    none: 'none',
};

export const colors = darkColors;

export const theme = {
    colors: darkColors, fontSizes, spacing, borderRadius, shadows,
};

export const themes = {
    light: { colors: lightColors, fontSizes, spacing, borderRadius, shadows },
    dark:  { colors: darkColors,  fontSizes, spacing, borderRadius, shadows },
};

export default theme;
