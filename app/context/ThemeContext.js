import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes } from '../constants/theme';

const STORAGE_KEY = 'themeMode';

const ThemeContext = createContext({
    mode: 'dark',
    theme: themes.dark,
    setMode: (_mode) => {},
    toggleMode: () => {},
});

function ThemeProvider({ children }) {
    const [mode, setMode] = useState('dark');

    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored === 'light' || stored === 'dark') {
                    setMode(stored);
                }
            } catch {}
        })();
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
        }, 0);
        return () => clearTimeout(t);
    }, [mode]);

    const toggleMode = useCallback(() => {
        setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    const value = useMemo(() => ({
        mode,
        theme: mode === 'dark' ? themes.dark : themes.light,
        setMode,
        toggleMode,
    }), [mode]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

function useTheme() {
    return useContext(ThemeContext);
}

export default { ThemeProvider, useTheme };

