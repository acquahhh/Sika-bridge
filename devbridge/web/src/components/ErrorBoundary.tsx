import { Component, type ReactNode } from 'react';

/** Keeps one broken page from blanking the whole workspace. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl border border-bad/30 bg-bad/5 p-6">
        <h2 className="text-sm font-semibold text-bad">This page hit an error</h2>
        <p className="mt-1 font-mono text-xs text-muted">{this.state.error.message}</p>
        <button className="mt-4 text-sm text-accent hover:underline" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
