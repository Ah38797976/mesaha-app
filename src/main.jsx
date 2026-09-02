import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabaseClient';
import './index.css';

function ConfigErrorScreen({ message }) {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        padding: '32px', textAlign: 'center', background: '#120E18',
        color: '#F1E4C6', fontFamily: "'Tajawal', sans-serif",
      }}
    >
      <div style={{ fontSize: '48px' }}>⚠️</div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>تعذّر تشغيل التطبيق</h1>
      <p style={{ fontSize: '15px', lineHeight: 1.8, maxWidth: '480px', color: '#C9BBA0', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

// TEMP DEBUG: يظهر أي خطأ JS فعلي مباشرة على الشاشة (نص الخطأ الحقيقي)
// بدل ما يختفي بصمت. هذا مؤقت للتشخيص فقط.
function DebugErrorScreen({ error }) {
  return (
    <div dir="ltr" style={{
      minHeight: '100%', background: '#1a0000', color: '#ffcccc',
      padding: '20px', fontFamily: 'monospace', fontSize: '13px',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto',
    }}>
      <h2 style={{ color: '#ff6666' }}>🔴 JS Error (debug):</h2>
      <div>{String(error?.message || error)}</div>
      <div style={{ marginTop: '12px', opacity: 0.7 }}>{String(error?.stack || '')}</div>
    </div>
  );
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {isSupabaseConfigured ? <App /> : <ConfigErrorScreen message={supabaseConfigError} />}
    </React.StrictMode>
  );
} catch (err) {
  ReactDOM.createRoot(document.getElementById('root')).render(<DebugErrorScreen error={err} />);
}

window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root && !root.innerHTML.includes('JS Error')) {
    root.innerHTML = `<div style="background:#1a0000;color:#ffcccc;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;direction:ltr">🔴 window error:\n${e.message}\n${e.filename}:${e.lineno}:${e.colno}</div>`;
  }
});
