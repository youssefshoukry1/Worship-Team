'use client';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { isNavigationBusy, waitForNavigationIdle } from '../utils/navigationWork';
import { createNavigationStateQueue } from './navigationStateQueue';

export default function useNavigationState(initial, enabled, normalize) {
    const [value, setValue] = useState(initial);
    const queue = useRef(null);
    useLayoutEffect(() => {
        if (!enabled) return;
        const current = createNavigationStateQueue(update => setValue(previous => {
            const next = update(previous);
            return normalize ? normalize(previous, next) : next;
        }), isNavigationBusy, waitForNavigationIdle);
        queue.current = current;
        return () => { current.dispose(); queue.current = null; };
    }, [enabled, normalize]);
    const set = useCallback(update => queue.current?.push(update), []);
    return [value, set];
}
