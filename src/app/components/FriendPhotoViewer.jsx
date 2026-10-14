'use client';

import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import Portal from '../Portal/Portal';

export default function FriendPhotoViewer({ photo, onExpand, onClose }) {
  const dialogRef = useRef(null);
  const gestureRef = useRef(null);
  const swipeAnimationRef = useRef(null);
  const swipeY = useMotionValue(0);
  const backdropOpacity = useTransform(swipeY, (value) => {
    const height = typeof window === 'undefined' ? 1 : window.innerHeight;
    return Math.max(0, 1 - Math.abs(value) / height);
  });
  const isOpen = !!photo;
  const isFullScreen = !!photo?.fullScreen;
  const reduceMotion = useReducedMotion();
  const openingTransition = { duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] };

  useLayoutEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
    }
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        // Each view has one control: the preview photo or the back arrow.
        event.preventDefault();
        dialogRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      body.style.paddingRight = previousPadding;
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      gestureRef.current = null;
    };
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (isOpen) dialogRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [isOpen, isFullScreen]);

  useLayoutEffect(() => {
    swipeY.set(0);
    return () => {
      const animation = swipeAnimationRef.current;
      swipeAnimationRef.current = null;
      animation?.stop();
      gestureRef.current = null;
    };
  }, [isOpen, isFullScreen, swipeY]);

  const startSwipe = (event) => {
    if (!isFullScreen || !event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    const animation = swipeAnimationRef.current;
    swipeAnimationRef.current = null;
    animation?.stop();
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: swipeY.get() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event) => {
    const start = gestureRef.current;
    if (!start || start.id !== event.pointerId) return;
    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = event.clientY - start.y;
    // Track vertical movement directly, without dismissing while held.
    if (Math.abs(deltaY) > deltaX * 1.25 || start.dragging) {
      start.dragging = true;
      swipeY.set(start.offset + deltaY);
    }
  };

  const returnToCenter = () => {
    gestureRef.current = null;
    swipeAnimationRef.current = animate(swipeY, 0, {
      duration: reduceMotion ? 0 : 0.2,
      ease: [0.2, 0.8, 0.2, 1],
    });
  };

  const finishSwipe = (event) => {
    const start = gestureRef.current;
    if (!start || start.id !== event.pointerId) return;
    gestureRef.current = null;
    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = start.offset + event.clientY - start.y;
    if (start.dragging && Math.abs(deltaY) >= 70 && Math.abs(deltaY) > deltaX * 1.25) {
      const animation = animate(swipeY, Math.sign(deltaY) * window.innerHeight, {
        duration: reduceMotion ? 0 : 0.2,
        ease: [0.2, 0.8, 0.2, 1],
      });
      swipeAnimationRef.current = animation;
      animation.then(() => {
        if (swipeAnimationRef.current !== animation) return;
        swipeAnimationRef.current = null;
        onClose();
      });
    } else {
      returnToCenter();
    }
  };

  return (
    <Portal>
      {photo && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${photo.name || 'Friend'} profile picture${isFullScreen ? '' : ' preview'}`}
          data-lenis-prevent
          className={`fixed inset-0 z-[10001] flex justify-center overflow-hidden overscroll-none ${isFullScreen ? 'items-center' : 'items-start bg-black/70 p-6'}`}
          style={{
            touchAction: isFullScreen ? 'none' : 'manipulation',
            paddingTop: isFullScreen ? undefined : 'max(12.2dvh, env(safe-area-inset-top))',
          }}
          initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
          animate={{ backgroundColor: isFullScreen ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0.7)' }}
          transition={openingTransition}
          onClick={isFullScreen ? undefined : onClose}
          onPointerDown={startSwipe}
          onPointerMove={moveSwipe}
          onPointerUp={finishSwipe}
          onPointerCancel={returnToCenter}
          onLostPointerCapture={() => { if (gestureRef.current) returnToCenter(); }}
        >
          {isFullScreen ? (
            <>
              <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: backdropOpacity }} />
              <motion.div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-black p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white" style={{ opacity: backdropOpacity }}>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close profile picture"
                  className="rounded-full p-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <ArrowLeft className="h-6 w-6" />
                </button>
                <span className="text-lg">Profile picture</span>
              </motion.div>
              <motion.img
                src={photo.src}
                alt={`${photo.name || 'Friend'} profile picture`}
                draggable={false}
                className="relative max-h-[calc(100dvh-8rem)] max-w-full object-contain select-none"
                style={{ y: swipeY }}
                initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...openingTransition, duration: reduceMotion ? 0 : 0.4 }}
              />
            </>
          ) : (
            <motion.button
              type="button"
              aria-label={`View ${photo.name || 'friend'} profile picture full screen`}
              className="relative block aspect-square shrink-0 overflow-hidden bg-black text-left focus-visible:outline-2 focus-visible:outline-white"
              style={{ width: 'min(66.667vw, 32.5dvh, 20rem)' }}
              initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={openingTransition}
              onClick={(event) => {
                event.stopPropagation();
                onExpand();
              }}
            >
              <img src={photo.src} alt={photo.name || 'Friend'} draggable={false} className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/25 to-transparent px-3 py-1.5 text-lg leading-tight text-white">
                {photo.name}
              </span>
            </motion.button>
          )}
        </motion.div>
      )}
    </Portal>
  );
}
