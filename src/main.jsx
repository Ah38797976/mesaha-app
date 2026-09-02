import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabaseClient';
import './index.css';

// If Supabase env vars are missing, show a clear, visible error screen
// instead of a blank white page (App.jsx imports supabase and would crash
// the moment any screen tried to use it). This does not weaken or bypass the
// configuration check — it only makes its failure visible.
function ConfigErrorScreen({ message }) {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '32px',
        textAlign: 'center',
        background: '#120E18',
        color: '#F1E4C6',
        fontFamily: "'Tajawal', sans-serif",
      }}
    >
      <div style={{ fontSize: '48px' }}>⚠️</div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
        تعذّر تشغيل التطبيق
      </h1>
      <p style={{ fontSize: '15px', lineHeight: 1.8, maxWidth: '480px', color: '#C9BBA0', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isSupabaseConfigured ? <App /> : <ConfigErrorScreen message={supabaseConfigError} />}
  </React.StrictMode>
);
// build trigger
