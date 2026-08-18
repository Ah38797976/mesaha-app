import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Heart, MessageCircle, Moon, Sun, Settings as SettingsIcon, Calendar as CalendarIcon,
  Lock, ChevronLeft, ChevronRight, Search, Plus, Check, CheckCheck, X, Sparkles, Gift,
  Mic, Image as ImageIcon, Send, Home as HomeIcon, BookOpen,
  HelpCircle, Shuffle, Bookmark, LogOut, Copy, Link2, Square
} from 'lucide-react';
import { supabase, uploadToBucket, uploadBlob, signedUrl, notifyPartner } from './lib/supabaseClient';

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
      <div style={{ color: c.textDim }} className="text-sm mb-6">
        {mode === 'signin' ? 'سجّل الدخول لمساحتكم' : 'أنشئ حسابك للدخول لأول مرة'}
      </div>

      <div className="w-full max-w-xs grid gap-3">
        {mode === 'signup' && (
          <>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="اسمك"
              style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
              className="rounded-xl p-3 text-sm outline-none" />
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="الدولة"
              style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
              className="rounded-xl p-3 text-sm outline-none" />
          </>
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" type="email"
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
          className="rounded-xl p-3 text-sm outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة السر" type="password"
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
          className="rounded-xl p-3 text-sm outline-none" />
        {err && <div style={{ color: c.rose }} className="text-xs">{err}</div>}
        <button onClick={submit} disabled={busy || !email || !password}
          style={{ background: c.gold, color: c.bg, opacity: busy ? 0.7 : 1 }}
          className="rounded-full py-3 font-bold text-sm">
          {busy ? '...' : mode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
        </button>
        <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          style={{ color: c.gold }} className="text-xs">
          {mode === 'signin' ? 'ما عندك حساب؟ أنشئ واحد' : 'عندك حساب؟ سجّل الدخول'}
        </button>
      </div>
    </div>
  );
}

/* ===========================================================
   2) COUPLE SETUP — create a space (get invite code) or join one
=========================================================== */
function CoupleSetupScreen({ c, userId, onLinked }) {
  const [tab, setTab] = useState('create');
  const [startDate, setStartDate] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const create = async () => {
    setErr(''); setBusy(true);
    try {
      const { data: couple, error } = await supabase
        .from('couples')
        .insert({ created_by: userId, start_date: startDate || null })
        .select()
        .single();
      if (error) throw error;
      const { error: mErr } = await supabase.from('couple_members').insert({ couple_id: couple.id, user_id: userId });
      if (mErr) throw mErr;
      setCreatedCode(couple.invite_code);
    } catch (e) {
      setErr(e.message || 'تعذر إنشاء المساحة');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setErr(''); setBusy(true);
    try {
      const { data: couple, error } = await supabase
        .from('couples').select('id').eq('invite_code', code.trim()).single();
      if (error || !couple) throw new Error('كود الدعوة غير صحيح');
      const { error: mErr } = await supabase.from('couple_members').insert({ couple_id: couple.id, user_id: userId });
      if (mErr) throw mErr;
      onLinked();
    } catch (e) {
      setErr(e.message || 'تعذر الانضمام — تحقق من الكود');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: FONT_BODY }}
      className="h-full w-full flex flex-col items-center justify-center px-8">
      <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-2xl mb-6">مساحتكم الخاصة</div>

      <div style={{ background: c.bg3, border: `1px solid ${c.border}` }} className="flex rounded-full p-1 mb-6 w-full max-w-xs">
        {[['create', 'أنشئ مساحة'], ['join', 'انضم بكود']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            background: tab === k ? c.gold : 'transparent', color: tab === k ? c.bg : c.textDim,
          }} className="flex-1 rounded-full py-2 text-xs font-bold">{l}</button>
        ))}
      </div>

      {tab === 'create' && !createdCode && (
        <div className="w-full max-w-xs grid gap-3">
          <label style={{ color: c.textDim }} className="text-xs">تاريخ بداية العلاقة</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="rounded-xl p-3 text-sm outline-none" />
          {err && <div style={{ color: c.rose }} className="text-xs">{err}</div>}
          <button onClick={create} disabled={busy} style={{ background: c.gold, color: c.bg }}
            className="rounded-full py-3 font-bold text-sm">{busy ? '...' : 'إنشاء المساحة'}</button>
        </div>
      )}

      {tab === 'create' && createdCode && (
        <div className="w-full max-w-xs grid gap-3 text-center">
          <div style={{ color: c.textDim }} className="text-sm">شارك هذا الكود مع شريكك:</div>
          <div style={{ background: c.goldSoft, color: c.gold, fontFamily: FONT_DISPLAY }}
            className="rounded-2xl p-4 text-2xl tracking-widest">{createdCode}</div>
          <button onClick={() => navigator.clipboard?.writeText(createdCode)}
            style={{ color: c.gold, border: `1px solid ${c.gold}` }}
            className="rounded-full py-2.5 text-sm flex items-center justify-center gap-2">
            <Copy size={14} /> نسخ الكود
          </button>
          <button onClick={onLinked} style={{ background: c.gold, color: c.bg }}
            className="rounded-full py-3 font-bold text-sm mt-2">تم، ادخل للمساحة</button>
        </div>
      )}

      {tab === 'join' && (
        <div className="w-full max-w-xs grid gap-3">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="أدخل كود الدعوة"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="rounded-xl p-3 text-sm outline-none text-center tracking-widest" />
          {err && <div style={{ color: c.rose }} className="text-xs">{err}</div>}
          <button onClick={join} disabled={busy || !code.trim()} style={{ background: c.gold, color: c.bg }}
            className="rounded-full py-3 font-bold text-sm flex items-center justify-center gap-2">
            <Link2 size={14} /> {busy ? '...' : 'انضم للمساحة'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   3) HOME
=========================================================== */
function HomeScreen({ c, t, me, partner, couple, phrases, onQuickAction, onOpenChat, toasts }) {
  const displayNames = `${me?.display_name || ''} ❤️ ${partner?.display_name || ''}`;
  const quote = phrases.length ? phrases[Math.floor(Date.now() / 86400000) % phrases.length].text : '';

  const actions = [
    { key: 'missYou', label: t.missYou, icon: Heart },
    { key: 'loveYou', label: t.loveYou, icon: Sparkles },
    { key: 'goodnight', label: t.goodnight, icon: Moon },
    { key: 'goodmorning', label: t.goodmorning, icon: Sun },
  ];

  return (
    <div className="h-full overflow-y-auto relative">
      <div className="relative h-56 overflow-hidden" style={{ background: `linear-gradient(180deg, ${c.bg2} 0%, ${c.bg} 100%)` }}>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4">
          <div className="flex items-center -space-x-3 rtl:space-x-reverse mb-3">
            <div style={{ background: c.gold, color: c.bg, fontFamily: FONT_DISPLAY }}
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl border-4">{me?.display_name?.[0] || '؟'}</div>
            <div style={{ background: c.rose, color: c.bg, borderColor: c.bg }}
              className="w-8 h-8 rounded-full flex items-center justify-center -mx-2 border-2 z-10">
              <Heart size={14} fill={c.bg} />
            </div>
            <div style={{ background: c.rose, color: c.bg, fontFamily: FONT_DISPLAY }}
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl border-4">{partner?.display_name?.[0] || '؟'}</div>
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-2xl">
            {me?.display_name || '...'} <span style={{ color: c.rose }}>♥</span> {partner?.display_name || 'بانتظار الشريك'}
          </div>
          <div style={{ color: c.textDim }} className="text-xs mt-1">
            {couple?.start_date ? `${t.together} ${relationshipDuration(couple.start_date)}` : ''}
          </div>
          {partner && (
            <div style={{ color: partner.is_online ? '#7BC08C' : c.textDim }} className="text-xs mt-1">
              {partner.is_online ? `🟢 ${partner.display_name} ${t.online}` : `${t.offline} ${timeAgo(partner.last_seen_at)}`}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 -mt-2 relative z-10">
        {quote && (
          <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 mb-5">
            <div style={{ color: c.gold }} className="text-xs mb-1 flex items-center gap-1"><Sparkles size={13} /> گليمة اليوم</div>
            <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-lg leading-relaxed">{quote}</div>
          </div>
        )}

        <button onClick={onOpenChat} style={{ background: `linear-gradient(90deg, ${c.gold}, ${c.rose})`, color: c.bg }}
          className="w-full rounded-2xl py-4 flex items-center justify-center gap-2 mb-5 font-bold">
          <MessageCircle size={19} /> {t.enterChat}
        </button>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {actions.map((a) => (
            <button key={a.key} onClick={() => onQuickAction(a.label)}
              style={{ background: c.bg2, border: `1px solid ${c.border}`, color: c.text }}
              className="rounded-2xl py-4 flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <a.icon size={20} style={{ color: c.rose }} />
              <span className="text-sm">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-start pt-6 z-50" style={{ maxWidth: 420, margin: '0 auto' }}>
        {toasts.map((tt) => (
          <div key={tt.id} style={{ background: c.bg2, border: `1px solid ${c.gold}`, color: c.text }}
            className="mb-2 px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg">
            <Heart size={14} style={{ color: c.rose }} fill={c.rose} /> {tt.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
   4) CHAT — realtime messages, image/voice uploads, secret messages
=========================================================== */
function ChatScreen({ c, coupleId, me, partner }) {
  const [messages, setMessages] = useState([]);
  const [secretMsgs, setSecretMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [activeMsgMenu, setActiveMsgMenu] = useState(null);
  const [mediaUrls, setMediaUrls] = useState({});
  const [recording, setRecording] = useState(false);
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
    setSecretMsgs(data || []);
  }, [coupleId]);

  useEffect(() => { loadMessages(); loadSecrets(); }, [loadMessages, loadSecrets]);

  useEffect(() => {
    const ch = supabase.channel(`messages-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setMessages((m) => [...m, payload.new]);
          if (payload.eventType === 'UPDATE') setMessages((m) => m.map((x) => x.id === payload.new.id ? payload.new : x));
          if (payload.eventType === 'DELETE') setMessages((m) => m.filter((x) => x.id !== payload.old.id));
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'secret_messages', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setSecretMsgs((m) => [...m, payload.new]);
          if (payload.eventType === 'UPDATE') setSecretMsgs((m) => m.map((x) => x.id === payload.new.id ? payload.new : x));
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // mark partner's messages as read once viewed
  useEffect(() => {
    const unread = messages.filter((m) => m.sender_id !== me.id && m.status !== 'read');
    if (unread.length) {
      supabase.from('messages').update({ status: 'read' }).in('id', unread.map((m) => m.id)).then(() => {});
    }
  }, [messages, me.id]);

  // resolve signed urls for media messages
  useEffect(() => {
    const need = messages.filter((m) => m.media_path && !mediaUrls[m.media_path]);
    if (!need.length) return;
    (async () => {
      const entries = await Promise.all(need.map(async (m) => {
        const bucket = m.type === 'voice' ? 'voice-notes' : 'chat-media';
        const url = await signedUrl(bucket, m.media_path);
        return [m.media_path, url];
      }));
      setMediaUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [messages, mediaUrls]);

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput(''); setReplyTo(null);
    const { data } = await supabase.from('messages').insert({
      couple_id: coupleId, sender_id: me.id, type: 'text', text, reply_to_id: replyTo?.id || null,
    }).select().single();
    if (data && partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'message', body: `${me.display_name} أرسل لك رسالة ❤️` });
  };

  const pickImage = () => fileInputRef.current?.click();
  const onImageChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const path = await uploadToBucket('chat-media', coupleId, file, 'img-');
    await supabase.from('messages').insert({ couple_id: coupleId, sender_id: me.id, type: 'image', media_path: path });
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'message', body: `${me.display_name} أرسل صورة 📸` });
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => chunksRef.current.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const path = await uploadBlob('voice-notes', coupleId, blob, 'webm', 'voice-');
      await supabase.from('messages').insert({ couple_id: coupleId, sender_id: me.id, type: 'voice', media_path: path });
      if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'message', body: `${me.display_name} أرسل تسجيل صوتي 🎙️` });
      stream.getTracks().forEach((t) => t.stop());
    };
    rec.start();
    mediaRecorderRef.current = rec;
    setRecording(true);
  };
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); };

  const deleteMsg = async (id) => { await supabase.from('messages').delete().eq('id', id); setActiveMsgMenu(null); };

  const filtered = search ? messages.filter((m) => m.text?.includes(search)) : messages;

  return (
    <div className="h-full flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />
      <div style={{ background: c.bg2, borderBottom: `1px solid ${c.border}` }} className="px-4 py-3 flex items-center gap-3">
        <div style={{ background: c.rose, color: c.bg, fontFamily: FONT_DISPLAY }}
          className="w-10 h-10 rounded-full flex items-center justify-center">{partner?.display_name?.[0] || '؟'}</div>
        <div className="flex-1">
          <div style={{ color: c.text }} className="font-bold text-sm">{partner?.display_name || 'بانتظار الشريك'}</div>
          <div style={{ color: c.textDim }} className="text-xs">
            {partner?.is_online ? '🟢 متصلة الآن' : partner ? `آخر ظهور ${timeAgo(partner.last_seen_at)}` : ''}
          </div>
        </div>
        <button onClick={() => setShowSearch((s) => !s)} style={{ color: c.gold }}><Search size={19} /></button>
        <button onClick={() => setShowSecretModal(true)} style={{ color: c.gold }}><Lock size={18} /></button>
      </div>

      {showSearch && (
        <div className="px-4 py-2" style={{ background: c.bg2 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في المحادثة…"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="w-full rounded-full px-4 py-2 text-sm outline-none" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: c.bg }}>
        {secretMsgs.filter((s) => !s.opened_at).map((s) => (
          <SecretBubble key={s.id} c={c} s={s} mine={s.sender_id === me.id}
            onOpen={async () => {
              if (new Date(s.unlock_at) <= new Date()) {
                await supabase.from('secret_messages').update({ opened_at: new Date().toISOString() }).eq('id', s.id);
              }
            }} />
        ))}

        {filtered.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} className={`flex mb-3 ${mine ? 'justify-end' : 'justify-start'}`}
              onClick={() => setActiveMsgMenu(activeMsgMenu === m.id ? null : m.id)}>
              <div style={{
                background: mine ? `linear-gradient(135deg, ${c.gold}, ${c.rose})` : c.bg2,
                color: mine ? c.bg : c.text, border: mine ? 'none' : `1px solid ${c.border}`,
              }} className="rounded-2xl px-4 py-2 max-w-[75%]">
                {m.type === 'text' && <div className="text-sm leading-relaxed">{m.text}</div>}
                {m.type === 'image' && (
                  mediaUrls[m.media_path]
                    ? <img src={mediaUrls[m.media_path]} alt="" className="w-40 h-28 rounded-xl object-cover" />
                    : <div style={{ background: c.bg3 }} className="w-40 h-28 rounded-xl flex items-center justify-center"><ImageIcon size={26} style={{ color: c.textDim }} /></div>
                )}
                {m.type === 'voice' && (
                  <div className="flex items-center gap-2 py-1">
                    <Mic size={16} />
                    {mediaUrls[m.media_path] && <audio controls src={mediaUrls[m.media_path]} style={{ height: 28, maxWidth: 160 }} />}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-xs opacity-70">{localTime(m.created_at)}</span>
                  {mine && (m.status === 'read' ? <CheckCheck size={13} /> : <Check size={13} />)}
                </div>
                {activeMsgMenu === m.id && (
                  <div className="flex gap-3 mt-2 pt-2" style={{ borderTop: `1px solid rgba(0,0,0,0.15)` }}>
                    <button onClick={(e) => { e.stopPropagation(); setReplyTo(m); setActiveMsgMenu(null); }} className="text-xs underline">رد</button>
                    {mine && <button onClick={(e) => { e.stopPropagation(); deleteMsg(m.id); }} className="text-xs underline">حذف</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="px-4 py-2 flex items-center justify-between" style={{ background: c.bg2, borderTop: `1px solid ${c.border}` }}>
          <span style={{ color: c.textDim }} className="text-xs">رد على: {replyTo.text || 'وسائط'}</span>
          <button onClick={() => setReplyTo(null)}><X size={14} style={{ color: c.textDim }} /></button>
        </div>
      )}

      <div style={{ background: c.bg2, borderTop: `1px solid ${c.border}` }} className="px-3 py-3 flex items-center gap-2">
        <button onClick={pickImage} style={{ color: c.gold }}><ImageIcon size={20} /></button>
        <button onClick={recording ? stopRecording : startRecording} style={{ color: recording ? c.rose : c.gold }}>
          {recording ? <Square size={20} /> : <Mic size={20} />}
        </button>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="اكتب رسالة…" style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
          className="flex-1 rounded-full px-4 py-2 text-sm outline-none" />
        <button onClick={send} style={{ background: c.gold, color: c.bg }} className="w-10 h-10 rounded-full flex items-center justify-center">
          <Send size={16} />
        </button>
      </div>

      {showSecretModal && (
        <SecretComposer c={c} onClose={() => setShowSecretModal(false)}
          onCreate={async (text, unlockAt) => {
            await supabase.from('secret_messages').insert({ couple_id: coupleId, sender_id: me.id, text, unlock_at: unlockAt });
            if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'secret', body: '💌 لديك رسالة سرية' });
            setShowSecretModal(false);
          }} />
      )}
    </div>
  );
}

function SecretBubble({ c, s, mine, onOpen }) {
  const unlocked = new Date(s.unlock_at) <= new Date();
  return (
    <div className="flex justify-center mb-3">
      <button onClick={onOpen} disabled={!unlocked} style={{
        background: c.bg2, border: `1px dashed ${c.gold}`, color: unlocked ? c.text : c.textDim,
      }} className="rounded-2xl px-4 py-3 text-xs flex items-center gap-2 max-w-[85%]">
        <Lock size={14} />
        {unlocked ? `اضغط لفتح ${mine ? '(رسالتك)' : ''}: "${s.text}"` : `رسالة سرية 💌 — تُفتح ${new Date(s.unlock_at).toLocaleString('ar')}`}
      </button>
    </div>
  );
}

function SecretComposer({ c, onClose, onCreate }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('hour');
  const [custom, setCustom] = useState('');
  const compute = () => {
    if (mode === 'custom' && custom) return new Date(custom).toISOString();
    const d = new Date();
    if (mode === 'demo') d.setSeconds(d.getSeconds() + 10);
    if (mode === 'hour') d.setHours(d.getHours() + 1);
    if (mode === 'tomorrow') d.setDate(d.getDate() + 1);
    return d.toISOString();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: c.bg2, border: `1px solid ${c.border}`, maxWidth: 420, width: '100%' }} className="rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-lg">رسالة سرية 💌</div>
          <button onClick={onClose}><X size={18} style={{ color: c.textDim }} /></button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك…"
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
          className="w-full rounded-xl p-3 text-sm outline-none mb-3" rows={3} />
        <div className="flex flex-wrap gap-2 mb-3">
          {[['hour', 'بعد ساعة'], ['tomorrow', 'غدًا'], ['custom', 'تاريخ مخصص'], ['demo', 'تجربة (10ث)']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{
              background: mode === k ? c.gold : 'transparent', color: mode === k ? c.bg : c.text, border: `1px solid ${c.gold}`,
            }} className="rounded-full px-3 py-1 text-xs">{l}</button>
          ))}
        </div>
        {mode === 'custom' && (
          <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)}
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="w-full rounded-xl p-2 text-sm outline-none mb-3" />
        )}
        <button onClick={() => text.trim() && onCreate(text.trim(), compute())}
          style={{ background: c.gold, color: c.bg }} className="w-full rounded-full py-3 font-bold">إرسال الرسالة السرية</button>
      </div>
    </div>
  );
}

/* ===========================================================
   5) MEMORIES / OCCASIONS / STORIES — shared, realtime CRUD
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
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setRows((r) => [...r, payload.new]);
          if (payload.eventType === 'UPDATE') setRows((r) => r.map((x) => x.id === payload.new.id ? payload.new : x));
          if (payload.eventType === 'DELETE') setRows((r) => r.filter((x) => x.id !== payload.old.id));
        }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [table, coupleId]);
  return [rows, load];
}

function MemoriesScreen({ c, coupleId, me, partner }) {
  const [memories] = useCoupleTable('memories', coupleId, 'memory_date');
  const [showAdd, setShowAdd] = useState(false);
  const sorted = [...memories].sort((a, b) => new Date(a.memory_date) - new Date(b.memory_date));

  const add = async (title, date, note, file) => {
    let photo_path = null;
    if (file) photo_path = await uploadToBucket('memories', coupleId, file, 'mem-');
    await supabase.from('memories').insert({ couple_id: coupleId, added_by: me.id, title, memory_date: date, note, photo_path });
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'memory', body: `📸 أضاف ${me.display_name} ذكرى` });
    setShowAdd(false);
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl">ذكرياتنا 📸</div>
        <button onClick={() => setShowAdd(true)} style={{ background: c.goldSoft, color: c.gold }} className="w-9 h-9 rounded-full flex items-center justify-center">
          <Plus size={18} />
        </button>
      </div>
      <div className="relative ps-6">
        <div style={{ background: c.border, position: 'absolute', top: 4, bottom: 4, insetInlineStart: 7, width: 2 }} />
        {sorted.map((m) => (
          <div key={m.id} className="relative mb-6">
            <div style={{ background: c.gold, position: 'absolute', insetInlineStart: -19, top: 4 }} className="w-3.5 h-3.5 rounded-full" />
            <div style={{ color: c.textDim }} className="text-xs mb-1">{new Date(m.memory_date).toLocaleDateString('ar')}</div>
            <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4">
              <div style={{ color: c.text }} className="font-bold text-sm mb-1">{m.title}</div>
              {m.note && <div style={{ color: c.textDim }} className="text-sm">{m.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {showAdd && <AddMemoryModal c={c} onClose={() => setShowAdd(false)} onAdd={add} />}
    </div>
  );
}

function AddMemoryModal({ c, onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: c.bg2, maxWidth: 420, width: '100%' }} className="rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-lg">ذكرى جديدة</div>
          <button onClick={onClose}><X size={18} style={{ color: c.textDim }} /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="العنوان"
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-3" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-3" />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="الوصف"
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-3" rows={2} />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-xs mb-4" style={{ color: c.textDim }} />
        <button onClick={() => title && date && onAdd(title, date, note, file)}
          style={{ background: c.gold, color: c.bg }} className="w-full rounded-full py-3 font-bold">حفظ الذكرى</button>
      </div>
    </div>
  );
}

function OccasionsScreen({ c, coupleId, me, partner }) {
  const [occasions] = useCoupleTable('occasions', coupleId);
  const [showAdd, setShowAdd] = useState(false);
  const add = async (title, date) => {
    await supabase.from('occasions').insert({ couple_id: coupleId, added_by: me.id, title, occasion_date: date });
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'occasion', body: `🎂 أضاف ${me.display_name} مناسبة: ${title}` });
    setShowAdd(false);
  };
  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl">المناسبات 🎂</div>
        <button onClick={() => setShowAdd(true)} style={{ background: c.goldSoft, color: c.gold }} className="w-9 h-9 rounded-full flex items-center justify-center"><Plus size={18} /></button>
      </div>
      <div className="grid gap-3">
        {occasions.map((o) => {
          const d = daysUntil(o.occasion_date);
          return (
            <div key={o.id} style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div style={{ background: c.goldSoft, color: c.gold }} className="w-11 h-11 rounded-full flex items-center justify-center"><Gift size={19} /></div>
                <div>
                  <div style={{ color: c.text }} className="font-bold text-sm">{o.title}</div>
                  <div style={{ color: c.textDim }} className="text-xs">{nextOccurrence(o.occasion_date).toLocaleDateString('ar')}</div>
                </div>
              </div>
              <div style={{ color: c.rose }} className="text-sm font-bold">{d === 0 ? 'اليوم ❤️' : `باقي ${d} يوم`}</div>
            </div>
          );
        })}
      </div>
      {showAdd && <AddOccasionModal c={c} onClose={() => setShowAdd(false)} onAdd={add} />}
    </div>
  );
}
function AddOccasionModal({ c, onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: c.bg2, maxWidth: 420, width: '100%' }} className="rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-lg">مناسبة جديدة</div>
          <button onClick={onClose}><X size={18} style={{ color: c.textDim }} /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم المناسبة"
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-3" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-4" />
        <button onClick={() => title && date && onAdd(title, date)} style={{ background: c.gold, color: c.bg }} className="w-full rounded-full py-3 font-bold">إضافة</button>
      </div>
    </div>
  );
}

/* ===========================================================
   6) SETTINGS — per-user lang/dark mode + shared phrases + logout
=========================================================== */
function SettingsScreen({ c, dark, setDark, lang, setLang, me, coupleId, partner }) {
  const [phrases] = useCoupleTable('phrases', coupleId);
  const [newPhrase, setNewPhrase] = useState('');

  const addPhrase = async () => {
    if (!newPhrase.trim()) return;
    await supabase.from('phrases').insert({ couple_id: coupleId, added_by: me.id, text: newPhrase.trim() });
    setNewPhrase('');
  };
  const removePhrase = async (id) => { await supabase.from('phrases').delete().eq('id', id); };

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
    <div className="h-full overflow-y-auto px-5 py-5">
      <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl mb-4">الإعدادات ⚙️</div>

      <SettingsBlock c={c} title="المظهر">
        <div className="flex items-center justify-between">
          <span style={{ color: c.text }} className="text-sm flex items-center gap-2">{dark ? <Moon size={16} /> : <Sun size={16} />} الوضع الليلي (خاص بك)</span>
          <button onClick={() => toggleDark(!dark)} style={{ background: dark ? c.gold : c.border }} className="w-11 h-6 rounded-full relative">
            <div style={{ background: c.bg, transform: dark ? 'translateX(-22px)' : 'translateX(-2px)' }} className="w-5 h-5 rounded-full absolute top-0.5 transition-transform" />
          </button>
        </div>
      </SettingsBlock>

      <SettingsBlock c={c} title="اللغة (خاصة بك فقط)">
        <div className="flex gap-2">
          {[['ar', '🇲🇷 عربية'], ['fr', '🇫🇷 Français'], ['en', '🇬🇧 English']].map(([k, l]) => (
            <button key={k} onClick={() => changeLang(k)} style={{
              background: lang === k ? c.gold : 'transparent', color: lang === k ? c.bg : c.text, border: `1px solid ${c.gold}`,
            }} className="rounded-full px-3 py-1.5 text-xs">{l}</button>
          ))}
        </div>
      </SettingsBlock>

      <SettingsBlock c={c} title="عبارات حسانية (مشتركة)">
        <div className="flex flex-wrap gap-2 mb-3">
          {phrases.map((p) => (
            <span key={p.id} style={{ background: c.goldSoft, color: c.text }} className="rounded-full px-3 py-1 text-xs flex items-center gap-1">
              {p.text}
              <button onClick={() => removePhrase(p.id)}><X size={11} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newPhrase} onChange={(e) => setNewPhrase(e.target.value)} placeholder="أضف عبارة جديدة…"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="flex-1 rounded-xl p-2 text-sm outline-none" />
          <button onClick={addPhrase} style={{ background: c.gold, color: c.bg }} className="px-4 rounded-xl text-sm">إضافة</button>
        </div>
      </SettingsBlock>

      <SettingsBlock c={c} title="الأمان">
        <div style={{ color: c.textDim }} className="text-xs leading-relaxed">
          الدخول يتم عبر Supabase Auth، وكل البيانات محمية بقواعد Row Level Security بحيث لا يصل إليها إلا {me.display_name} و{partner?.display_name || 'شريكك'}.
        </div>
      </SettingsBlock>

      <button onClick={logout} style={{ color: c.rose, border: `1px solid ${c.rose}` }}
        className="w-full rounded-full py-3 text-sm mt-2 flex items-center justify-center gap-2">
        <LogOut size={15} /> تسجيل خروج
      </button>
    </div>
  );
}
function SettingsBlock({ c, title, children }) {
  return (
    <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 mb-4">
      <div style={{ color: c.gold }} className="text-xs font-bold mb-3">{title}</div>
      {children}
    </div>
  );
}

/* ===========================================================
   7) مجلسنَ — shared questions (DB-backed answers, no fake timers)
=========================================================== */
function QuestionsTab({ c, coupleId, me, partner }) {
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]); // rows for current question
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
    const ch = supabase.channel(`majlis-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'majlis_answers', filter: `couple_id=eq.${coupleId}` },
        () => loadAnswers())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, loadAnswers]);

  const myAnswer = answers.find((a) => a.user_id === me.id);
  const partnerAnswer = partner && answers.find((a) => a.user_id === partner.id);

  const submit = async () => {
    if (!mine.trim() || !question) return;
    await supabase.from('majlis_answers').insert({ couple_id: coupleId, question_id: question.id, user_id: me.id, answer_text: mine.trim() });
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'majlis', body: `❓ أجاب ${me.display_name} على سؤال مجلسنَ` });
  };

  const goto = (n) => setIdx(((n % questions.length) + questions.length) % questions.length);
  const randomQ = () => questions.length && goto(Math.floor(Math.random() * questions.length));

  if (!question) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div style={{ color: c.textDim }} className="text-xs">سؤال {idx + 1} من {questions.length}</div>
        <button onClick={randomQ} style={{ background: c.goldSoft, color: c.gold }} className="w-8 h-8 rounded-full flex items-center justify-center"><Shuffle size={14} /></button>
      </div>
      <div style={{ background: c.bg3, height: 4 }} className="rounded-full mb-5 overflow-hidden">
        <div style={{ background: `linear-gradient(90deg, ${c.gold}, ${c.rose})`, width: `${((idx + 1) / questions.length) * 100}%`, height: '100%' }} />
      </div>
      <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{question.question}</div>
      </div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => goto(idx - 1)} style={{ color: c.gold }} className="flex items-center gap-1 text-sm"><ChevronRight size={16} /> السابق</button>
        <button onClick={() => goto(idx + 1)} style={{ color: c.gold }} className="flex items-center gap-1 text-sm">التالي <ChevronLeft size={16} /></button>
      </div>

      {!myAnswer && (
        <div className="mb-4">
          <label style={{ color: c.textDim }} className="text-xs mb-1 block">جوابك يا {me.display_name}</label>
          <textarea value={mine} onChange={(e) => setMine(e.target.value)} placeholder="جاوب بالحسانية…"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-3 text-sm outline-none mb-3" rows={3} />
          <button onClick={submit} disabled={!mine.trim()} style={{ background: c.gold, color: c.bg, opacity: !mine.trim() ? 0.6 : 1 }}
            className="w-full rounded-full py-3 font-bold text-sm">أرسل جوابي</button>
        </div>
      )}

      {myAnswer && !partnerAnswer && (
        <div style={{ background: c.goldSoft, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 text-center">
          <div style={{ color: c.text }} className="text-sm">جوابك محفوظ ✓ — بانتظار جواب {partner?.display_name || 'شريكك'}…</div>
        </div>
      )}

      {myAnswer && partnerAnswer && (
        <div className="grid gap-3 mb-4">
          <div style={{ background: c.goldSoft, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
            <div style={{ color: c.gold }} className="text-xs font-bold mb-1">{me.display_name}</div>
            <div style={{ color: c.text }} className="text-sm">{myAnswer.answer_text}</div>
          </div>
          <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
            <div style={{ color: c.rose }} className="text-xs font-bold mb-1">{partner.display_name}</div>
            <div style={{ color: c.text }} className="text-sm">{partnerAnswer.answer_text}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* گيفان — shared progress row per couple, realtime */
function GiffanTab({ c, coupleId, me, partner }) {
  const [progress, setProgress] = useState(null);
  const [picked, setPicked] = useState(null);

  const ensureProgress = useCallback(async () => {
    const { data } = await supabase.from('giffan_progress').select('*').eq('couple_id', coupleId).maybeSingle();
    if (data) { setProgress(data); return; }
    const order = GIFFAN_WORDS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const { data: created } = await supabase.from('giffan_progress')
      .insert({ couple_id: coupleId, word_order: order, current_index: 0, score_by_user: {}, finished: false })
      .select().single();
    setProgress(created);
  }, [coupleId]);

  useEffect(() => { ensureProgress(); }, [ensureProgress]);

  useEffect(() => {
    const ch = supabase.channel(`giffan-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giffan_progress', filter: `couple_id=eq.${coupleId}` },
        (payload) => { if (payload.new) setProgress(payload.new); setPicked(null); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  if (!progress) return null;
  const order = progress.word_order;
  const pos = progress.current_index;
  const finished = progress.finished || pos >= order.length;
  const item = !finished ? GIFFAN_WORDS[order[pos]] : null;
  const scores = progress.score_by_user || {};

  const choose = async (opt) => {
    if (picked || !item) return;
    setPicked(opt);
    const isRight = opt === item.correct;
    const newScores = { ...scores, [me.id]: (scores[me.id] || 0) + (isRight ? 1 : 0) };
    await supabase.from('giffan_progress').update({ score_by_user: newScores }).eq('couple_id', coupleId);
  };
  const next = async () => {
    const newPos = pos + 1;
    await supabase.from('giffan_progress').update({ current_index: newPos, finished: newPos >= order.length }).eq('couple_id', coupleId);
  };
  const restart = async () => {
    const newOrder = GIFFAN_WORDS.map((_, i) => i).sort(() => Math.random() - 0.5);
    await supabase.from('giffan_progress').update({ word_order: newOrder, current_index: 0, score_by_user: {}, finished: false }).eq('couple_id', coupleId);
  };

  return (
    <div>
      <div style={{ color: c.textDim }} className="text-xs mb-4">خمّن معنى الكلمة الحسانية — نتيجة مشتركة ❤️</div>
      {!finished ? (
        <>
          <div style={{ color: c.gold }} className="text-xs mb-2">
            سؤال {pos + 1} من {order.length} — {me.display_name}: {scores[me.id] || 0}{partner ? ` · ${partner.display_name}: ${scores[partner.id] || 0}` : ''}
          </div>
          <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
            <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-2xl">{item.word}</div>
          </div>
          <div className="grid gap-2 mb-4">
            {item.options.map((opt, i) => {
              const isCorrect = opt === item.correct;
              const show = picked !== null;
              return (
                <button key={i} onClick={() => choose(opt)} style={{
                  background: show ? (isCorrect ? 'rgba(120,200,140,0.18)' : (opt === picked ? 'rgba(220,100,100,0.18)' : c.bg2)) : c.bg2,
                  border: `1px solid ${show && isCorrect ? '#7BC08C' : c.border}`, color: c.text,
                }} className="rounded-xl p-3 text-sm text-start">{opt}</button>
              );
            })}
          </div>
          {picked && <button onClick={next} style={{ background: c.gold, color: c.bg }} className="w-full rounded-full py-3 font-bold text-sm">التالي</button>}
        </>
      ) : (
        <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-3xl p-6 text-center">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl mb-2">خلصتوا اللعبة! 🎉</div>
          <div style={{ color: c.text }} className="text-sm mb-4">
            {me.display_name}: {scores[me.id] || 0}{partner ? ` · ${partner.display_name}: ${scores[partner.id] || 0}` : ''} — من {order.length}
          </div>
          <button onClick={restart} style={{ background: c.gold, color: c.bg }} className="rounded-full px-6 py-2.5 text-sm font-bold">إعادة اللعب</button>
        </div>
      )}

      <div style={{ color: c.gold }} className="text-xs font-bold mt-6 mb-2">أمثال حسانية 📜</div>
      <div className="grid gap-2">
        {HASSANIYA_PROVERBS.map((p, i) => (
          <div key={i} style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
            <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-base mb-1">« {p.text} »</div>
            <div style={{ color: c.textDim }} className="text-xs">{p.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoriesTab({ c, coupleId, me, partner }) {
  const [stories] = useCoupleTable('stories', coupleId);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const add = async () => {
    if (!title.trim() || !text.trim()) return;
    await supabase.from('stories').insert({ couple_id: coupleId, added_by: me.id, title, text });
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'story', body: `${me.display_name} أضاف قصة جديدة` });
    setTitle(''); setText(''); setShowAdd(false);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div style={{ color: c.textDim }} className="text-xs">قصص زوين بلحسانية ❤️ (مشتركة)</div>
        <button onClick={() => setShowAdd(true)} style={{ background: c.goldSoft, color: c.gold }} className="w-8 h-8 rounded-full flex items-center justify-center"><Plus size={15} /></button>
      </div>
      {showAdd && (
        <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-2xl p-4 mb-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان القصة"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-2" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب القصة بلحسانية…"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-2 text-sm outline-none mb-3" rows={3} />
          <div className="flex gap-2">
            <button onClick={add} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-full py-2 text-sm font-bold">حفظ</button>
            <button onClick={() => setShowAdd(false)} style={{ color: c.textDim, border: `1px solid ${c.border}` }} className="flex-1 rounded-full py-2 text-sm">إلغاء</button>
          </div>
        </div>
      )}
      <div className="grid gap-3">
        {stories.map((s) => (
          <div key={s.id} style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4">
            <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-lg mb-1">{s.title}</div>
            <div style={{ color: c.text }} className="text-sm leading-relaxed">{s.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MajlisScreen({ c, coupleId, me, partner }) {
  const [sub, setSub] = useState('questions');
  const TABS = [{ key: 'questions', label: 'أسئلة' }, { key: 'giffan', label: 'گيفان' }, { key: 'stories', label: 'قصص' }];
  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl mb-1">مجلسنَ 🙈❤️</div>
      <div style={{ color: c.textDim }} className="text-xs mb-4">تقربكم من بعض اكثر ❤️</div>
      <div style={{ background: c.bg3, border: `1px solid ${c.border}` }} className="flex rounded-full p-1 mb-5">
        {TABS.map((tt) => (
          <button key={tt.key} onClick={() => setSub(tt.key)} style={{
            background: sub === tt.key ? c.gold : 'transparent', color: sub === tt.key ? c.bg : c.textDim,
          }} className="flex-1 rounded-full py-2 text-xs font-bold">{tt.label}</button>
        ))}
      </div>
      {sub === 'questions' && <QuestionsTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'giffan' && <GiffanTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'stories' && <StoriesTab c={c} coupleId={coupleId} me={me} partner={partner} />}
    </div>
  );
}

function HomeWithPhrases({ c, t, me, partner, couple, onQuickAction, onOpenChat, toasts }) {
  const [phrases] = useCoupleTable('phrases', couple.id);
  return <HomeScreen c={c} t={t} me={me} partner={partner} couple={couple} phrases={phrases} onQuickAction={onQuickAction} onOpenChat={onOpenChat} toasts={toasts} />;
}

/* ===========================================================
   8) APP SHELL — session, couple resolution, presence, notifications
=========================================================== */
export default function MesahaApp() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [me, setMe] = useState(null);
  const [couple, setCouple] = useState(null);
  const [partner, setPartner] = useState(null);
  const [tab, setTab] = useState('home');
  const [toasts, setToasts] = useState([]);

  const dark = me?.dark_mode ?? true;
  const lang = me?.lang ?? 'ar';
  const c = dark ? PALETTE.dark : PALETTE.light;
  const t = I18N[lang];

  // --- session bootstrap ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setMe(data);
  }, []);

  const loadCouple = useCallback(async (userId) => {
    const { data: membership } = await supabase.from('couple_members').select('couple_id').eq('user_id', userId).maybeSingle();
    if (!membership) { setCouple(null); setPartner(null); return; }
    const { data: coupleRow } = await supabase.from('couples').select('*').eq('id', membership.couple_id).single();
    setCouple(coupleRow);
    const { data: members } = await supabase.from('couple_members').select('user_id').eq('couple_id', membership.couple_id);
    const partnerId = members?.find((m) => m.user_id !== userId)?.user_id;
    if (partnerId) {
      const { data: pProfile } = await supabase.from('profiles').select('*').eq('id', partnerId).single();
      setPartner(pProfile);
    } else {
      setPartner(null);
    }
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setMe(null); setCouple(null); setPartner(null); return; }
    loadMe(session.user.id);
    loadCouple(session.user.id);
  }, [session, loadMe, loadCouple]);

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
    { key: 'memories', label: t.memories, icon: BookOpen },
    { key: 'occasions', label: t.occasions, icon: CalendarIcon },
    { key: 'settings', label: t.settings, icon: SettingsIcon },
  ];

  let body;
  if (session === undefined || (session && !me)) {
    body = <div style={{ background: c.bg, color: c.textDim }} className="h-full w-full flex items-center justify-center text-sm">...جاري التحميل</div>;
  } else if (!session) {
    body = <AuthScreen c={c} />;
  } else if (!couple) {
    body = <CoupleSetupScreen c={c} userId={session.user.id} onLinked={() => loadCouple(session.user.id)} />;
  } else {
    body = (
      <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0">
          {tab === 'home' && <HomeWithPhrases c={c} t={t} me={me} partner={partner} couple={couple} onQuickAction={quickAction} onOpenChat={() => setTab('chat')} toasts={toasts} />}
          {tab === 'chat' && <ChatScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'majlis' && <MajlisScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'memories' && <MemoriesScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'occasions' && <OccasionsScreen c={c} coupleId={couple.id} me={me} partner={partner} />}
          {tab === 'settings' && <SettingsScreen c={c} dark={dark} setDark={setDark} lang={lang} setLang={setLang} me={me} coupleId={couple.id} partner={partner} />}
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
