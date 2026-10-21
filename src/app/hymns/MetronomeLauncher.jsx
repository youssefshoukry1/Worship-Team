'use client';

import { Component } from 'react';
import { Loader2, Play } from 'lucide-react';

export default class MetronomeLauncher extends Component {
  state = { Player: null, context: null, loading: false, failed: false };
  request = 0;
  disposed = false;
  pendingContext = null;

  componentDidMount() { this.disposed = false; }

  componentWillUnmount() {
    this.disposed = true;
    this.request++;
    // Once mounted, the player owns its existing audio cleanup.
    if (!this.state.Player) this.pendingContext?.close().catch(() => {});
  }

  start = event => {
    event.stopPropagation();
    if (this.state.loading) {
      this.request++;
      this.pendingContext?.close().catch(() => {});
      this.pendingContext = null;
      this.setState({ loading: false });
      return;
    }
    const request = ++this.request;
    let context;
    try {
      // Create/unlock audio in the original user gesture, including on iOS.
      // Waiting until the lazy player mounts would lose that activation.
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      context.resume().catch(() => {});
      this.pendingContext = context;
      this.setState({ loading: true, failed: false });
    } catch {
      this.setState({ failed: true });
      return;
    }
    import('../Metronome/page').then(module => {
      if (this.disposed || this.request !== request) return;
      this.setState({ Player: module.default, context, loading: false });
    }).catch(() => {
      context.close().catch(() => {});
      if (!this.disposed && this.request === request) this.setState({ loading: false, failed: true });
    });
  };

  render() {
    const { Player, context, loading, failed } = this.state;
    if (Player) return <Player {...this.props} initialAudioContext={context} startOnMount />;
    if (failed) return (
      <button type="button" className="text-xs text-sky-400" title="Metronome could not load. Reload the app to try again."
        onClick={event => { event.stopPropagation(); window.location.reload(); }}>Reload app</button>
    );
    return (
      <button type="button" onClick={this.start}
        className="flex items-center justify-center rounded-full border border-transparent bg-white/10 p-1.5 text-sky-400 transition-all hover:bg-white/20"
        title={loading ? 'Cancel Metronome' : `Play Metronome (${this.props.bpm} BPM)`}
        aria-busy={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
      </button>
    );
  }
}
