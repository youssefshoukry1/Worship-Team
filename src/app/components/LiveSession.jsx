import { useRouter } from 'next/navigation';
import { Loader2, Mic, MicOff, Radio, Tv2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export function LiveSessionButton({ presenter, id }) {
  const { t } = useLanguage();
  const { dataShowId, isCreatingSession, isConnected, showSessionPanel, setShowSessionPanel } = presenter;
  const pendingLabel = isCreatingSession ? 'Creating...' : dataShowId && !isConnected ? 'Connecting...' : null;
  return (
    <div id={id} className="relative">
      <div className={`relative p-[1px] rounded-full overflow-hidden transition-all duration-300
        ${isConnected
          ? 'shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:shadow-[0_0_25px_rgba(255,255,255,0.4)]'
          : 'shadow-[0_0_15px_rgba(255,255,255,0.02)]'}`}
      >
        {/* Animated looping gradient background */}
        <div className={`absolute -inset-[100%] pointer-events-none z-0 ${isConnected ? 'animate-border-spin-fast' : 'animate-border-spin-slow'}`}
          style={{
            background: isConnected
              ? 'conic-gradient(from 0deg, transparent 0deg, transparent 120deg, rgba(255,255,255,0.45) 180deg, #fff 240deg, rgba(255,255,255,0.45) 300deg, transparent 360deg)'
              : 'conic-gradient(from 0deg, transparent 0deg, transparent 180deg, rgba(255,255,255,0.15) 270deg, transparent 360deg)'
          }}
        />
        {/* Mask button overlay */}
        <button
          type="button"
          aria-expanded={showSessionPanel}
          onClick={() => setShowSessionPanel(p => !p)}
          className={`relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-semibold text-sm w-full h-full justify-center
              ${isConnected
              ? 'bg-app-panel text-white hover:bg-app-raised'
              : 'bg-app-panel text-gray-400 hover:bg-app-raised hover:text-white'
            }`}
        >
          {pendingLabel ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-sky-400" /> : <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse text-white' : ''}`} />}
          {isConnected ? (
            <><span className="text-[10px] text-white font-black uppercase tracking-widest">● LIVE</span> · {dataShowId}</>
          ) : pendingLabel || t('livesession')}
        </button>
      </div>
    </div>
  );
}

export function LiveSessionPanel({ presenter, compact = false }) {
  const router = useRouter();
  const {
    showSessionPanel, dataShowId, setDataShowId, dataShowIdInput, setDataShowIdInput,
    handleCreateSession, handleJoinSession, createSessionError, isCreatingSession, isJoiningSession,
    toggleAudio, isAudioActive, clearDisplay,
  } = presenter;

  if (!showSessionPanel) return null;
  return (
    <div className={compact ? "space-y-2 rounded-xl border border-white/10 bg-black/20 p-2" : "w-full sm:max-w-[420px] p-4 bg-app-panel border border-white/10 rounded-2xl shadow-xl backdrop-blur-sm"}>
      {!compact && <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Presentation Room</p>}
      <div className={compact ? "flex flex-col gap-1.5" : "flex flex-col sm:flex-row gap-2"}>
        <input
          disabled={isCreatingSession}
          type="text"
          value={dataShowIdInput}
          onChange={e => setDataShowIdInput(e.target.value)}
          aria-label="Room name"
          placeholder={compact ? "Room name" : 'e.g. "sunday-01"'}
          className={compact ? "w-full rounded-lg border border-transparent bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:bg-white/10" : "flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-gray-600 w-full"}
          onKeyDown={e => { if (e.key === 'Enter') handleJoinSession(); }}
        />
        <div className="flex gap-2">
          <button
            onClick={handleCreateSession}
            disabled={isCreatingSession || isJoiningSession || !!dataShowId}
            className={compact ? "flex flex-1 items-center justify-center gap-1 rounded-lg bg-sky-500 py-1.5 text-xs font-bold text-white disabled:opacity-50" : "flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all whitespace-nowrap"}
          >
            {isCreatingSession ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : 'Create'}
          </button>
          <button
            onClick={handleJoinSession}
            disabled={isJoiningSession || isCreatingSession}
            className={compact ? "flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs font-bold text-white disabled:opacity-50" : "flex-1 sm:flex-none px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all whitespace-nowrap"}
          >
            Join
          </button>
        </div>
      </div>
      {createSessionError && <p role="alert" className="mt-2 text-sm text-red-300">{createSessionError}</p>}
      {dataShowId && (
        <div className={compact ? "grid grid-cols-3 gap-1 [&>a]:px-0 [&>button]:px-0 [&>*]:py-1.5 [&>*]:flex-col [&>*]:gap-1 [&>*]:bg-white/5 [&>*]:border-white/10 [&>*]:text-[10px]" : "mt-4 flex flex-col sm:flex-row flex-wrap gap-2"}>
          <a
            href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`}
            onClick={(e) => {
              if (typeof window !== 'undefined' && window.Capacitor?.isNative) {
                e.preventDefault();
                  router.push(`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`);
              }
            }}
            target="_blank" rel="noopener noreferrer"
            className={compact ? "flex items-center justify-center rounded-lg border text-sky-400" : "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-all flex-1"}
          >
            <Tv2 size={13} /> {compact ? "Display" : "Open Display Window"}
          </a>

          {/* Microphone Toggle Button */}
          <button
            onClick={toggleAudio}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all flex-1 ${isAudioActive
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
          >
            {isAudioActive ? <Mic size={13} className="text-sky-400 animate-pulse" /> : <MicOff size={13} />}
            {isAudioActive ? 'Mic On' : compact ? 'Mic off' : 'Turn On Mic'}
          </button>

          {/* End Session Button */}
          <button
            onClick={() => {
              if (isAudioActive) toggleAudio();
              clearDisplay();
              setDataShowId('');
              localStorage.removeItem('myLivePresentationId');
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all w-full sm:w-auto"
          >
            <X size={13} /> {compact ? "End" : "End Session"}
          </button>
        </div>
      )}
    </div>
  );
}
