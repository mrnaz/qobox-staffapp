import { useCallback } from 'react';
import { useRouter } from 'expo-router';

// Back navigation that still works when there is no history to pop.
//
// On web a page refresh (or a pasted deep link) boots straight into a detail
// screen with an empty stack, so router.back() has nothing to return to and
// the button does nothing. Falling back to the screen's natural parent keeps
// the header chevron useful in that case.
export function useGoBack(fallback = '/(main)/') {
    const router = useRouter();
    return useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
    }, [router, fallback]);
}

export default useGoBack;
