import React from 'react';

// Catches errors thrown during render anywhere below it in the tree —
// specifically, the `if (SUPABASE_CONFIG_ERROR) throw new Error(...)` at the
// top of MesahaApp in App.jsx. Without this, that throw would just produce a
// blank white page (React unmounts the tree on an uncaught render error and
// there's nothing else here to show anything).
//
// Kept intentionally minimal: no retry-count logic, no error reporting —
// just "show the message, offer a reload" since this only fires for the
// config-error case today, and reloading re-evaluates import.meta.env fresh.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleRetry = () => {
    // A full reload is the right "retry" here: the error we expect to catch
    // (missing .env vars) can only change between page loads, not between
    // React re-renders.
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          dir="rtl"
          style={{
            background: '#120E18',
            color: '#F1E4C6',
            fontFamily: "'Tajawal', sans-serif",
            height: '100vh',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>تعذر تحميل التطبيق</div>
          <div
            style={{
              color: '#C9BBA0',
              background: 'rgba(201,161,90,0.16)',
              border: '1px solid rgba(201,161,90,0.22)',
              fontSize: 12,
              borderRadius: 12,
              padding: '8px 12px',
              maxWidth: 320,
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              background: '#C9A15A',
              color: '#120E18',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 12,
              padding: '8px 20px',
              marginTop: 4,
              border: 'none',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
