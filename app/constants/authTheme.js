// Fixed palette for pre-login screens (login, register, otp, forgot-password,
// select-organisation, select-site). These screens intentionally ignore the
// light/dark theme toggle — a translucent dark "glass" card over a
// background image, always — so their colors live here instead of theme.js,
// which is for the toggleable in-app theme.
export const authTheme = {
    overlay: 'rgba(0, 0, 0, 0.2)',
    cardBackground: 'rgba(20, 20, 20, 0.6)',
    cardBackgroundSecondary: 'rgba(66, 69, 76, 0.65)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    siteRowBorder: 'rgba(255, 255, 255, 0.12)',
    cardShadow: '#000',
    inputBackground: '#42454C',

    text: '#ffffff',
    error: '#ff6b6b',
    success: '#10b981',
    successBg: 'rgba(16, 185, 129, 0.1)',
    successBorder: 'rgba(16, 185, 129, 0.2)',

    // Muted-white text steps, preserved at each screen's exact current
    // opacity rather than normalized to fewer values — see plan notes.
    textMuted40: 'rgba(255, 255, 255, 0.4)',
    textMuted45: 'rgba(255, 255, 255, 0.45)',
    textMuted50: 'rgba(255, 255, 255, 0.5)',
    textMuted55: 'rgba(255, 255, 255, 0.55)',
    textMuted60: 'rgba(255, 255, 255, 0.6)',
    textMuted65: 'rgba(255, 255, 255, 0.65)',
    textMuted70: 'rgba(255, 255, 255, 0.7)',
    textMuted85: 'rgba(255, 255, 255, 0.85)',
    trackOff: 'rgba(255, 255, 255, 0.2)',
};

export default authTheme;
