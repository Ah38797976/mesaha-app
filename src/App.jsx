import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Heart, MessageCircle, Moon, Sun, Settings as SettingsIcon, Calendar as CalendarIcon,
  Lock, ChevronLeft, ChevronRight, Search, Plus, Check, CheckCheck, X, Sparkles, Gift,
  Mic, Image as ImageIcon, Send, Home as HomeIcon, BookOpen,
  HelpCircle, Shuffle, Bookmark, LogOut, Copy, Link2, Square, Gamepad2, ShieldCheck
} from 'lucide-react';
import { supabase, uploadToBucket, uploadBlob, signedUrl, notifyPartner, SUPABASE_CONFIG_ERROR } from './lib/supabaseClient';
import { BaynaScreen, BaynaHomeCard, AdminBaynaScreen } from './Bayna';
import Gallery from './Gallery';

/* ---------------------------------------------------------
   توكنز التصميم — Design tokens (unchanged from the original)
--------------------------------------------------------- */
const PALETTE = {
  dark: {
    bg: '#120E18', bg2: '#1C1526', bg3: '#241B32',
    text: '#F1E4C6', textDim: '#C9BBA0',
    gold: '#C9A15A', goldSoft: 'rgba(201,161,90,0.16)',
    rose: '#C97B92', border: 'rgba(201,161,90,0.22)',
  },
  light: {
    bg: '#F3EBD8', bg2: '#FFFBF2', bg3: '#EFE2C4',
    text: '#2B2013', textDim: '#6E5C3E',
    gold: '#A97B3C', goldSoft: 'rgba(169,123,60,0.14)',
    rose: '#B15C74', border: 'rgba(169,123,60,0.28)',
  },
};
const FONT_DISPLAY = "'Aref Ruqaa', serif";
const FONT_BODY = "'Tajawal', sans-serif";

const I18N = {
  ar: { home: 'الرئيسية', chat: 'الدردشة', memories: 'ذكرياتنا', occasions: 'المناسبات', settings: 'الإعدادات', majlis: 'مجلسنَ',
    missYou: 'مشتاگ لك ❤️', loveYou: 'أحبك ❤️', goodnight: 'تصبح على خير 🌙', goodmorning: 'صباح الخير ☀️',
    together: 'سوا من', enterChat: 'ادخل للدردشة', online: 'متصل الآن', offline: 'آخر ظهور' },
  fr: { home: 'Accueil', chat: 'Discussion', memories: 'Souvenirs', occasions: 'Occasions', settings: 'Réglages', majlis: 'Majliss',
    missYou: 'Tu me manques ❤️', loveYou: 'Je t\u2019aime ❤️', goodnight: 'Bonne nuit 🌙', goodmorning: 'Bonjour ☀️',
    together: 'Ensemble depuis', enterChat: 'Ouvrir la discussion', online: 'En ligne', offline: 'Vu pour la dernière fois' },
  en: { home: 'Home', chat: 'Chat', memories: 'Memories', occasions: 'Occasions', settings: 'Settings', majlis: 'Majlisna',
    missYou: 'Miss you ❤️', loveYou: 'Love you ❤️', goodnight: 'Goodnight 🌙', goodmorning: 'Good morning ☀️',
    together: 'Together since', enterChat: 'Open chat', online: 'Online', offline: 'Last seen' },
};

const GIFFAN_WORDS = [
  { word: 'مشتاگ', correct: 'مشتاق / حانّ', options: ['مشتاق / حانّ', 'غاضب', 'متعب'] },
  { word: 'گليمة', correct: 'كلمة', options: ['كلمة', 'قصة طويلة', 'أغنية'] },
  { word: 'زين', correct: 'جميل / حلو', options: ['جميل / حلو', 'بعيد', 'كبير'] },
  { word: 'هاني معاك', correct: 'أنا مرتاح معاك', options: ['أنا مرتاح معاك', 'أنا نائم', 'أنا مستعجل'] },
  { word: 'گلب', correct: 'قلب', options: ['قلب', 'عقل', 'يد'] },
  { word: 'نرگب فيك', correct: 'أرغب فيك / أحبك', options: ['أرغب فيك / أحبك', 'أخاف منك', 'أنساك'] },
  { word: 'ما نبدلك بحد', correct: 'ما نستبدلك بأي حد', options: ['ما نستبدلك بأي حد', 'ما نعرفك', 'ما نسمعك'] },
  { word: 'يا زينك', correct: 'ما أجملك', options: ['ما أجملك', 'وين رحت', 'كيف حالك'] },
  { word: 'وحشتني', correct: 'اشتقت لك', options: ['اشتقت لك', 'نسيتك', 'زعلت منك'] },
  { word: 'ربي يخليك لي', correct: 'دعاء بأن يبقيك الله لي', options: ['دعاء بأن يبقيك الله لي', 'دعاء بالسفر', 'دعاء بالشفاء'] },
];
const HASSANIYA_PROVERBS = [
  { text: 'اللي ما عندو گلب ما عندو حس', note: 'من ما عنده قلب، ما عنده إحساس — عن أهمية المشاعر الصادقة.' },
  { text: 'الصبر مفتاح الفرج', note: 'مثل مشترك فكل الثقافة العربية، متداول بزاف فموريتانيا.' },
  { text: 'اليد الواحدة ما تصفگ', note: 'العلاقة تحتاج طرفين يبذلو مجهود، ما تمشي بواحد.' },
  { text: 'اللي زرع حصد', note: 'كل مجهود تبذلو فالعلاقة، غاديه يرجعلك.' },
];

/* ---------------------------------------------------------
   أدوات مساعدة — helpers
--------------------------------------------------------- */
function relationshipDuration(startStr) {
  if (!startStr) return '';
  const start = new Date(startStr);
  const now = new Date();
  let days = Math.floor((now - start) / 86400000);
  const years = Math.floor(days / 365);
  days -= years * 365;
  const months = Math.floor(days / 30);
  days -= months * 30;
  const parts = [];
  if (years > 0) parts.push(`${years} سنة`);
  if (months > 0) parts.push(`${months} شهر`);
  parts.push(`${days} يوم`);
  return parts.join(' و');
}
function nextOccurrence(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < now) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return next;
}
function daysUntil(dateStr) {
  const next = nextOccurrence(dateStr);
  return Math.ceil((next - new Date()) / 86400000);
}
// Always stored/read as UTC in Postgres (timestamptz); rendered in the viewer's local tz.
function localTime(iso) {
  return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`;
  return `منذ ${Math.floor(s / 86400)} يوم`;
}

/* ===========================================================
   1) AUTH — Supabase Auth (email + password)
=========================================================== */
function AuthScreen({ c }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // If email confirmation is required, Supabase returns a user but NO
        // session yet. Without a session, auth.uid() is null on the server,
        // so the profiles insert below would be blocked by Row Level
        // Security and silently fail. Stop here and tell the user instead.
        if (!data.session) {
          setErr('تم إنشاء الحساب! افتح بريدك الإلكتروني لتفعيل الحساب، ثم سجّل الدخول من هنا.');
          setMode('signin');
          return;
        }

        if (data.user) {
          const { error: profileErr } = await supabase.from('profiles').insert({
            id: data.user.id, display_name: displayName || email, country,
          });
          if (profileErr) throw profileErr;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e.message || 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: FONT_BODY }}
      className="h-full w-full flex flex-col items-center justify-center px-8">
      <div style={{ color: c.gold }} className="mb-4"><Lock size={30} /></div>
      <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-2xl mb-1">مساحتنا الخاصة</div>
      <div style={{ color: c.textDim }} className="text-xs mb-6">مكان خاص بيناتنا فقط 💛</div>
      {mode === 'signup' && (
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="اسمك"
          style={{ background: c.bg2, borderColor: c.border, color: c.text }}
          className="w-full max-w-xs border rounded-xl px-4 py-3 mb-3 text-sm outline-none" />
      )}
      {mode === 'signup' && (
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="بلدك (اختياري)"
          style={{ background: c.bg2, borderColor: c.border, color: c.text }}
          className="w-full max-w-xs border rounded-xl px-4 py-3 mb-3 text-sm outline-none" />
      )}
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" type="email"
        style={{ background: c.bg2, borderColor: c.border, color: c.text }}
        className="w-full max-w-xs border rounded-xl px-4 py-3 mb-3 text-sm outline-none" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" type="password"
        style={{ background: c.bg2, borderColor: c.border, color: c.text }}
        className="w-full max-w-xs border rounded-xl px-4 py-3 mb-3 text-sm outline-none" />
      {err && <div style={{ color: c.rose }} className="text-xs mb-3 text-center max-w-xs">{err}</div>}
      <button onClick={submit} disabled={busy || !email || !password}
        style={{ background: c.gold, color: c.bg }}
        className="w-full max-w-xs rounded-xl py-3 text-sm font-bold disabled:opacity-50">
        {busy ? '...' : mode === 'signup' ? 'إنشاء حساب' : 'دخول'}
      </button>
      <button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        style={{ color: c.textDim }} className="mt-4 text-xs underline">
        {mode === 'signup' ? 'لديك حساب؟ سجّل الدخول' : 'حساب جديد؟ أنشئ واحدًا'}
      </button>
    </div>
  );
}

/* ===========================================================
   2) COUPLE SETUP — create / join a space
=========================================================== */
function CoupleSetupScreen({ c, userId, onLinked }) {
  const [mode, setMode] = useState('choose'); // choose | create | join
  const [inviteCode, setInviteCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setEr
