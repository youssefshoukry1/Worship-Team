function Bar({ className = '' }) {
  return <div className={`rounded-lg bg-slate-400/20 ${className}`} />;
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-400/15 bg-slate-400/[0.04] p-4 ${className}`}>{children}</div>;
}

function TextLines({ count = 3 }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, index) => <Bar key={index} className={`h-3 ${index === count - 1 ? 'w-2/3' : 'w-full'}`} />)}</div>;
}

export function pageSkeletonVariant(pathname = '') {
  const route = (pathname || '').replace(/\/index\.html\/?$/i, '').replace(/\/$/, '');
  if (/^\/presentation(?:\/|$)/.test(route)) return 'presentation';
  if (route === '/bible_form') return 'bible';
  if (route === '/hymns') return 'hymns';
  if (route === '/friends') return 'friends';
  if (route === '/chat_team') return 'chat';
  if (route === '/plans' || route.startsWith('/billing')) return 'plans';
  if (route.includes('UserProfile') || route === '/Website_work_Profile') return 'profile';
  if (route.includes('Dashboard')) return 'dashboard';
  if (['/login', '/Register', '/forgot-password', '/reset-password'].includes(route)) return 'form';
  if (['/privacy-policy', '/subscription-terms', '/Donates'].includes(route)) return 'article';
  return 'cards';
}

// Only public shapes are rendered here. Cached content stays visible whenever
// it is ready; these placeholders neither fetch data nor delay the real page.
export default function PageSkeleton({ variant = 'cards', compact = false, fullPage = false, chrome = false, label = 'Loading' }) {
  let content;
  if (variant === 'form') {
    content = <Card className="w-full max-w-md mx-auto space-y-6 py-8"><Bar className="h-6 w-2/3 mx-auto" /><Bar className="h-3 w-4/5 mx-auto" /><Bar className="h-12 w-full" /><Bar className="h-12 w-full" /><Bar className="h-11 w-full" /></Card>;
  } else if (variant === 'profile') {
    content = <><Card className="flex items-center gap-5"><Bar className="h-20 w-20 shrink-0 rounded-full" /><div className="flex-1 space-y-4"><Bar className="h-6 w-1/2" /><Bar className="h-3 w-2/3" /><Bar className="h-3 w-1/3" /></div></Card><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map(index => <Card key={index}><Bar className="h-7 w-1/2 mb-3" /><Bar className="h-3 w-3/4" /></Card>)}</div><Card><TextLines count={4} /></Card><Card><TextLines /></Card></>;
  } else if (variant === 'bible' || variant === 'article') {
    content = <>{variant === 'bible' && <div className="grid grid-cols-3 gap-3"><Bar className="h-10" /><Bar className="h-10" /><Bar className="h-10" /></div>}{[0, 1, 2, 3].map(index => <Card key={index} className="py-6"><TextLines count={variant === 'bible' ? 3 : 5} /></Card>)}</>;
  } else if (variant === 'chat') {
    content = <div className="flex gap-4 min-h-[55vh]"><Card className="hidden md:block w-64 shrink-0 space-y-6">{[0, 1, 2, 3].map(index => <TextLines key={index} count={2} />)}</Card><div className="flex-1 flex flex-col gap-5">{[0, 1, 2, 3].map(index => <Card key={index} className={`w-4/5 sm:w-2/3 ${index % 2 ? 'self-end' : ''}`}><TextLines count={2} /></Card>)}<Bar className="h-12 w-full mt-auto" /></div></div>;
  } else if (variant === 'presentation') {
    content = <><Card className="flex min-h-[45vh] flex-col justify-center px-8 sm:px-20"><TextLines count={4} /></Card><div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map(index => <Card key={index}><Bar className="h-12" /></Card>)}</div></>;
  } else if (variant === 'plans' || variant === 'dashboard') {
    content = <><div className={`grid gap-4 ${variant === 'plans' ? 'sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>{[0, 1, ...(variant === 'dashboard' ? [2, 3] : [])].map(index => <Card key={index} className="space-y-5"><Bar className="h-5 w-1/2" /><Bar className="h-8 w-2/3" /><TextLines /><Bar className="h-10 w-full" /></Card>)}</div><Card className="space-y-6">{[0, 1, 2].map(index => <TextLines key={index} count={2} />)}</Card></>;
  } else {
    content = <>{!compact && <div className="flex gap-3"><Bar className="h-9 w-24" /><Bar className="h-9 w-24" /><Bar className="h-9 w-20" /></div>}{[0, 1, 2, 3].map(index => <Card key={index} className="space-y-4">{variant === 'friends' ? <div className="flex items-center gap-3"><Bar className="h-12 w-12 shrink-0 rounded-full" /><div className="flex-1"><TextLines count={2} /></div><Bar className="h-9 w-20" /></div> : <><Bar className="h-4 w-2/3" /><TextLines count={2} /><div className="flex gap-3"><Bar className="h-8 flex-1" /><Bar className="h-8 flex-1" /></div></>}</Card>)}</>;
  }

  return <div data-page-skeleton={variant} role="status" aria-label={label} aria-busy="true" className={fullPage ? 'min-h-screen w-full bg-[var(--app-bg)]' : 'w-full'}>
    <div aria-hidden="true" inert>
      {chrome && <div className="h-20 border-b border-white/5 flex items-center px-4"><Bar className="h-7 w-20" /></div>}
      <div className={`${compact ? 'py-4' : 'px-4 py-8'} ${variant === 'form' ? 'flex min-h-[65vh] items-center' : 'max-w-5xl mx-auto space-y-5'} motion-safe:animate-pulse`}>
        {!compact && !['form', 'profile', 'presentation'].includes(variant) && <div className="mb-6 space-y-4"><Bar className="h-7 w-40" /><Bar className="h-10 w-full max-w-xl" /></div>}
        {content}
      </div>
      {chrome && <div className="fixed bottom-0 inset-x-0 h-[58px] border-t border-white/5 bg-[var(--app-bg)] flex items-center justify-around">{[0, 1, 2, 3, 4].map(index => <Bar key={index} className="h-6 w-8" />)}</div>}
    </div>
  </div>;
}
