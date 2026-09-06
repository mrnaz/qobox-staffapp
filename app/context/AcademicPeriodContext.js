import { createContext, useContext, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { getStoredPeriodId, setAcademicPeriod, pickCurrent } from '../utils/academicPeriod';

const AcademicPeriodContext = createContext();

export const useAcademicPeriod = () => {
    const context = useContext(AcademicPeriodContext);
    if (!context) {
        throw new Error('useAcademicPeriod must be used within an AcademicPeriodProvider');
    }
    return context;
};

export const AcademicPeriodProvider = ({ children }) => {
    const [academicPeriodId, setAcademicPeriodId] = useState(null);
    const [periods, setPeriods] = useState([]);
    const [appRefreshKey, setAppRefreshKey] = useState(0);
    const [needsSelection, setNeedsSelection] = useState(false);
    const [candidates, setCandidates] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const resolvedOnce = useRef(false);

    useEffect(() => {
        if (resolvedOnce.current) return;
        resolvedOnce.current = true;
        resolve();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resolve = async () => {
        try {
            const [cached, res] = await Promise.all([
                getStoredPeriodId(),
                api.getAcademicPeriods(),
            ]);
            const list = res?.academic_periods || [];
            setPeriods(list);

            if (cached && list.find((p) => String(p.id) === String(cached))) {
                setAcademicPeriodId(String(cached));
                setIsReady(true);
                return;
            }

            const { chosen, active } = pickCurrent(list);
            if (chosen) {
                await setAcademicPeriod(chosen.id);
                setAcademicPeriodId(String(chosen.id));
                setIsReady(true);
                return;
            }
            if (active.length > 1) {
                // Ambiguous: two or more periods are active right now. Block
                // with a picker (rendered by the caller via `needsSelection`)
                // rather than guessing.
                setCandidates(active);
                setNeedsSelection(true);
                setIsReady(true);
                return;
            }
            // No periods returned at all — nothing to select.
            setIsReady(true);
        } catch (error) {
            console.error('Error resolving academic period:', error);
            setIsReady(true);
        }
    };

    const switchAcademicPeriod = async (id) => {
        await setAcademicPeriod(id);
        setAcademicPeriodId(String(id));
        setNeedsSelection(false);
        setCandidates([]);
        setAppRefreshKey((k) => k + 1);
    };

    const value = {
        academicPeriodId,
        periods,
        appRefreshKey,
        needsSelection,
        candidates,
        isReady,
        switchAcademicPeriod,
    };

    return (
        <AcademicPeriodContext.Provider value={value}>
            {children}
        </AcademicPeriodContext.Provider>
    );
};
