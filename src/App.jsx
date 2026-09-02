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
  const [err, setErr] = useState('');
  const [myCode, setMyCode] = useState('');

  const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

  const createCouple = async () => {
    setBusy(true); setErr('');
    try {
      const code = genCode();
      const { data: couple, error } = await supabase.from('couples')
        .insert({ invite_code: code, start_date: startDate || null })
        .select().single();
      if (error) throw error;
      const { error: mErr } = await supabase.from('couple_members').insert({ couple_id: couple.id, user_id: userId });
      if (mErr) throw mErr;
      setMyCode(code);
    } catch (e) {
      setErr(e.message || 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  const joinCouple = async () => {
    setBusy(true); setErr('');
    try {
      const { data: coupleRow, error: findErr } = await supabase.from('couples')
        .select('*').eq('invite_code', inviteCode.trim().toUpperCase()).maybeSingle();
      if (findErr) throw findErr;
      if (!coupleRow) { setErr('الرمز غير صحيح'); setBusy(false); return; }
      const { error: mErr } = await supabase.from('couple_members').insert({ couple_id: coupleRow.id, user_id: userId });
      if (mErr) throw mErr;
      onLinked();
    } catch (e) {
      setErr(e.message || 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  if (myCode) {
    return (
      <div style={{ background: c.bg, color: c.text }} className="h-full w-full flex flex-col items-center justify-center px-8 text-center">
        <Sparkles style={{ color: c.gold }} size={32} className="mb-4" />
        <div className="text-lg font-bold mb-2">تم إنشاء مساحتكم! 💛</div>
        <div style={{ color: c.textDim }} className="text-xs mb-4">شارك هذا الرمز مع شريكك ليدخل معك</div>
        <div style={{ background: c.bg2, borderColor: c.border, color: c.gold }}
          className="border rounded-xl px-6 py-4 text-2xl font-mono tracking-widest mb-6">{myCode}</div>
        <button onClick={onLinked} style={{ background: c.gold, color: c.bg }} className="rounded-xl px-8 py-3 text-sm font-bold">دخول للمساحة</button>
      </div>
    );
  }

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: FONT_BODY }} className="h-full w-full flex flex-col items-center justify-center px-8">
      <Heart style={{ color: c.rose }} size={30} className="mb-4" />
      {mode === 'choose' && (
        <>
          <div className="text-lg font-bold mb-6">أنشئ مساحتكم الخاصة</div>
          <button onClick={() => setMode('create')} style={{ background: c.gold, color: c.bg }} className="w-full max-w-xs rounded-xl py-3 text-sm font-bold mb-3">إنشاء مساحة جديدة</button>
          <button onClick={() => setMode('join')} style={{ borderColor: c.gold, color: c.gold }} className="w-full max-w-xs border rounded-xl py-3 text-sm font-bold">الانضمام برمز دعوة</button>
        </>
      )}
      {mode === 'create' && (
        <>
          <div className="text-sm mb-3">تاريخ بداية علاقتكم (اختياري)</div>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ background: c.bg2, borderColor: c.border, color: c.text }}
            className="w-full max-w-xs border rounded-xl px-4 py-3 mb-4 text-sm outline-none" />
          {err && <div style={{ color: c.rose }} className="text-xs mb-3">{err}</div>}
          <button onClick={createCouple} disabled={busy} style={{ background: c.gold, color: c.bg }} className="w-full max-w-xs rounded-xl py-3 text-sm font-bold disabled:opacity-50">{busy ? '...' : 'إنشاء'}</button>
          <button onClick={() => setMode('choose')} style={{ color: c.textDim }} className="mt-3 text-xs underline">رجوع</button>
        </>
      )}
      {mode === 'join' && (
        <>
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="رمز الدعوة"
            style={{ background: c.bg2, borderColor: c.border, color: c.text }}
            className="w-full max-w-xs border rounded-xl px-4 py-3 mb-4 text-sm outline-none text-center font-mono tracking-widest" />
          {err && <div style={{ color: c.rose }} className="text-xs mb-3">{err}</div>}
          <button onClick={joinCouple} disabled={busy || !inviteCode} style={{ background: c.gold, color: c.bg }} className="w-full max-w-xs rounded-xl py-3 text-sm font-bold disabled:opacity-50">{busy ? '...' : 'انضمام'}</button>
          <button onClick={() => setMode('choose')} style={{ color: c.textDim }} className="mt-3 text-xs underline">رجوع</button>
        </>
      )}
    </div>
  );
}

/* ===========================================================
   3) HOME
=========================================================== */
function HomeScreen({ c, t, me, partner, couple, phrases, onQuickAction, onOpenChat, onOpenBayna, toasts }) {
  const together = couple?.start_date ? relationshipDuration(couple.start_date) : '';
  return (
    <div style={{ background: c.bg }} className="h-full w-full overflow-y-auto pb-4">
      {/* toasts */}
      <div className="fixed top-3 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((tst) => (
          <div key={tst.id} style={{ background: c.bg2, borderColor: c.border, color: c.text }}
            className="border rounded-xl px-4 py-2 text-xs shadow-lg max-w-xs text-center">{tst.text}</div>
        ))}
      </div>

      <div style={{ background: `linear-gradient(180deg, ${c.bg2}, ${c.bg})` }} className="px-5 pt-8 pb-6 text-center">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-3xl mb-1">مساحتنا</div>
        {together && <div style={{ color: c.textDim }} className="text-xs">{t.together} {together}</div>}
      </div>

      <div className="px-5 -mt-2">
        <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-4 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div style={{ background: c.goldSoft }} className="w-10 h-10 rounded-full flex items-center justify-center">
              <Heart style={{ color: c.rose }} size={18} />
            </div>
            <div>
              <div style={{ color: c.text }} className="text-sm font-bold">{partner?.display_name || '...'}</div>
              <div style={{ color: partner?.is_online ? '#4ADE80' : c.textDim }} className="text-[10px]">
                {partner?.is_online ? t.online : partner?.last_seen_at ? `${t.offline} ${timeAgo(partner.last_seen_at)}` : ''}
              </div>
            </div>
          </div>
          <button onClick={onOpenChat} style={{ background: c.gold, color: c.bg }} className="rounded-full px-4 py-2 text-xs font-bold flex items-center gap-1">
            <MessageCircle size={13} />{t.enterChat}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button onClick={() => onQuickAction(t.missYou)} style={{ background: c.bg2, borderColor: c.border, color: c.text }} className="border rounded-xl py-3 text-xs font-bold">{t.missYou}</button>
          <button onClick={() => onQuickAction(t.loveYou)} style={{ background: c.bg2, borderColor: c.border, color: c.text }} className="border rounded-xl py-3 text-xs font-bold">{t.loveYou}</button>
          <button onClick={() => onQuickAction(t.goodmorning)} style={{ background: c.bg2, borderColor: c.border, color: c.text }} className="border rounded-xl py-3 text-xs font-bold">{t.goodmorning}</button>
          <button onClick={() => onQuickAction(t.goodnight)} style={{ background: c.bg2, borderColor: c.border, color: c.text }} className="border rounded-xl py-3 text-xs font-bold">{t.goodnight}</button>
        </div>

        <button onClick={onOpenBayna} style={{ background: `linear-gradient(135deg, ${c.goldSoft}, transparent)`, borderColor: c.border }}
          className="w-full border rounded-2xl p-4 flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gamepad2 style={{ color: c.gold }} size={18} />
            <span style={{ color: c.text }} className="text-sm font-bold">بيناتنا — ألعاب وأسئلة</span>
          </div>
          <ChevronLeft style={{ color: c.gold }} size={16} />
        </button>

        {phrases?.length > 0 && (
          <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-4">
            <div style={{ color: c.gold }} className="text-xs font-bold mb-2">عباراتنا الخاصة</div>
            <div className="flex flex-wrap gap-2">
              {phrases.map((p) => (
                <button key={p.id} onClick={() => onQuickAction(p.text)} style={{ background: c.goldSoft, color: c.text }} className="rounded-full px-3 py-1.5 text-xs">{p.text}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================================================
   4) CHAT
=========================================================== */
function ChatScreen({ c, coupleId, me, partner }) {
  const [messages, setMessages] = useState([]);
  const [secrets, setSecrets] = useState([]);
  const [text, setText] = useState('');
  const [activeMsgMenu, setActiveMsgMenu] = useState(null);
  const [recording, setRecording] = useState(false);
  const [showSecretComposer, setShowSecretComposer] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*').eq('couple_id', coupleId).order('created_at');
    setMessages(data || []);
  }, [coupleId]);

  const loadSecrets = useCallback(async () => {
    const { data } = await supabase.from('secret_messages').select('*').eq('couple_id', coupleId).order('created_at');
    setSecrets(data || []);
  }, [coupleId]);

  useEffect(() => { loadMessages(); loadSecrets(); }, [loadMessages, loadSecrets]);

  useEffect(() => {
    const ch = supabase.channel(`messages-${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => setMessages((m) => [...m, payload.new]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => setMessages((m) => m.map((x) => (x.id === payload.new.id ? payload.new : x))))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => setMessages((m) => m.filter((x) => x.id !== payload.old.id)))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const unread = messages.filter((m) => m.sender_id !== me.id && m.status !== 'read');
    if (unread.length) {
      supabase.from('messages').update({ status: 'read' }).in('id', unread.map((m) => m.id)).then(() => {});
    }
  }, [messages, me.id]);

  useEffect(() => {
    const ch = supabase.channel(`secrets-${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'secret_messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => setSecrets((s) => [...s, payload.new]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'secret_messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => setSecrets((s) => s.map((x) => (x.id === payload.new.id ? payload.new : x))))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  const sendText = async () => {
    if (!text.trim()) return;
    const { data } = await supabase.from('messages').insert({
      couple_id: coupleId, sender_id: me.id, type: 'text', text: text.trim(),
    }).select().single();
    setText('');
    if (data && partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'message', body: `${me.display_name}: ${text.trim().slice(0, 40)}` });
  };

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = await uploadToBucket('chat-media', coupleId, file, 'img-');
    await supabase.from('messages').insert({ couple_id: coupleId, sender_id: me.id, type: 'image', media_path: path });
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const path = await uploadBlob('chat-media', coupleId, blob, 'webm', 'voice-');
        await supabase.from('messages').insert({ couple_id: coupleId, sender_id: me.id, type: 'voice', media_path: path });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch { /* mic permission denied */ }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const deleteMsg = async (id) => { await supabase.from('messages').delete().eq('id', id); setActiveMsgMenu(null); };

  return (
    <div style={{ background: c.bg }} className="h-full w-full flex flex-col">
      <div style={{ background: c.bg2, borderColor: c.border }} className="border-b px-4 py-3 flex items-center gap-3">
        <div style={{ background: c.goldSoft }} className="w-9 h-9 rounded-full flex items-center justify-center">
          <Heart style={{ color: c.rose }} size={15} />
        </div>
        <div style={{ color: c.text }} className="text-sm font-bold">{partner?.display_name}</div>
        <button onClick={() => setShowSecretComposer(true)} style={{ color: c.gold }} className="mr-auto"><Lock size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {[...messages, ...secrets.map((s) => ({ ...s, type: 'secret' }))]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map((m) => (
            <MessageBubble key={m.id} m={m} c={c} isMine={m.sender_id === me.id} onDelete={() => deleteMsg(m.id)}
              activeMenu={activeMsgMenu} setActiveMenu={setActiveMsgMenu} coupleId={coupleId} me={me} />
          ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ background: c.bg2, borderColor: c.border }} className="border-t p-3 flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        <button onClick={() => fileInputRef.current?.click()} style={{ color: c.textDim }}><ImageIcon size={19} /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendText()}
          placeholder="اكتب رسالة..." style={{ background: c.bg3, color: c.text }} className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none" />
        {text.trim() ? (
          <button onClick={sendText} style={{ background: c.gold, color: c.bg }} className="w-9 h-9 rounded-full flex items-center justify-center"><Send size={15} /></button>
        ) : (
          <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
            style={{ background: recording ? c.rose : c.gold, color: c.bg }} className="w-9 h-9 rounded-full flex items-center justify-center"><Mic size={15} /></button>
        )}
      </div>

      {showSecretComposer && <SecretComposer c={c} coupleId={coupleId} me={me} onClose={() => setShowSecretComposer(false)} />}
    </div>
  );
}

function MessageBubble({ m, c, isMine, onDelete, activeMenu, setActiveMenu, coupleId, me }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (m.type === 'image' && m.media_path) signedUrl('chat-media', m.media_path).then(setImgUrl);
    if (m.type === 'voice' && m.media_path) signedUrl('chat-media', m.media_path).then(setAudioUrl);
  }, [m.type, m.media_path]);

  if (m.type === 'secret') {
    const isLocked = m.unlock_at && new Date(m.unlock_at) > new Date();
    const canOpen = !isLocked && !unlocked && m.recipient_opened_at === null;
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div onClick={async () => {
          if (isLocked) return;
          if (!isMine && !m.opened_at) {
            await supabase.from('secret_messages').update({ opened_at: new Date().toISOString() }).eq('id', m.id);
          }
          setUnlocked(true);
        }}
          style={{ background: c.goldSoft, borderColor: c.gold }}
          className="border-2 border-dashed rounded-2xl px-4 py-3 max-w-[75%] cursor-pointer">
          {isLocked ? (
            <div style={{ color: c.gold }} className="text-xs flex items-center gap-1"><Lock size={12} />رسالة سرية — تُفتح {new Date(m.unlock_at).toLocaleDateString('ar')}</div>
          ) : unlocked || m.opened_at ? (
            <div style={{ color: c.text }} className="text-sm">{m.text}</div>
          ) : (
            <div style={{ color: c.gold }} className="text-xs flex items-center gap-1"><Lock size={12} />اضغط لفتح الرسالة السرية 💌</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div onContextMenu={(e) => { e.preventDefault(); if (isMine) setActiveMenu(m.id); }}
        style={{ background: isMine ? c.gold : c.bg2, color: isMine ? c.bg : c.text }}
        className="rounded-2xl px-4 py-2.5 max-w-[75%] relative">
        {m.type === 'text' && <div className="text-sm">{m.text}</div>}
        {m.type === 'image' && imgUrl && <img src={imgUrl} alt="" className="rounded-lg max-w-[200px]" />}
        {m.type === 'voice' && audioUrl && <audio src={audioUrl} controls className="max-w-[200px]" />}
        <div className="flex items-center gap-1 justify-end mt-1">
          <span className="text-[9px] opacity-70">{localTime(m.created_at)}</span>
          {isMine && (m.status === 'read' ? <CheckCheck size={11} /> : <Check size={11} />)}
        </div>
        {activeMenu === m.id && (
          <div style={{ background: c.bg3 }} className="absolute -top-9 left-0 rounded-lg shadow-lg px-3 py-1.5 flex gap-2 z-10">
            <button onClick={onDelete}><X size={13} style={{ color: c.rose }} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function SecretComposer({ c, coupleId, me, onClose }) {
  const [text, setText] = useState('');
  const [unlockAt, setUnlockAt] = useState('');
  const send = async () => {
    if (!text.trim()) return;
    await supabase.from('secret_messages').insert({ couple_id: coupleId, sender_id: me.id, text: text.trim(), unlock_at: unlockAt || null });
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
      <div style={{ background: c.bg2 }} className="rounded-2xl p-5 w-full max-w-xs">
        <div style={{ color: c.gold }} className="text-sm font-bold mb-3 flex items-center gap-1"><Lock size={14} />رسالة سرية</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك..."
          style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-3 text-sm outline-none mb-3 h-24 resize-none" />
        <div style={{ color: c.textDim }} className="text-xs mb-1">تُفتح في (اختياري)</div>
        <input type="datetime-local" value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)}
          style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-2.5 text-sm outline-none mb-4" />
        <div className="flex gap-2">
          <button onClick={onClose} style={{ borderColor: c.border, color: c.textDim }} className="flex-1 border rounded-xl py-2.5 text-xs">إلغاء</button>
          <button onClick={send} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-xl py-2.5 text-xs font-bold">إرسال</button>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   5) MEMORIES / OCCASIONS / PHRASES (shared table pattern)
=========================================================== */
function useCoupleTable(table, coupleId, orderCol = 'created_at') {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select('*').eq('couple_id', coupleId).order(orderCol);
    setRows(data || []);
  }, [table, coupleId, orderCol]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`${table}-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [table, coupleId, load]);
  return [rows, load];
}

function MemoriesScreen({ c, coupleId, me, partner }) {
  const [memories] = useCoupleTable('memories', coupleId, 'memory_date');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const addMemory = async () => {
    if (!title.trim()) return;
    setBusy(true);
    let photo_path = null;
    if (photoFile) photo_path = await uploadToBucket('memories', coupleId, photoFile, 'mem-');
    await supabase.from('memories').insert({ couple_id: coupleId, added_by: me.id, title, memory_date: date || null, note, photo_path });
    setTitle(''); setDate(''); setNote(''); setPhotoFile(null); setShowAdd(false); setBusy(false);
  };

  return (
    <div style={{ background: c.bg }} className="h-full w-full overflow-y-auto">
      <div style={{ background: c.bg2, borderColor: c.border }} className="border-b px-4 py-3 flex items-center justify-between">
        <div style={{ color: c.gold, fontFamily: FONT_DISPLAY }} className="text-lg">ذكرياتنا</div>
        <button onClick={() => setShowAdd(true)} style={{ background: c.gold, color: c.bg }} className="w-8 h-8 rounded-full flex items-center justify-center"><Plus size={16} /></button>
      </div>
      <div className="p-4 space-y-3">
        {memories.map((m) => <MemoryCard key={m.id} m={m} c={c} coupleId={coupleId} />)}
        {memories.length === 0 && <div style={{ color: c.textDim }} className="text-center text-xs py-10">لا توجد ذكريات بعد — أضف أول ذكرى لكما 💛</div>}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div style={{ background: c.bg2 }} className="rounded-2xl p-5 w-full max-w-xs">
            <div style={{ color: c.gold }} className="text-sm font-bold mb-3">ذكرى جديدة</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الذكرى" style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-2.5 text-sm outline-none mb-2" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-2.5 text-sm outline-none mb-2" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="وصف..." style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-2.5 text-sm outline-none mb-2 h-20 resize-none" />
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0])} style={{ color: c.textDim }} className="w-full text-xs mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} style={{ borderColor: c.border, color: c.textDim }} className="flex-1 border rounded-xl py-2.5 text-xs">إلغاء</button>
              <button onClick={addMemory} disabled={busy} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-xl py-2.5 text-xs font-bold disabled:opacity-50">{busy ? '...' : 'حفظ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryCard({ m, c, coupleId }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  useEffect(() => { if (m.photo_path) signedUrl('memories', m.photo_path).then(setPhotoUrl); }, [m.photo_path]);
  return (
    <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl overflow-hidden">
      {photoUrl && <img src={photoUrl} alt="" className="w-full h-40 object-cover" />}
      <div className="p-3">
        <div style={{ color: c.text }} className="text-sm font-bold">{m.title}</div>
        {m.memory_date && <div style={{ color: c.gold }} className="text-[10px] mt-0.5">{new Date(m.memory_date).toLocaleDateString('ar')}</div>}
        {m.note && <div style={{ color: c.textDim }} className="text-xs mt-1">{m.note}</div>}
      </div>
    </div>
  );
}

function OccasionsScreen({ c, coupleId, me, partner }) {
  const [occasions] = useCoupleTable('occasions', coupleId, 'occasion_date');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const addOccasion = async () => {
    if (!title.trim() || !date) return;
    await supabase.from('occasions').insert({ couple_id: coupleId, added_by: me.id, title, occasion_date: date });
    setTitle(''); setDate(''); setShowAdd(false);
  };

  const sorted = [...occasions].sort((a, b) => daysUntil(a.occasion_date) - daysUntil(b.occasion_date));

  return (
    <div style={{ background: c.bg }} className="h-full w-full overflow-y-auto">
      <div style={{ background: c.bg2, borderColor: c.border }} className="border-b px-4 py-3 flex items-center justify-between">
        <div style={{ color: c.gold, fontFamily: FONT_DISPLAY }} className="text-lg">المناسبات</div>
        <button onClick={() => setShowAdd(true)} style={{ background: c.gold, color: c.bg }} className="w-8 h-8 rounded-full flex items-center justify-center"><Plus size={16} /></button>
      </div>
      <div className="p-4 space-y-3">
        {sorted.map((o) => (
          <div key={o.id} style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div style={{ color: c.text }} className="text-sm font-bold">{o.title}</div>
              <div style={{ color: c.textDim }} className="text-[10px]">{new Date(o.occasion_date).toLocaleDateString('ar')}</div>
            </div>
            <div style={{ background: c.goldSoft, color: c.gold }} className="rounded-full px-3 py-1 text-xs font-bold">
              {daysUntil(o.occasion_date) === 0 ? 'اليوم! 🎉' : `${daysUntil(o.occasion_date)} يوم`}
            </div>
          </div>
        ))}
        {occasions.length === 0 && <div style={{ color: c.textDim }} className="text-center text-xs py-10">لا توجد مناسبات — أضف مناسبة مهمة لكما</div>}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
          <div style={{ background: c.bg2 }} className="rounded-2xl p-5 w-full max-w-xs">
            <div style={{ color: c.gold }} className="text-sm font-bold mb-3">مناسبة جديدة</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم المناسبة" style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-2.5 text-sm outline-none mb-2" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: c.bg3, color: c.text }} className="w-full rounded-xl p-2.5 text-sm outline-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} style={{ borderColor: c.border, color: c.textDim }} className="flex-1 border rounded-xl py-2.5 text-xs">إلغاء</button>
              <button onClick={addOccasion} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-xl py-2.5 text-xs font-bold">حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   6) SETTINGS
=========================================================== */
function SettingsScreen({ c, dark, setDark, lang, setLang, me, coupleId, partner }) {
  const [phrases, setPhrases] = useState([]);
  const [newPhrase, setNewPhrase] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [coupleCode, setCoupleCode] = useState('');

  useEffect(() => {
    supabase.from('phrases').select('*').eq('couple_id', coupleId).then(({ data }) => setPhrases(data || []));
    supabase.from('couples').select('invite_code').eq('id', coupleId).single().then(({ data }) => setCoupleCode(data?.invite_code || ''));
  }, [coupleId]);

  const addPhrase = async () => {
    if (!newPhrase.trim()) return;
    await supabase.from('phrases').insert({ couple_id: coupleId, added_by: me.id, text: newPhrase.trim() });
    setNewPhrase('');
    supabase.from('phrases').select('*').eq('couple_id', coupleId).then(({ data }) => setPhrases(data || []));
  };
  const removePhrase = async (id) => { await supabase.from('phrases').delete().eq('id', id); setPhrases((p) => p.filter((x) => x.id !== id)); };

  const toggleDark = async (v) => {
    setDark(v);
    await supabase.from('profiles').update({ dark_mode: v }).eq('id', me.id);
  };
  const changeLang = async (v) => {
    setLang(v);
    await supabase.from('profiles').update({ lang: v }).eq('id', me.id);
  };
  const logout = async () => { await supabase.auth.signOut(); };

  return (
    <div style={{ background: c.bg }} className="h-full w-full overflow-y-auto">
      <div style={{ background: c.bg2, borderColor: c.border }} className="border-b px-4 py-3">
        <div style={{ color: c.gold, fontFamily: FONT_DISPLAY }} className="text-lg">الإعدادات</div>
      </div>
      <div className="p-4 space-y-4">
        <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-4">
          <div style={{ color: c.text }} className="text-sm font-bold mb-3">المظهر</div>
          <div className="flex items-center justify-between mb-3">
            <span style={{ color: c.textDim }} className="text-xs flex items-center gap-1">{dark ? <Moon size={13} /> : <Sun size={13} />} الوضع الليلي</span>
            <button onClick={() => toggleDark(!dark)} style={{ background: dark ? c.gold : c.bg3 }} className="w-11 h-6 rounded-full relative">
              <div style={{ background: '#fff', right: dark ? 2 : 22 }} className="w-4 h-4 rounded-full absolute top-1 transition-all" />
            </button>
          </div>
          <div className="flex gap-2">
            {['ar', 'fr', 'en'].map((l) => (
              <button key={l} onClick={() => changeLang(l)} style={{ background: lang === l ? c.gold : c.bg3, color: lang === l ? c.bg : c.textDim }} className="flex-1 rounded-lg py-1.5 text-xs font-bold">{l.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-4">
          <div style={{ color: c.text }} className="text-sm font-bold mb-2">دعوة الشريك</div>
          <button onClick={() => setShowInvite(!showInvite)} style={{ color: c.gold }} className="text-xs flex items-center gap-1"><Link2 size={13} />عرض رمز الدعوة</button>
          {showInvite && <div style={{ background: c.goldSoft, color: c.gold }} className="mt-2 rounded-lg px-3 py-2 text-center font-mono text-lg tracking-widest">{coupleCode}</div>}
        </div>

        <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-4">
          <div style={{ color: c.text }} className="text-sm font-bold mb-2">عباراتنا الخاصة</div>
          <div className="flex gap-2 mb-3">
            <input value={newPhrase} onChange={(e) => setNewPhrase(e.target.value)} placeholder="أضف عبارة" style={{ background: c.bg3, color: c.text }} className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" />
            <button onClick={addPhrase} style={{ background: c.gold, color: c.bg }} className="rounded-lg px-3"><Plus size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {phrases.map((p) => (
              <div key={p.id} style={{ background: c.goldSoft, color: c.text }} className="rounded-full px-3 py-1.5 text-xs flex items-center gap-1">
                {p.text}<button onClick={() => removePhrase(p.id)}><X size={11} /></button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={logout} style={{ borderColor: c.rose, color: c.rose }} className="w-full border rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2">
          <LogOut size={15} />تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

/* ===========================================================
   7) MAJLIS (Q&A game)
=========================================================== */
function MajlisScreen({ c, coupleId, me, partner }) {
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [mine, setMine] = useState('');

  useEffect(() => {
    supabase.from('majlis_questions').select('*').order('id').then(({ data }) => setQuestions(data || []));
  }, []);

  const question = questions[idx];

  const loadAnswers = useCallback(async () => {
    if (!question) return;
    const { data } = await supabase.from('majlis_answers').select('*').eq('couple_id', coupleId).eq('question_id', question.id);
    setAnswers(data || []);
  }, [coupleId, question]);

  useEffect(() => { loadAnswers(); setMine(''); }, [loadAnswers]);

  useEffect(() => {
    if (!question) return;
    const ch = supabase.channel(`majlis-${coupleId}-${question.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'majlis_answers', filter: `couple_id=eq.${coupleId}` }, loadAnswers)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, question, loadAnswers]);

  const submitAnswer = async () => {
    if (!mine.trim() || !question) return;
    await supabase.from('majlis_answers').insert({ couple_id: coupleId, question_id: question.id, user_id: me.id, answer_text: mine.trim() });
  };

  const myAnswer = answers.find((a) => a.user_id === me.id);
  const partnerAnswer = answers.find((a) => a.user_id === partner?.id);

  if (!question) return <div style={{ background: c.bg, color: c.textDim }} className="h-full flex items-center justify-center text-xs">جاري التحميل...</div>;

  return (
    <div style={{ background: c.bg }} className="h-full w-full flex flex-col">
      <div style={{ background: c.bg2, borderColor: c.border }} className="border-b px-4 py-3 flex items-center gap-2">
        <HelpCircle style={{ color: c.gold }} size={16} />
        <span style={{ color: c.gold, fontFamily: FONT_DISPLAY }} className="text-lg">مجلسنَ</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div style={{ background: c.bg2, borderColor: c.border }} className="border rounded-2xl p-5 mb-4 text-center">
          <div style={{ color: c.text }} className="text-base font-bold">{question.text}</div>
        </div>

        {!myAnswer ? (
          <>
            <textarea value={mine} onChange={(e) => setMine(e.target.value)} placeholder="اكتب إجابتك..."
              style={{ background: c.bg2, color: c.text }} className="w-full rounded-xl p-3 text-sm outline-none mb-3 h-24 resize-none" />
            <button onClick={submitAnswer} style={{ background: c.gold, color: c.bg }} className="w-full rounded-xl py-3 text-sm font-bold">إرسال إجابتي</button>
          </>
        ) : (
          <div className="space-y-3">
            <div style={{ background: c.goldSoft }} className="rounded-xl p-3">
              <div style={{ color: c.gold }} className="text-[10px] font-bold mb-1">إجابتك</div>
              <div style={{ color: c.text }} className="text-sm">{myAnswer.answer_text}</div>
            </div>
            {partnerAnswer ? (
              <div style={{ background: c.bg2 }} className="rounded-xl p-3">
                <div style={{ color: c.rose }} className="text-[10px] font-bold mb-1">إجابة {partner?.display_name}</div>
                <div style={{ color: c.text }} className="text-sm">{partnerAnswer.answer_text}</div>
              </div>
            ) : (
              <div style={{ color: c.textDim }} className="text-xs text-center py-3">في انتظار إجابة شريكك...</div>
            )}
          </div>
        )}
      </div>
      <div style={{ borderColor: c.border }} className="border-t p-3 flex justify-between">
        <button disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} style={{ color: c.gold }} className="flex items-center gap-1 text-xs disabled:opacity-30"><ChevronRight size={14} />السابق</button>
        <button disabled={idx >= questions.length - 1} onClick={() => setIdx((i) => i + 1)} style={{ color: c.gold }} className="flex items-center gap-1 text-xs disabled:opacity-30">التالي<ChevronLeft size={14} /></button>
      </div>
    </div>
  );
}

/* ===========================================================
   BAYNA-HOME quick link wrapper + GIFFAN + STORIES (kept inline
   for brevity/back-compat where BaynaScreen doesn't cover them)
=========================================================== */
function HomeWithPhrases(props) {
  const { couple } = props;
  const [phrases] = useCoupleTable('phrases', couple.id);
  return <HomeScreen c={props.c} t={props.t} me={props.me} partner={props.partner} couple={couple} phrases={phrases} onQuickAction={props.onQuickAction} onOpenChat={props.onOpenChat} onOpenBayna={props.onOpenBayna} toasts={props.toasts} />;
}

/* ===========================================================
   8) APP SHELL — session, couple resolution, presence, notifications
=========================================================== */

// Shared visual for the three "we couldn't finish loading" states below
// (session error / profile error / couple error). Same look as before —
// just pulled out once instead of duplicated three times.
function BootstrapError({ c, message, onRetry }) {
  return (
    <div style={{ background: c.bg, color: c.text }} className="h-full w-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-2xl">⚠️</div>
      <div className="text-sm font-bold">تعذر تحميل التطبيق</div>
      {message && (
        <div style={{ color: c.textDim, background: c.goldSoft, border: `1px solid ${c.border}` }} className="text-xs rounded-xl px-3 py-2 max-w-xs break-words">
          {message}
        </div>
      )}
      <button
        onClick={onRetry}
        style={{ background: c.gold, color: c.bg }}
        className="mt-1 text-xs font-bold rounded-xl px-5 py-2"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

export default function MesahaApp() {
  // This condition never changes during the app's lifetime (it's derived
  // once from build-time env vars), so throwing before any hooks run here
  // is safe and consistent across renders. The error boundary in main.jsx
  // catches it and shows the message + retry button instead of a blank page.
  if (SUPABASE_CONFIG_ERROR) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }

  // session: undefined = we don't know yet (still loading / haven't heard
  // back). null = we asked and Supabase confirmed there is no session
  // (genuinely logged out). Never set to null on a *failed* getSession()
  // call — that would be indistinguishable from "logged out" and would
  // silently show the login screen instead of the real error.
  const [session, setSession] = useState(undefined);
  const [sessionError, setSessionError] = useState(null); // state 6
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState(null); // profile load failure
  const [couple, setCouple] = useState(null);
  const [coupleError, setCoupleError] = useState(null); // state 7
  const [partner, setPartner] = useState(null);
  // true while we are actively resolving whether the signed-in user already
  // belongs to a couple/space. Without this, there is a window right after
  // a refresh (session + profile loaded, but the couple/member lookup not
  // finished yet) where `couple` is still null and the app would wrongly
  // show the "create/join a space" screen even though a space exists.
  const [coupleLoading, setCoupleLoading] = useState(true);
  const [tab, setTab] = useState('home');
  const [toasts, setToasts] = useState([]);

  const dark = me?.dark_mode ?? true;
  const lang = me?.lang ?? 'ar';
  const c = dark ? PALETTE.dark : PALETTE.light;
  const t = I18N[lang];

  // --- session bootstrap ---
  // Pulled into its own function (instead of inline in the effect) so the
  // "إعادة المحاولة" button on the session-error screen can re-run exactly
  // this, without duplicating it.
  const fetchSession = useCallback(() => {
    setSessionError(null);
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch((err) => {
        // Deliberately do NOT setSession(null) here — that would read as
        // "confirmed logged out" and silently show the login screen instead
        // of a real error. `session` stays whatever it already was
        // (undefined on first load), and sessionError drives the UI.
        console.error('getSession failed:', err?.message || err);
        setSessionError(err?.message || 'تعذر الاتصال بالخادم.');
      });
  }, []);

  useEffect(() => {
    fetchSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessionError(null);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchSession]);

  const loadMe = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      setMe(data);
      setMeError(null);
    } catch (e) {
      // Previously: no error check at all, so a failed fetch here just left
      // `me` as null forever — the app would sit on "...جاري التحميل"
      // indefinitely with nothing telling the user (or us) why.
      console.error('loadMe failed:', e?.message || e);
      setMeError(e?.message || 'تعذر تحميل بيانات الحساب.');
    }
  }, []);

  const loadCouple = useCallback(async (userId) => {
    setCoupleLoading(true);
    try {
      // .eq('user_id', userId) is expected to match at most one row — the DB
      // now enforces this with a UNIQUE constraint on couple_members.user_id,
      // so .maybeSingle() can no longer throw a "multiple rows" error here.
      const { data: membership, error: mErr } = await supabase.from('couple_members').select('couple_id').eq('user_id', userId).maybeSingle();
      if (mErr) throw mErr;
      if (!membership) { setCouple(null); setPartner(null); setCoupleError(null); return; }
      const { data: coupleRow, error: cErr } = await supabase.from('couples').select('*').eq('id', membership.couple_id).single();
      if (cErr) throw cErr;
      setCouple(coupleRow);
      setCoupleError(null);
      const { data: members } = await supabase.from('couple_members').select('user_id').eq('couple_id', membership.couple_id);
      const partnerId = members?.find((m) => m.user_id !== userId)?.user_id;
      if (partnerId) {
        const { data: pProfile } = await supabase.from('profiles').select('*').eq('id', partnerId).single();
        setPartner(pProfile);
      } else {
        setPartner(null);
      }
    } catch (e) {
      // IMPORTANT: `couple` is deliberately left untouched here (not set to
      // null). If this is the very first load it's already null, but the
      // render logic below checks `coupleError` *before* it ever checks
      // `!couple` — so a failed lookup can never be mistaken for "this user
      // has no space" and can never show the create/join screen.
      console.error('loadCouple failed:', e?.message || e);
      setCoupleError(e?.message || 'تعذر تحميل بيانات المساحة.');
    } finally {
      setCoupleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session === undefined || session === null) return;
    setMe(null); // reset while we (re)resolve this session's profile
    loadMe(session.user.id);
    loadCouple(session.user.id);
  }, [session, loadMe, loadCouple]);

  useEffect(() => {
    if (session !== null) return;
    setMe(null); setMeError(null);
    setCouple(null); setCoupleError(null); setPartner(null);
    setCoupleLoading(false);
  }, [session]);

  // live-update my own profile row (e.g. after settings change on another tab)
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel(`profile-${me.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${me.id}` },
        (payload) => setMe(payload.new))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [me?.id]);

  // live-update partner profile (online status / last_seen / display info)
  useEffect(() => {
    if (!partner) return;
    const ch = supabase.channel(`partner-${partner.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${partner.id}` },
        (payload) => setPartner(payload.new))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [partner?.id]);

  // presence: mark self online while the tab is open, offline (+last_seen) on unload
  useEffect(() => {
    if (!me) return;
    supabase.from('profiles').update({ is_online: true, last_seen_at: new Date().toISOString() }).eq('id', me.id).then(() => {});
    const beat = setInterval(() => {
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', me.id).then(() => {});
    }, 30000);
    const goOffline = () => {
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${me.id}`,
      );
      supabase.from('profiles').update({ is_online: false, last_seen_at: new Date().toISOString() }).eq('id', me.id);
    };
    window.addEventListener('beforeunload', goOffline);
    return () => { clearInterval(beat); window.removeEventListener('beforeunload', goOffline); goOffline(); };
  }, [me?.id]);

  // in-app notification toasts (for events triggered by partner while I'm active)
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel(`notif-${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${me.id}` },
        (payload) => {
          const id = Date.now();
          setToasts((a) => [...a, { id, text: payload.new.body }]);
          setTimeout(() => setToasts((a) => a.filter((x) => x.id !== id)), 3200);
        }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [me?.id]);

  // Optimistic local setters for per-user prefs. Settings screen calls these
  // right after writing to Supabase; without them the toggle/lang buttons
  // wrote to the DB but the UI never visibly changed (it only updated once
  // the realtime postgres_changes event came back, which can be slow or, if
  // Realtime isn't enabled on the profiles table, never).
  const setDark = useCallback((v) => setMe((m) => (m ? { ...m, dark_mode: v } : m)), []);
  const setLang = useCallback((v) => setMe((m) => (m ? { ...m, lang: v } : m)), []);

  const quickAction = async (label) => {
    if (!couple || !me) return;
    await supabase.from('messages').insert({ couple_id: couple.id, sender_id: me.id, type: 'text', text: label });
    if (partner) notifyPartner({ coupleId: couple.id, recipientId: partner.id, actorId: me.id, kind: 'message', body: `${me.display_name} أرسل: ${label}` });
  };

  const NAV = [
    { key: 'home', label: t.home, icon: HomeIcon },
    { key: 'chat', label: t.chat, icon: MessageCircle },
    { key: 'majlis', label: t.majlis, icon: HelpCircle },
    { key: 'bayna', label: 'بيناتنا', icon: Gamepad2 },
    { key: 'memories', label: t.memories, icon: BookOpen },
    { key: 'gallery', label: lang === 'ar' ? 'صور تجمعنا' : lang === 'fr' ? 'Nos photos' : 'Our Photos', icon: ImageIcon },
    { key: 'occasions', label: t.occasions, icon: CalendarIcon },
    { key: 'settings', label: t.settings, icon: SettingsIcon },
    ...(me?.is_admin ? [{ key: 'admin-bayna', label: 'إدارة', icon: ShieldCheck }] : []),
  ];

  // Explicit state machine — each branch below corresponds to exactly one
  // of these, checked in an order where errors are always caught before
  // they could be misread as a legitimate "logged out" / "no space" state:
  //   6. Error loading session   (sessionError)
  //   1. Loading                 (session still undefined)
  //   2. Not authenticated       (session === null, no error)
  //   [profile load error — not one of the 8 named states but needed so a
  //    failed profile fetch can't hang forever either]
  //   3. Authenticated + loading profile/couple (coupleLoading, no error)
  //   7. Error loading couple    (coupleError)
  //   4. Authenticated + couple exists
  //   5. Authenticated + no couple exists
  // (8. Supabase configuration error is handled above via `throw`, before
  //  any of this ever runs.)
  let body;
  if (sessionError) {
    body = <BootstrapError c={c} message={sessionError} onRetry={fetchSession} />;
  } else if (session === undefined) {
    body = <div style={{ background: c.bg, color: c.textDim }} className="h-full w-full flex items-center justify-center text-sm">...جاري التحميل</div>;
  } else if (session === null) {
    body = <AuthScreen c={c} />;
  } else if (meError) {
    body = <BootstrapError c={c} message={meError} onRetry={() => loadMe(session.user.id)} />;
  } else if (!me || coupleLoading) {
    body = <div style={{ background: c.bg, color: c.textDim }} className="h-full w-full flex items-center justify-center text-sm">...جاري التحميل</div>;
  } else if (coupleError) {
    // Deliberately checked BEFORE `!couple` below: `couple` can legitimately
    // still be null here (this failed before ever confirming one way or the
    // other), so without this check a failed lookup would show the
    // create/join-a-space screen and let the user try to create a duplicate
    // space instead of just retrying the failed request.
    body = <BootstrapError c={c} message={coupleError} onRetry={() => loadCouple(session.user.id)} />;
  } else if (!couple) {
    body = <CoupleSetupScreen c={c} userId={session.user.id} onLinked={() => loadCouple(session.user.id)} />;
  } else {
    body = (
      <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0">
          {tab === 'home' && <HomeWithPhrases c={c} t={t} me={me} partner={partner} couple={couple} onQuickAction={quickAction} onOpenChat={() => setTab('chat')} onOpenBayna={() => setTab('bayna')} toasts={toasts} />}
          {tab === 'chat' && <ChatScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'majlis' && <MajlisScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'bayna' && <BaynaScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'memories' && <MemoriesScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'gallery' && <Gallery c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'occasions' && <OccasionsScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'settings' && <SettingsScreen c={c} dark={dark} setDark={setDark} lang={lang} setLang={setLang} me={me} coupleId={couple.id} partner={partner} />}
          {tab === 'admin-bayna' && me?.is_admin && <AdminBaynaScreen c={c} me={me} />}
        </div>
        <div style={{ background: c.bg2, borderTop: `1px solid ${c.border}` }} className="flex items-center justify-around py-2 px-1">
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setTab(n.key)} className="flex flex-col items-center gap-0.5 px-1 py-1">
              <n.icon size={17} style={{ color: tab === n.key ? c.gold : c.textDim }} />
              <span style={{ color: tab === n.key ? c.gold : c.textDim }} className="text-[9px] whitespace-nowrap">{n.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ fontFamily: FONT_BODY }} className="w-full h-screen flex items-center justify-center">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Tajawal:wght@300;400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>
      <div style={{
        width: '100%', maxWidth: 420, height: '100%', maxHeight: 860, background: c.bg,
        borderRadius: 28, overflow: 'hidden', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {body}
      </div>
    </div>
  );
}
