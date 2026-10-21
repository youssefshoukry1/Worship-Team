'use client';

import { useRouter } from 'next/navigation';
import { useBibleForm } from './useBibleForm';
import BibleReader from './BibleReader';

export { useBibleForm } from './useBibleForm';
// The reader is the page's primary content. Load it with the route so even a
// cached revisit cannot briefly commit the optional-panel loading screen.
// The optional reader inside Hymns keeps its own deferred boundary.
export const BibleForm = BibleReader;

export default function BibleFormPage() {
  const router = useRouter();
  const controller = useBibleForm({
    isOpen: true,
    presentationActive: false,
    onClose: () => router.back(),
    onPresent: () => {},
  });
  return <BibleForm controller={controller} isPage />;
}
