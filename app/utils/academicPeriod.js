import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const STORAGE_KEY = 'academicPeriodId';

const pickCurrent = (periods) => {
    if (!Array.isArray(periods) || periods.length === 0) return null;
    const today = Date.now();

    const active = periods.filter((p) => {
        const start = p.period_start ? new Date(p.period_start).getTime() : null;
        const end = p.period_end ? new Date(p.period_end).getTime() : null;
        return start && end && today >= start && today <= end;
    });
    if (active.length) {
        // When several periods are active at once (common for multi-campus orgs),
        // prefer one the staff member actually teaches in — otherwise we can land
        // on a period where they have no classes and the screen looks empty.
        // Mirrors the Vue staff web (DefaultLayoutWithVerticalNav getAcademicPeriods).
        const teaching = active.find((p) => p.staff_teaches_in);
        return teaching || active[0];
    }

    // Fallback: the most recent period (latest period_start <= today),
    // or just the first one if none has started yet.
    const past = periods
        .filter((p) => p.period_start && new Date(p.period_start).getTime() <= today)
        .sort((a, b) => new Date(b.period_start) - new Date(a.period_start));
    return past[0] || periods[0];
};

export const getStoredPeriodId = async () => {
    return AsyncStorage.getItem(STORAGE_KEY);
};

// Returns { id, period } and persists the id. If a period is already stored
// and still in the fetched list, prefer it; otherwise auto-pick.
export const ensureAcademicPeriod = async () => {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    const res = await api.getAcademicPeriods();
    const periods = res?.academic_periods || [];

    let chosen = null;
    if (cached) {
        chosen = periods.find((p) => String(p.id) === String(cached));
    }
    if (!chosen) chosen = pickCurrent(periods);
    if (!chosen) return { id: null, period: null, periods };

    await AsyncStorage.setItem(STORAGE_KEY, String(chosen.id));
    return { id: chosen.id, period: chosen, periods };
};

// Persist an explicitly chosen period (from the in-app period switcher).
export const setAcademicPeriod = async (id) => {
    if (id === null || id === undefined) return;
    await AsyncStorage.setItem(STORAGE_KEY, String(id));
};

export const clearAcademicPeriod = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
