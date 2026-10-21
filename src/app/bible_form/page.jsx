'use client';

import { useRouter } from 'next/navigation';
import { useBibleForm } from './useBibleForm';
import { createDeferredFeature } from '../components/DeferredFeature';

export { useBibleForm } from './useBibleForm';
export const BibleForm = createDeferredFeature(() => import('./BibleReader'), 'Bible reader');

export default function BibleFormPage() {
  const router = useRouter();
  const controller = useBibleForm({
    isOpen: true,
    presentationActive: false,
    onClose: () => router.back(),
    onPresent: () => {},
  });
  return <BibleForm controller={controller} isPage onLoadClose={() => router.back()} />;
}
