import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { STORAGE_KEYS } from '../constants/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.academicPeriodId;

// Resolves which academic period should be active.
//   - Exactly one currently-active period -> { chosen: that period, active: [it] }
//   - Two or more currently-active periods -> { chosen: null, active: [all of them] }
//     (ambiguous — the caller must ask the user to pick one; this file no
//     longer silently tie-breaks via staff_teaches_in)
//   - No currently-active period -> { chosen: most recent past period, or the
//     first period if none has started yet, active: [] }
//   - No periods at all -> { chosen: null, active: [] }
export const pickCurrent = (periods) => {
    if (!Array.isArray(periods) || periods.length === 0) return { chosen: null, active: [] };
    const today = Date.now();

    const active = periods.filter((p) => {
        const start = p.period_start ? new Date(p.period_start).getTime() : null;
        const end = p.period_end ? new Date(p.period_end).getTime() : null;
        return start && end && today >= start && today <= end;
    });
    if (active.length === 1) return { chosen: active[0], active };
    if (active.length > 1) return { chosen: null, active };

    // Fallback: the most recent period (latest period_start <= today),
    // or just the first one if none has started yet.
    const past = periods
        .filter((p) => p.period_start && new Date(p.period_start).getTime() <= today)
        .sort((a, b) => new Date(b.period_start) - new Date(a.period_start));
    return { chosen: past[0] || periods[0] || null, active: [] };
};

export const getStoredPeriodId = async () => {
    return AsyncStorage.getItem(STORAGE_KEY);
};

// Returns { id, period } and persists the id. If a period is already stored
// and still in the fetched list, prefer it; otherwise auto-pick.
//
// Screens calling this directly (attendance, reports, student profile, etc.)
// assume a single definitive answer and run *after* AcademicPeriodProvider
// has already resolved the ambiguous-multi-active-period case at app start
// (see app/context/AcademicPeriodContext.js), so by the time these run there
// should always be a cached value. If one somehow isn't cached yet and
// `pickCurrent` reports ambiguity, fall back to the first active period
// rather than leaving the screen with no data — these call sites have no way
// to block on a user choice the way the provider's login-time prompt can.
export const ensureAcademicPeriod = async () => {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    const res = await api.getAcademicPeriods();
    const periods = res?.academic_periods || [];

    let chosen = null;
    if (cached) {
        chosen = periods.find((p) => String(p.id) === String(cached));
    }
    if (!chosen) {
        const result = pickCurrent(periods);
        chosen = result.chosen || result.active[0] || null;
    }
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
