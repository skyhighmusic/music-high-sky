import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Music High Sky ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      let displayError = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && parsed.error && parsed.operationType) {
          displayError = `Database access denied (${parsed.operationType} on ${parsed.path || 'collection'}): ${parsed.error}`;
        }
      } catch {
        // Plain text error
      }

      return (
        <div className="min-h-screen bg-[#020817] text-white flex items-center justify-center p-6">
          <div className="max-w-lg w-full luxury-card border-[#D4AF37]/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#F5D58A]">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#D4AF37]" />
              <h2 className="font-display text-lg font-semibold text-[#F5D58A]">
                Application Notice
              </h2>
            </div>
            <p className="text-sm text-[#C8D0DB] leading-relaxed break-words">{displayError}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.reload();
                }}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Reload Workspace
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
