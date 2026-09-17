'use client';
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';

const TOUR_KEY = 'taspe7_category_hymns_tour_done';

export function useCategoryHymnsTour(language) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(TOUR_KEY)) return;

    let timeoutId;
    let started = false;

    const startTour = () => {
      if (started) return;
      if (localStorage.getItem(TOUR_KEY)) return;
      started = true;

      const isAr = language === 'ar';
      const isDe = language === 'de';

      const isMobile = window.innerWidth < 640;
      const presSelector = isMobile ? '#tour-presentation-mobile' : '#tour-presentation-desktop';

      const rawSteps = [
        {
          element: '#tour-search-btn',
          popover: {
            title: isAr ? 'البحث' : isDe ? 'Suche' : 'Search',
            description: isAr
              ? 'ابحث عن أي ترنيمة بالاسم أو الكلمات أونلاين وأوفلاين.'
              : isDe
                ? 'Finde Lieder nach Titel oder Text online und offline.'
                : 'Search hymns by title or lyrics online and offline.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#tour-pray-btn',
          popover: {
            title: isAr ? 'وقت الصلاة' : isDe ? 'Gebetszeit' : 'Pray Time',
            description: isAr
              ? 'مساحة خاصة للصلاة والتأمل مع إمكانية تسجيل صلاتك وتدوينها.'
              : isDe
                ? 'Ein privater Bereich für Gebet und Besinnung mit der Möglichkeit, deine Gebete aufzunehmen und festzuhalten.'
                : 'A private space for prayer and reflection with the ability to record and journal your prayers.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#tour-bible-btn',
          popover: {
            title: isAr
              ? 'الكتاب المقدس'
              : isDe
                ? 'Bibel'
                : 'Bible',
            description: isAr
              ? 'اقرأ الكتاب المقدس مع تحليلات سريعة، مراجع، وتطبيقات عملية مدعومة بالذكاء الاصطناعي.'
              : isDe
                ? 'Bibel lesen mit schnellen Analysen, Querverweisen und praktischer Anwendung dank KI.'
                : 'Read the Bible with quick analysis, cross-references, and practical AI-powered application.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#tour-live-session',
          popover: {
            title: isAr ? 'غرفة المزامنة' : isDe ? 'Live-Sitzung' : 'Live Session',
            description: isAr
              ? 'بث مباشر ومزامنة الكلمات مع شاشات العرض والأصدقاء.'
              : isDe
                ? 'Liedtexte live auf Bildschirme übertragen und mit Freunden synchronisieren.'
                : 'Sync lyrics in real time with display screens and friends.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: presSelector,
          popover: {
            title: isAr ? 'وضع العرض' : isDe ? 'Präsentation' : 'Presentation',
            description: isAr
              ? 'عرض الكلمات بملء الشاشة مع التحكم السريع بالمقاطع.'
              : isDe
                ? 'Liedtexte im Vollbildmodus anzeigen und steuern.'
                : 'Display full-screen lyrics with instant section control.',
            side: isMobile ? 'bottom' : 'left',
            align: 'center',
          },
        }
      ];

      // Filter only steps with matching elements in the DOM
      const steps = rawSteps.filter(s => !!document.querySelector(s.element));
      if (steps.length === 0) return;

      const tourDriver = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: '#020617',
        overlayOpacity: 0.75,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: `taspe7-tour-popover ${isAr ? 'tour-rtl' : ''}`,
        nextBtnText: isAr ? 'التالي' : isDe ? 'Weiter' : 'Next',
        prevBtnText: isAr ? 'السابق' : isDe ? 'Zurück' : 'Back',
        doneBtnText: isAr ? 'تم' : isDe ? 'Fertig' : 'Done',
        progressText: '{{current}} / {{total}}',
        showButtons: ['next', 'previous'],
        onPopoverRender: (popover) => {
          const footer = popover.wrapper.querySelector('.driver-popover-footer');
          if (footer && !footer.querySelector('.tour-skip-btn')) {
            const skipBtn = document.createElement('button');
            skipBtn.className = 'tour-skip-btn';
            skipBtn.type = 'button';
            skipBtn.innerText = isAr ? 'تخطي' : isDe ? 'Überspringen' : 'Skip';
            skipBtn.onclick = () => tourDriver.destroy();
            footer.prepend(skipBtn);
          }
        },
        steps,
        onDestroyed: () => {
          localStorage.setItem(TOUR_KEY, '1');
        },
      });

      tourDriver.drive();

      // Tap overlay advances to next step
      const overlay = document.querySelector('.driver-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => {
          if (tourDriver.hasNextStep()) {
            tourDriver.moveNext();
          } else {
            tourDriver.destroy();
          }
        });
      }
    };

    // Check if splash intro is currently active or pending
    const isSplashActive = () => {
      return (
        window.__wasla_splash_active === true ||
        !!document.getElementById('wasla-splash-screen') ||
        (!window.__wasla_splash_done && !localStorage.getItem('wasla_splash_version'))
      );
    };

    if (isSplashActive()) {
      const handleSplashDone = () => {
        window.removeEventListener('wasla_splash_done', handleSplashDone);
        timeoutId = setTimeout(startTour, 600);
      };
      window.addEventListener('wasla_splash_done', handleSplashDone);
      return () => {
        window.removeEventListener('wasla_splash_done', handleSplashDone);
        clearTimeout(timeoutId);
      };
    }

    timeoutId = setTimeout(startTour, 800);
    return () => clearTimeout(timeoutId);
  }, [language]);
}



