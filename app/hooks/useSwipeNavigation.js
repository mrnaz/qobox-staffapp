import { useRef, useState } from 'react';
import { PanResponder, Animated, Dimensions } from 'react-native';

/**
 * Custom hook for swipe navigation with animations
 * @param {Object} options - Configuration options
 * @param {Function} options.onNavigatePrev - Callback when swiping right (previous)
 * @param {Function} options.onNavigateNext - Callback when swiping left (next)
 * @param {Function} options.onTransitionComplete - Optional callback when transition animation completes
 * @param {boolean} options.enableFade - Whether to use fade animations (default: false)
 * @param {number} options.threshold - Swipe threshold as percentage of screen width (default: 0.3)
 * @param {Function} options.shouldRespond - Optional function to determine if gesture should be handled
 * @returns {Object} Object containing panResponder, slideAnim, fadeAnim, isTransitioning
 */
export const useSwipeNavigation = ({
    onNavigatePrev,
    onNavigateNext,
    onTransitionComplete,
    enableFade = false,
    threshold = 0.3,
    shouldRespond = () => true,
}) => {
    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const [isTransitioning, setIsTransitioning] = useState(false);

    const animateTransition = (direction) => {
        if (isTransitioning) return;

        setIsTransitioning(true);
        const screenWidth = Dimensions.get('window').width;

        if (enableFade) {
            // Full transition with fade (like Timetable)
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0.3,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: direction === 'next' ? -screenWidth : screenWidth,
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start(() => {
                // Execute navigation callback
                if (direction === 'next') {
                    onNavigateNext();
                } else {
                    onNavigatePrev();
                }

                // Reset animations and fade back in
                slideAnim.setValue(direction === 'next' ? screenWidth : -screenWidth);
                Animated.parallel([
                    Animated.timing(fadeAnim, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 100,
                        friction: 8
                    })
                ]).start(() => {
                    setIsTransitioning(false);
                    // Call completion callback if provided
                    if (onTransitionComplete) {
                        onTransitionComplete();
                    }
                });
            });
        } else {
            // Simple transition without fade (like Calendar)
            // Execute navigation callback immediately
            if (direction === 'next') {
                onNavigateNext();
            } else {
                onNavigatePrev();
            }

            // Animate back to original position
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 100,
                friction: 8
            }).start(() => {
                setIsTransitioning(false);
                // Call completion callback if provided
                if (onTransitionComplete) {
                    onTransitionComplete();
                }
            });
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Check if we should respond to this gesture
                if (!shouldRespond()) return false;

                // Only respond to horizontal swipes
                return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
            },
            onPanResponderGrant: () => {
                // Reset animations when gesture starts
                slideAnim.setValue(0);
            },
            onPanResponderMove: (evt, gestureState) => {
                // Only allow horizontal movement
                if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
                    slideAnim.setValue(gestureState.dx);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                const { dx, vx } = gestureState;
                const screenWidth = Dimensions.get('window').width;
                const swipeThreshold = screenWidth * threshold;

                // Determine if swipe is significant enough
                if (Math.abs(dx) > swipeThreshold || Math.abs(vx) > 0.5) {
                    if (dx > 0) {
                        // Swipe right - previous
                        animateTransition('prev');
                    } else {
                        // Swipe left - next
                        animateTransition('next');
                    }
                } else {
                    // Not enough movement, animate back to original position
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 100,
                        friction: 8
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                // Reset position if gesture is terminated
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 8
                }).start();
            },
        })
    ).current;

    return {
        panResponder,
        slideAnim,
        fadeAnim,
        isTransitioning,
    };
};
