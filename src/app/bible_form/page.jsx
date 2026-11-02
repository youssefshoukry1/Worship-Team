'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BibleReader from './BibleReader';
import { usePresenter } from '../hooks/usePresenter';
import HymnPresentationView from '../hymns/HymnPresentation';
import { createFeatureBoundary } from '../components/DeferredFeature';

export { useBibleForm } from './useBibleForm';
export const BibleForm = BibleReader;
const Presentation = createFeatureBoundary(HymnPresentationView, 'presentation');

export default function BibleFormPage() {
  const router = useRouter();
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [showChords, setShowChords] = useState(false);
  const presenter = usePresenter({
    selectedLyricsHymn, setSelectedLyricsHymn, showChords, setShowChords,
    isBiblePage: true,
    onCloseBible: () => router.back(),
  });

  return (
    <>
      <BibleForm controller={presenter.bibleController} isPage />
      {presenter.showDataShow && selectedLyricsHymn && (
        <Presentation view={presenter} onLoadClose={() => presenter.setShowDataShow(false)} />
      )}
    </>
  );
}
