import { Component, type ReactNode } from 'react';

/** If one screen breaks, show a calm message for that screen instead of a blank app. Your data is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  componentDidCatch(error: Error) { console.error('Screen error', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen err-screen" role="alert">
        <h2>Something went wrong on this screen</h2>
        <p>Your notes and money are safe. Reloading usually fixes it — often it is just an app update arriving.</p>
        <button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
