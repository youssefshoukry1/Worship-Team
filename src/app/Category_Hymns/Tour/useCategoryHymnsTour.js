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

    const timeout = setTimeout(() => {
      const isAr = language === 'ar';
      const isDe = language === 'de';

      // Pick the visible presentation button (mobile vs desktop)
      const isMobile = window.innerWidth < 640;
      const presEl = isMobile
        ? document.getElementById('tour-presentation-mobile')
        : document.getElementById('tour-presentation-desktop');
      const presSelector = isMobile ? '#tour-presentation-mobile' : '#tour-presentation-desktop';

      const steps = [
        {
          element: '#tour-search-btn',
          popover: {
            title: isAr ? '🔍 البحث' : isDe ? '🔍 Suche' : '🔍 Search',
            description: isAr
              ? 'استمتع بالسيرش الذكي اونلاين واوفلاين مقبول'
              : isDe
                ? 'Finde schnell jedes Lied nach Name oder Text'
                : 'Quickly find any hymn by name or lyrics',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#tour-categories',
          popover: {
            title: isAr ? '📂 التصنيفات' : isDe ? '📂 Kategorien' : '📂 Categories',
            description: isAr
              ? 'تصفح الترانيم حسب التصنيف: تسبيح، صليب، أطفال، والمزيد'
              : isDe
                ? 'Durchsuche Lieder nach Kategorie: Lobpreis, Kreuz, Kinder und mehr'
                : 'Browse hymns by category: Praise, Cross, Kids, and more',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#tour-bible-btn',
          popover: {
            title: isAr ? '📖 الكتاب المقدس' : isDe ? '📖 Bibel' : '📖 Bible',
            description: isAr
              ? 'افتح الكتاب المقدس، اقرأ الآيات، أضف ملاحظات وتظليلات'
              : isDe
                ? 'Öffne die Bibel, lies Verse, füge Notizen und Markierungen hinzu'
                : 'Open the Bible, read verses, add notes and highlights',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#tour-live-session',
          popover: {
            title: isAr ? '📡 غرفة المزامنة' : isDe ? '📡 Live-Sitzung' : '📡 Live Session',
            description: isAr
              ? 'أنشئ أو انضم لغرفة عرض مباشر لمزامنة الترانيم مع اصحابك'
              : isDe
                ? 'Erstelle oder tritt einem Live-Raum bei, um Lieder mit deinem Team zu synchronisieren'
                : 'Create or join a live room to sync hymns with your team',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: presSelector,
          popover: {
            title: isAr ? '🖥️ وضع العرض' : isDe ? '🖥️ Präsentation' : '🖥️ Presentation',
            description: isAr
              ? 'افتح وضع العرض لعرض الكلمات على الشاشة أثناء الخدمة'
              : isDe
                ? 'Öffne den Präsentationsmodus, um Liedtexte während des Gottesdienstes anzuzeigen'
                : 'Open presentation mode to display lyrics on screen during service',
            side: isMobile ? 'bottom' : 'left',
            align: 'center',
          },
        }
      ];

      // Add presentation step only if the button is rendered


      const tourDriver = driver({
        showProgress: true,
        animate: true,
        allowClose: false,
        overlayColor: '#000',
        overlayOpacity: 0.75,
        stagePadding: 10,
        stageRadius: 14,
        popoverClass: 'taspe7-tour-popover',
        nextBtnText: isAr ? 'التالي ←' : isDe ? 'Weiter →' : 'Next →',
        prevBtnText: isAr ? '→ السابق' : isDe ? '← Zurück' : '← Back',
        doneBtnText: isAr ? '✓ تم' : isDe ? '✓ Fertig' : '✓ Done',
        steps,
        onDestroyed: () => {
          localStorage.setItem(TOUR_KEY, '1');
        },
      });

      tourDriver.drive();

      // Tap overlay → advance to next step (not close)
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
    }, 1200);

    return () => clearTimeout(timeout);
  }, [language]);
}
