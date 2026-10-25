import PageSkeleton from './components/PageSkeleton';

export default function Loading({ variant = 'cards' }) {
  return <PageSkeleton variant={variant} fullPage />;
}
