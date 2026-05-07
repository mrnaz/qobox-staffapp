import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const STORAGE_KEY = 'academicPeriodId';

const pickCurrent = (periods) => {
    if (!Array.isArray(periods) || periods.length === 0) return null;
    const today = Date.now();

    const containingToday = periods.find((p) => {
        const start = p.period_start ? new Date(p.period_start).getTime() : null;
        const end = p.period_end ? new Date(p.period_end).getTime() : null;
        return start && end && today >= start && today <= end;
    });
    if (containingToday) return containingToday;

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

export const clearAcademicPeriod = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
