import React from 'react';
import { View } from 'react-native';
import Theme from '../context/ThemeContext';

// Glass surface with three tiers:
//   1. Native Liquid Glass (iOS 26+ builds that include expo-glass-effect)
//   2. Frosted blur via expo-blur (older iOS, Android)
//   3. Translucent solid color (builds that predate these native modules)
//
// Tier 3 matters: the client's installed APK receives OTA JS updates, so a
// bare import of a native module that isn't compiled into that build would
// crash the app on launch. The guarded requires below make missing modules
// degrade to a plain translucent View instead.
let GlassView = null;
let BlurView = null;
try {
    const glass = require('expo-glass-effect');
    // Throws when the native module isn't compiled into the installed build.
    if (glass.isLiquidGlassAvailable?.()) GlassView = glass.GlassView;
} catch { /* native module not in this build */ }
try {
    // Requiring expo-blur never throws on a build without the native view —
    // it only fails at render. Check the view is actually registered first.
    if (globalThis.expo?.getViewConfig?.('ExpoBlurView')) {
        BlurView = require('expo-blur').BlurView;
    }
} catch { /* native module not in this build */ }

export default function GlassPanel({ style, intensity = 60, tintColor, children }) {
    const { useTheme } = Theme;
    const { mode } = useTheme();
    const dark = mode === 'dark';

    const clip = [{ overflow: 'hidden' }, style];

    if (GlassView) {
        // GlassView follows the system appearance, not the in-app theme, so
        // tint it toward the app's dark palette when the themes could differ.
        const tint = tintColor ?? (dark ? 'rgba(22, 22, 30, 0.45)' : undefined);
        return (
            <GlassView style={clip} glassEffectStyle="regular" tintColor={tint}>
                {children}
            </GlassView>
        );
    }

    if (BlurView) {
        return (
            <BlurView style={clip} intensity={intensity} tint={dark ? 'dark' : 'light'}>
                {children}
            </BlurView>
        );
    }

    const fallback = dark ? 'rgba(32, 32, 48, 0.94)' : 'rgba(255, 255, 255, 0.94)';
    return <View style={[{ backgroundColor: fallback }, clip]}>{children}</View>;
}
