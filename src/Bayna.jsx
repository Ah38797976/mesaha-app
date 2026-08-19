import React, { useState, useEffect, useCallback } from 'react';
import { Lock, ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase, notifyPartner } from './lib/supabaseClient';

/* This file is fully additive: it reuses the existing `bayna_content` /
   `bayna_*` Supabase tables (see supabase/bayna_migration.sql) and the
   existing `notifyPartner` helper. It doesn't import from App.jsx and
   App.jsx doesn't need any changes beyond wiring these three exports in:
   <BaynaScreen />, <BaynaHomeCard />, <AdminBaynaScreen /> */

const FONT_DISPLAY = "'Aref Ruqaa', serif";

/* ---------------------------------------------------------
   shared bits
--------------------------------------------------------- */
function EmptyState({ c, text }) {
  return <div style={{ color: c.textDim }} className="text-sm text-center py-10">{text}</div>;
}

function useBaynaContent(type, subtype, level) {
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    let q = supabase.from('bayna_content').select('*').eq('active', true).eq('type', type);
    if (subtype) q = q.eq('subtype', subtype);
    if (level) q = q.eq('level', level);
    const { data } = await q.order('created_at');
    setItems(data || []);
  }, [type, subtype, level]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`bayna-content-${type}-${subtype || 'x'}-${level || 'x'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bayna_content' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load, type, subtype, level]);
  return items;
}

// couple-wide points / streak, mirrors giffan_progress's score_by_user pattern
async function awardPoints(coupleId, userId, amount) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase.from('bayna_stats').select('*').eq('couple_id', coupleId).maybeSingle();
  if (!existing) {
    await supabase.from('bayna_stats').insert({
      couple_id: coupleId, points_by_user: { [userId]: amount }, last_played_date: today, streak_days: 1,
    });
    return;
  }
  const points = { ...(existing.points_by_user || {}) };
  points[userId] = (points[userId] || 0) + amount;
  let streak = existing.streak_days || 0;
  if (existing.last_played_date !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = existing.last_played_date === yesterday ? streak + 1 : 1;
  }
  await supabase.from('bayna_stats').update({
    points_by_user: points, last_played_date: today, streak_days: streak, updated_at: new Date().toISOString(),
  }).eq('couple_id', coupleId);
}

/* ---------------------------------------------------------
   1) مين يعرف الثاني أكثر؟
--------------------------------------------------------- */
function KnowBetterTab({ c, coupleId, me, partner }) {
  const questions = useBaynaContent('question', 'know_better', null);
  const [idx, setIdx] = useState(0);
  const [round, setRound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const question = questions[idx];

  const loadRound = useCallback(async () => {
    if (!question) { setRound(null); return; }
    const { data } = await supabase.from('bayna_know_rounds').select('*')
      .eq('couple_id', coupleId).eq('question_id', question.id).maybeSingle();
    setRound(data || null);
    setDraft('');
  }, [coupleId, question]);

  useEffect(() => { loadRound(); }, [loadRound]);

  useEffect(() => {
    const ch = supabase.channel(`bayna-know-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bayna_know_rounds', filter: `couple_id=eq.${coupleId}` },
        () => loadRound())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, loadRound]);

  if (!question) return <EmptyState c={c} text="ماكاين أسئلة حالياً — أضف أسئلة من لوحة الإدارة." />;

  const submitAnswer = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('bayna_know_rounds').insert({
        couple_id: coupleId, question_id: question.id, answerer_id: me.id, answer_text: draft.trim(),
      });
      if (!error && partner) {
        notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'bayna_know', body: '❤️ شريكك جاوب على سؤال جديد، دورك الآن!' });
      }
      await loadRound();
    } finally { setBusy(false); setDraft(''); }
  };

  const submitGuess = async () => {
    if (!draft.trim() || busy || !round) return;
    setBusy(true);
    try {
      await supabase.from('bayna_know_rounds').update({ guesser_id: me.id, guess_text: draft.trim() }).eq('id', round.id);
      await loadRound();
    } finally { setBusy(false); setDraft(''); }
  };

  const judge = async (correct) => {
    if (!round) return;
    await supabase.from('bayna_know_rounds').update({ is_correct: correct }).eq('id', round.id);
    if (correct && round.guesser_id) await awardPoints(coupleId, round.guesser_id, 10);
    await loadRound();
  };

  const next = () => setIdx((i) => (i + 1) % questions.length);
  const iAmAnswerer = round && round.answerer_id === me.id;

  return (
    <div>
      <div style={{ color: c.textDim }} className="text-xs mb-3">سؤال {idx + 1} من {questions.length}</div>
      <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{question.text}</div>
      </div>

      {!round && (
        <div className="grid gap-3">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب إجابتك أنت أولًا…"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="w-full rounded-xl p-3 text-sm outline-none" rows={2} />
          <button onClick={submitAnswer} disabled={!draft.trim() || busy}
            style={{ background: c.gold, color: c.bg, opacity: !draft.trim() ? 0.6 : 1 }}
            className="rounded-full py-3 font-bold text-sm">أرسل إجابتي</button>
        </div>
      )}

      {round && iAmAnswerer && !round.guesser_id && (
        <div style={{ background: c.goldSoft, color: c.text }} className="rounded-2xl p-4 text-center text-sm">
          إجابتك محفوظة ✓ — بانتظار تخمين {partner?.display_name || 'شريكك'}…
        </div>
      )}

      {round && !iAmAnswerer && !round.guesser_id && (
        <div className="grid gap-3">
          <div style={{ color: c.textDim }} className="text-xs">خمّن جواب {partner?.display_name || 'شريكك'}</div>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب تخمينك…"
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="w-full rounded-xl p-3 text-sm outline-none" rows={2} />
          <button onClick={submitGuess} disabled={!draft.trim() || busy}
            style={{ background: c.gold, color: c.bg, opacity: !draft.trim() ? 0.6 : 1 }}
            className="rounded-full py-3 font-bold text-sm">أرسل تخميني</button>
        </div>
      )}

      {round && round.guess_text && round.is_correct === null && iAmAnswerer && (
        <div className="grid gap-3">
          <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
            <div style={{ color: c.gold }} className="text-xs font-bold mb-1">إجابتك الحقيقية</div>
            <div style={{ color: c.text }} className="text-sm">{round.answer_text}</div>
          </div>
          <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
            <div style={{ color: c.rose }} className="text-xs font-bold mb-1">تخمين {partner?.display_name}</div>
            <div style={{ color: c.text }} className="text-sm">{round.guess_text}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => judge(true)} style={{ background: '#7BC08C', color: '#0d1f12' }} className="flex-1 rounded-full py-2.5 text-sm font-bold">صحيح ✅</button>
            <button onClick={() => judge(false)} style={{ background: c.rose, color: c.bg }} className="flex-1 rounded-full py-2.5 text-sm font-bold">خطأ ❌</button>
          </div>
        </div>
      )}

      {round && round.guess_text && round.is_correct === null && !iAmAnswerer && (
        <div style={{ background: c.goldSoft, color: c.text }} className="rounded-2xl p-4 text-center text-sm">تخمينك محفوظ ✓ — بانتظار تأكيد {partner?.display_name}…</div>
      )}

      {round && round.is_correct !== null && (
        <div className="grid gap-3">
          <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
            <div style={{ color: c.gold }} className="text-xs font-bold mb-1">الإجابة الحقيقية</div>
            <div style={{ color: c.text }} className="text-sm">{round.answer_text}</div>
          </div>
          <div style={{
            background: round.is_correct ? 'rgba(120,200,140,0.18)' : 'rgba(220,100,100,0.18)',
            border: `1px solid ${c.border}`, color: c.text,
          }} className="rounded-2xl p-3 text-center text-sm">
            {round.is_correct ? 'تخمين صحيح! +10 نقاط 🎉' : 'ما كانش صحيح 😅'}
          </div>
          <button onClick={next} style={{ background: c.gold, color: c.bg }} className="rounded-full py-3 font-bold text-sm">السؤال التالي</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   2) من الأكثر؟
--------------------------------------------------------- */
function WhoMoreTab({ c, coupleId, me, partner }) {
  const questions = useBaynaContent('question', 'who_more', null);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState([]);
  const [awarded, setAwarded] = useState(false);
  const question = questions[idx];

  const load = useCallback(async () => {
    if (!question) { setRows([]); return; }
    const { data } = await supabase.from('bayna_who_more_answers').select('*').eq('couple_id', coupleId).eq('question_id', question.id);
    setRows(data || []);
  }, [coupleId, question]);

  useEffect(() => { load(); setAwarded(false); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`bayna-whomore-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bayna_who_more_answers', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, load]);

  if (!question) return <EmptyState c={c} text="ماكاين أسئلة حالياً." />;

  const mine = rows.find((r) => r.user_id === me.id);
  const theirs = partner && rows.find((r) => r.user_id === partner.id);
  const bothAnswered = !!(mine && theirs);
  const matched = bothAnswered && mine.choice_user_id === theirs.choice_user_id;

  useEffect(() => {
    if (bothAnswered && matched && !awarded) {
      setAwarded(true);
      awardPoints(coupleId, me.id, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothAnswered, matched]);

  const choose = async (choiceId) => {
    if (!choiceId) return;
    await supabase.from('bayna_who_more_answers').upsert(
      { couple_id: coupleId, question_id: question.id, user_id: me.id, choice_user_id: choiceId },
      { onConflict: 'couple_id,question_id,user_id' },
    );
    load();
  };

  const next = () => setIdx((i) => (i + 1) % questions.length);

  return (
    <div>
      <div style={{ color: c.textDim }} className="text-xs mb-3">سؤال {idx + 1} من {questions.length}</div>
      <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{question.text}</div>
      </div>

      {!mine && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button onClick={() => choose(me.id)} style={{ background: c.bg2, border: `1px solid ${c.border}`, color: c.text }} className="rounded-2xl py-4 text-sm font-bold">{me.display_name}</button>
          <button onClick={() => choose(partner?.id)} disabled={!partner} style={{ background: c.bg2, border: `1px solid ${c.border}`, color: c.text }} className="rounded-2xl py-4 text-sm font-bold">{partner?.display_name || '...'}</button>
        </div>
      )}

      {mine && !theirs && (
        <div style={{ background: c.goldSoft, color: c.text }} className="rounded-2xl p-4 text-center text-sm">اخترت — بانتظار {partner?.display_name || 'شريكك'}…</div>
      )}

      {bothAnswered && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3 text-center">
              <div style={{ color: c.gold }} className="text-xs font-bold mb-1">{me.display_name}</div>
              <div style={{ color: c.text }} className="text-sm">{mine.choice_user_id === me.id ? me.display_name : partner?.display_name}</div>
            </div>
            <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3 text-center">
              <div style={{ color: c.rose }} className="text-xs font-bold mb-1">{partner?.display_name}</div>
              <div style={{ color: c.text }} className="text-sm">{theirs.choice_user_id === me.id ? me.display_name : partner?.display_name}</div>
            </div>
          </div>
          {matched && <div style={{ background: 'rgba(120,200,140,0.18)', color: c.text }} className="rounded-2xl p-3 text-center text-sm font-bold">واضح أنكم متفاهمين ❤️</div>}
          <button onClick={next} style={{ background: c.gold, color: c.bg }} className="rounded-full py-3 font-bold text-sm">السؤال التالي</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   3) صراحة بيننا
--------------------------------------------------------- */
const LEVELS = [
  { key: 'light', label: '❤️ خفيف' },
  { key: 'romantic', label: '💕 رومانسي' },
  { key: 'emotional', label: '💗 عاطفي' },
  { key: 'intimate', label: '🔥 حميمي' },
];

function SincerityTab({ c, coupleId, me, partner }) {
  const [level, setLevel] = useState('light');
  const questions = useBaynaContent('question', 'sincerity', level);
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState('');
  const question = questions[idx];

  useEffect(() => { setIdx(0); }, [level]);

  const load = useCallback(async () => {
    if (!question) { setRows([]); return; }
    const { data } = await supabase.from('bayna_sincerity_answers').select('*').eq('couple_id', coupleId).eq('question_id', question.id);
    setRows(data || []); setDraft('');
  }, [coupleId, question]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`bayna-sincerity-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bayna_sincerity_answers', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, load]);

  const mine = rows.find((r) => r.user_id === me.id);
  const theirs = partner && rows.find((r) => r.user_id === partner.id);

  const submit = async () => {
    if (!draft.trim() || !question) return;
    await supabase.from('bayna_sincerity_answers').upsert(
      { couple_id: coupleId, question_id: question.id, user_id: me.id, answer_text: draft.trim() },
      { onConflict: 'couple_id,question_id,user_id' },
    );
    load();
  };

  const next = () => setIdx((i) => (questions.length ? (i + 1) % questions.length : 0));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {LEVELS.map((l) => (
          <button key={l.key} onClick={() => setLevel(l.key)} style={{
            background: level === l.key ? c.gold : 'transparent', color: level === l.key ? c.bg : c.text, border: `1px solid ${c.gold}`,
          }} className="rounded-full px-3 py-1.5 text-xs">{l.label}</button>
        ))}
      </div>

      {!question ? <EmptyState c={c} text="ماكاين أسئلة فهاذ المستوى بعد." /> : (
        <>
          <div style={{ color: c.textDim }} className="text-xs mb-3">سؤال {idx + 1} من {questions.length}</div>
          <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
            <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{question.text}</div>
          </div>

          {!mine && (
            <div className="grid gap-3">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="جاوب بصراحة…"
                style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-3 text-sm outline-none" rows={3} />
              <button onClick={submit} disabled={!draft.trim()} style={{ background: c.gold, color: c.bg, opacity: !draft.trim() ? 0.6 : 1 }} className="rounded-full py-3 font-bold text-sm">أرسل جوابي</button>
            </div>
          )}

          {mine && !theirs && (
            <div style={{ background: c.goldSoft, color: c.text }} className="rounded-2xl p-4 text-center text-sm">جوابك محفوظ ✓ — بانتظار {partner?.display_name || 'شريكك'}…</div>
          )}

          {mine && theirs && (
            <div className="grid gap-3">
              <div style={{ background: c.goldSoft, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
                <div style={{ color: c.gold }} className="text-xs font-bold mb-1">{me.display_name}</div>
                <div style={{ color: c.text }} className="text-sm">{mine.answer_text}</div>
              </div>
              <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
                <div style={{ color: c.rose }} className="text-xs font-bold mb-1">{partner.display_name}</div>
                <div style={{ color: c.text }} className="text-sm">{theirs.answer_text}</div>
              </div>
              <button onClick={next} style={{ background: c.gold, color: c.bg }} className="rounded-full py-3 font-bold text-sm">السؤال التالي</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   4) عجلة الحب
--------------------------------------------------------- */
const WHEEL_CATEGORIES = [
  { key: 'love', label: '❤️ سؤال حب' },
  { key: 'message', label: '💌 رسالة' },
  { key: 'funny', label: '😂 سؤال مضحك' },
  { key: 'challenge', label: '🎯 تحدي' },
  { key: 'memory', label: '📸 ذكرى' },
  { key: 'emotional', label: '💕 سؤال عاطفي' },
  { key: 'surprise', label: '🎁 مفاجأة' },
];
const WHEEL_FALLBACK = {
  funny: ['قلد ضحكة شريكك 😂', 'احكِ أطرف موقف صار بينكما', 'من أكثر واحد يضحك بسرعة بينكما؟'],
  memory: ['اذكروا أول مرة تكلمتوا فيها', 'شاركوا صورة تمثل أجمل ذكرى', 'شنو أول انطباع كان عندك؟'],
  surprise: ['أرسل صوتية بدل الكتابة الحين 🎙️', 'اختر له/لها لقب جديد اليوم', 'اكتب دعاء صغير لشريكك'],
};

function WheelTab({ c, coupleId, me }) {
  const loveQs = useBaynaContent('question', 'sincerity', 'romantic');
  const emotionalQs = useBaynaContent('question', 'sincerity', 'emotional');
  const messages = useBaynaContent('message', 'wheel', null);
  const challenges = useBaynaContent('challenge', 'daily_challenge', null);
  const pool = { love: loveQs, message: messages, challenge: challenges, emotional: emotionalQs };

  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const extra = 1440 + Math.floor(Math.random() * 1440);
    setRotation((r) => r + extra);
    setTimeout(() => {
      try {
        const cat = WHEEL_CATEGORIES[Math.floor(Math.random() * WHEEL_CATEGORIES.length)];
        let text = 'دورو العجلة مرة ثانية 🎡';
        let contentId = null;
        const dbPool = pool[cat.key];
        if (dbPool && dbPool.length) {
          const item = dbPool[Math.floor(Math.random() * dbPool.length)];
          if (item?.text) { text = item.text; contentId = item.id; }
        } else if (WHEEL_FALLBACK[cat.key]) {
          const arr = WHEEL_FALLBACK[cat.key];
          text = arr[Math.floor(Math.random() * arr.length)];
        }
        setResult({ cat, text });
        supabase.from('bayna_wheel_spins').insert({ couple_id: coupleId, user_id: me.id, category: cat.key, content_id: contentId }).then(() => {});
      } finally {
        // Always clear "spinning", even if something above throws (e.g. a
        // malformed content row) — otherwise the button gets stuck forever
        // on "...جاري الدوران" instead of returning to "دور العجلة 🎡".
        setSpinning(false);
      }
    }, 2600);
  };

  return (
    <div className="flex flex-col items-center">
      <div style={{
        width: 220, height: 220, borderRadius: '9999px',
        background: `conic-gradient(${c.gold}, ${c.rose}, ${c.gold}, ${c.rose}, ${c.gold}, ${c.rose}, ${c.gold})`,
        border: `4px solid ${c.gold}`, transform: `rotate(${rotation}deg)`,
        transition: 'transform 2.6s cubic-bezier(0.17, 0.67, 0.16, 0.99)',
      }} className="mb-6 relative flex items-center justify-center">
        <div style={{ background: c.bg, color: c.gold }} className="w-14 h-14 rounded-full flex items-center justify-center text-xl">🎡</div>
      </div>
      <button onClick={spin} disabled={spinning} style={{ background: c.gold, color: c.bg, opacity: spinning ? 0.7 : 1 }}
        className="rounded-full px-8 py-3 font-bold text-sm mb-5">{spinning ? '...جاري الدوران' : 'دور العجلة 🎡'}</button>

      {result && (
        <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-5 text-center w-full">
          <div style={{ color: c.gold }} className="text-xs font-bold mb-2">{result.cat.label}</div>
          <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-lg leading-relaxed">{result.text}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   5) تحدي اليوم
--------------------------------------------------------- */
function ChallengeTab({ c, coupleId, me, partner }) {
  const challenges = useBaynaContent('challenge', 'daily_challenge', null);
  const [completions, setCompletions] = useState([]);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const challenge = challenges.length ? challenges[Math.floor(Date.now() / 86400000) % challenges.length] : null;

  const load = useCallback(async () => {
    if (!challenge) { setCompletions([]); return; }
    const { data } = await supabase.from('bayna_challenge_completions').select('*')
      .eq('couple_id', coupleId).eq('challenge_id', challenge.id).eq('completed_date', today);
    setCompletions(data || []);
  }, [coupleId, challenge, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`bayna-challenge-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bayna_challenge_completions', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, load]);

  if (!challenge) return <EmptyState c={c} text="ماكاين تحديات حالياً." />;

  const myDone = completions.some((r) => r.user_id === me.id);
  const partnerDone = partner && completions.some((r) => r.user_id === partner.id);

  const complete = async () => {
    if (myDone || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('bayna_challenge_completions').insert({
        couple_id: coupleId, challenge_id: challenge.id, user_id: me.id,
      });
      if (!error) {
        await awardPoints(coupleId, me.id, 5);
        if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'bayna_challenge', body: '🔥 شريكك أكمل تحدي اليوم، هل أنت مستعد؟' });
        await load();
      }
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-5 text-center">
        <div style={{ color: c.gold }} className="text-xs mb-2">تحدي اليوم 🔥</div>
        <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{challenge.text}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3 text-center">
          <div style={{ color: c.textDim }} className="text-xs mb-1">{me.display_name}</div>
          <div style={{ color: myDone ? '#7BC08C' : c.textDim }} className="text-sm font-bold">{myDone ? 'أكملت ✓' : 'لم يكتمل بعد'}</div>
        </div>
        <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3 text-center">
          <div style={{ color: c.textDim }} className="text-xs mb-1">{partner?.display_name || '...'}</div>
          <div style={{ color: partnerDone ? '#7BC08C' : c.textDim }} className="text-sm font-bold">{partnerDone ? 'أكمل ✓' : 'لم يكتمل بعد'}</div>
        </div>
      </div>
      <button onClick={complete} disabled={myDone || busy} style={{ background: c.gold, color: c.bg, opacity: myDone ? 0.6 : 1 }}
        className="w-full rounded-full py-3 font-bold text-sm">{myDone ? 'أكملت التحدي ✅' : 'أكملت التحدي — سجّل ✅'}</button>
    </div>
  );
}

/* ---------------------------------------------------------
   6) نسبة التوافق
--------------------------------------------------------- */
const COMPAT_LEVELS = [
  { max: 49, label: '🌱 بداية الحكاية' },
  { max: 149, label: '❤️ متفاهمين' },
  { max: 299, label: '💕 قريبين' },
  { max: 499, label: '💗 نعرف بعض' },
  { max: Infinity, label: '💞 توأم الروح' },
];

function StatsTab({ c, coupleId, me, partner }) {
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('bayna_stats').select('*').eq('couple_id', coupleId).maybeSingle();
    setStats(data || { points_by_user: {}, streak_days: 0 });
  }, [coupleId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`bayna-stats-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bayna_stats', filter: `couple_id=eq.${coupleId}` },
        (payload) => setStats(payload.new))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  if (!stats) return null;
  const points = stats.points_by_user || {};
  const myPts = points[me.id] || 0;
  const theirPts = partner ? (points[partner.id] || 0) : 0;
  const total = myPts + theirPts;
  const pct = Math.min(100, Math.round((total / 500) * 100));
  const level = (COMPAT_LEVELS.find((l) => total <= l.max) || COMPAT_LEVELS[COMPAT_LEVELS.length - 1]).label;

  return (
    <div>
      <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-5 text-center">
        <div style={{ color: c.gold }} className="text-xs mb-2">توافقكم اليوم</div>
        <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-3xl mb-1">{pct}% ❤️</div>
        <div style={{ color: c.textDim }} className="text-sm">{level}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 text-center">
          <div style={{ color: c.gold }} className="text-xs mb-1">{me.display_name}</div>
          <div style={{ color: c.text, fontFamily: FONT_DISPLAY }} className="text-2xl">{myPts}</div>
        </div>
        <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 text-center">
          <div style={{ color: c.rose }} className="text-xs mb-1">{partner?.display_name || '...'}</div>
          <div style={{ color: c.text, fontFamily: FONT_DISPLAY }} className="text-2xl">{theirPts}</div>
        </div>
      </div>

      {stats.streak_days > 0 && (
        <div style={{ color: c.textDim }} className="text-xs text-center mb-2">🔥 لعبتوا {stats.streak_days} يوم متتالي</div>
      )}
      <div style={{ color: c.textDim }} className="text-[11px] text-center leading-relaxed">
        النسبة نتيجة ترفيهية داخل اللعبة، مش قياس علمي حقيقي 🙂
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   7) 🇲🇷 حسانية
--------------------------------------------------------- */
function HassaniyaTab({ c }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    supabase.from('bayna_content').select('*').eq('active', true).eq('lang', 'hassaniya').order('type').then(({ data }) => setItems(data || []));
  }, []);
  const groups = {
    question: items.filter((i) => i.type === 'question'),
    challenge: items.filter((i) => i.type === 'challenge'),
    message: items.filter((i) => i.type === 'message'),
    story: items.filter((i) => i.type === 'story'),
  };
  const LABELS = { question: 'أسئلة حسانية', challenge: 'تحديات', message: 'رسائل', story: 'قصص قصيرة' };
  const nonEmpty = Object.entries(groups).filter(([, arr]) => arr.length > 0);

  return (
    <div>
      <div style={{ color: c.textDim }} className="text-xs mb-4">🇲🇷 محتوى بلهجة حسانية طبيعية</div>
      {nonEmpty.map(([key, arr]) => (
        <div key={key} className="mb-5">
          <div style={{ color: c.gold }} className="text-xs font-bold mb-2">{LABELS[key]}</div>
          <div className="grid gap-2">
            {arr.map((it) => (
              <div key={it.id} style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
                <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-base leading-relaxed">{it.text}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {nonEmpty.length === 0 && <EmptyState c={c} text="ماكاين محتوى حسانية بعد — أضفه من لوحة الإدارة." />}
    </div>
  );
}

/* ===========================================================
   MAIN SCREEN — «بيناتنا ❤️»
=========================================================== */
const BAYNA_TABS = [
  { key: 'know', label: 'مين يعرفني' },
  { key: 'whomore', label: 'من الأكثر' },
  { key: 'sincerity', label: 'صراحة' },
  { key: 'wheel', label: 'عجلة الحب' },
  { key: 'challenge', label: 'تحدي اليوم' },
  { key: 'stats', label: 'توافقنا' },
  { key: 'hassaniya', label: 'حسانية 🇲🇷' },
];

export function BaynaScreen({ c, coupleId, me, partner }) {
  const [sub, setSub] = useState('know');
  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="flex items-center justify-between mb-1">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl">بيناتنا ❤️</div>
        <div style={{ color: c.textDim }} className="text-[10px] flex items-center gap-1"><Lock size={11} /> خاص بيناتنا</div>
      </div>
      <div style={{ color: c.textDim }} className="text-xs mb-4">ألعاب تقربكم من بعض، ما تظهر لحد غيركم 🔒</div>

      <div style={{ background: c.bg3, border: `1px solid ${c.border}` }} className="flex flex-wrap gap-1 rounded-2xl p-1 mb-5">
        {BAYNA_TABS.map((tt) => (
          <button key={tt.key} onClick={() => setSub(tt.key)} style={{
            background: sub === tt.key ? c.gold : 'transparent', color: sub === tt.key ? c.bg : c.textDim,
          }} className="rounded-xl px-3 py-2 text-[11px] font-bold">{tt.label}</button>
        ))}
      </div>

      {sub === 'know' && <KnowBetterTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'whomore' && <WhoMoreTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'sincerity' && <SincerityTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'wheel' && <WheelTab c={c} coupleId={coupleId} me={me} />}
      {sub === 'challenge' && <ChallengeTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'stats' && <StatsTab c={c} coupleId={coupleId} me={me} partner={partner} />}
      {sub === 'hassaniya' && <HassaniyaTab c={c} />}
    </div>
  );
}

/* Home screen entry card */
export function BaynaHomeCard({ c, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      background: `linear-gradient(135deg, ${c.goldSoft}, rgba(201,123,146,0.14))`,
      border: `1px solid ${c.gold}`, color: c.text,
    }} className="w-full rounded-2xl p-4 flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div style={{ background: c.gold, color: c.bg }} className="w-11 h-11 rounded-full flex items-center justify-center text-lg">🎮</div>
        <div className="text-start">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-base">بيناتنا ❤️</div>
          <div style={{ color: c.textDim }} className="text-xs">ألعاب وأسئلة تقربكم أكثر</div>
        </div>
      </div>
      <ChevronLeft size={18} style={{ color: c.gold }} />
    </button>
  );
}

/* ===========================================================
   ADMIN — «🎮 إدارة بيناتنا»
=========================================================== */
const CONTENT_TYPES = [
  { key: 'question', label: 'سؤال' },
  { key: 'challenge', label: 'تحدي' },
  { key: 'message', label: 'رسالة' },
  { key: 'story', label: 'قصة' },
];
const SUBTYPES_BY_TYPE = {
  question: [
    { key: '', label: '—' },
    { key: 'know_better', label: 'مين يعرف الثاني أكثر' },
    { key: 'who_more', label: 'من الأكثر' },
    { key: 'sincerity', label: 'صراحة بيننا' },
  ],
  challenge: [{ key: 'daily_challenge', label: 'تحدي يومي' }],
  message: [{ key: 'wheel', label: 'عجلة الحب' }],
  story: [{ key: '', label: '—' }],
};
const LEVEL_OPTIONS = [
  { key: '', label: '— بدون مستوى —' }, { key: 'light', label: '❤️ خفيف' },
  { key: 'romantic', label: '💕 رومانسي' }, { key: 'emotional', label: '💗 عاطفي' }, { key: 'intimate', label: '🔥 حميمي' },
];
const LANG_OPTIONS = [{ key: 'ar', label: 'عربية' }, { key: 'hassaniya', label: '🇲🇷 حسانية' }];

function emptyBaynaForm(type) {
  return { type, subtype: '', level: '', lang: 'ar', text: '', active: true };
}

export function AdminBaynaScreen({ c, me }) {
  const [items, setItems] = useState([]);
  const [filterType, setFilterType] = useState('question');
  const [editing, setEditing] = useState(null); // row id being edited, or 'new'
  const [form, setForm] = useState(emptyBaynaForm('question'));

  const load = useCallback(async () => {
    const { data } = await supabase.from('bayna_content').select('*').order('created_at', { ascending: false });
    setItems(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(emptyBaynaForm(filterType)); setEditing('new'); };
  const startEdit = (row) => {
    setForm({ type: row.type, subtype: row.subtype || '', level: row.level || '', lang: row.lang, text: row.text, active: row.active });
    setEditing(row.id);
  };

  const save = async () => {
    if (!form.text.trim()) return;
    const payload = { type: form.type, subtype: form.subtype || null, level: form.level || null, lang: form.lang, text: form.text.trim(), active: form.active };
    if (editing === 'new') {
      await supabase.from('bayna_content').insert({ ...payload, created_by: me.id });
    } else {
      await supabase.from('bayna_content').update(payload).eq('id', editing);
    }
    setEditing(null);
    load();
  };

  const remove = async (id) => { await supabase.from('bayna_content').delete().eq('id', id); load(); };
  const toggleActive = async (row) => { await supabase.from('bayna_content').update({ active: !row.active }).eq('id', row.id); load(); };

  const filtered = items.filter((i) => i.type === filterType);

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl mb-4">🎮 إدارة بيناتنا</div>

      <div className="flex flex-wrap gap-2 mb-4">
        {CONTENT_TYPES.map((t) => (
          <button key={t.key} onClick={() => setFilterType(t.key)} style={{
            background: filterType === t.key ? c.gold : 'transparent', color: filterType === t.key ? c.bg : c.text, border: `1px solid ${c.gold}`,
          }} className="rounded-full px-3 py-1.5 text-xs">{t.label}</button>
        ))}
      </div>

      <button onClick={startNew} style={{ background: c.goldSoft, color: c.gold }} className="w-full rounded-2xl py-3 text-sm font-bold mb-4 flex items-center justify-center gap-2">
        <Plus size={16} /> إضافة محتوى جديد
      </button>

      {editing && (
        <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-2xl p-4 mb-4">
          <div className="grid gap-3">
            <div className="flex gap-2 flex-wrap">
              {CONTENT_TYPES.map((t) => (
                <button key={t.key} onClick={() => setForm((f) => ({ ...f, type: t.key, subtype: '' }))} style={{
                  background: form.type === t.key ? c.gold : 'transparent', color: form.type === t.key ? c.bg : c.text, border: `1px solid ${c.gold}`,
                }} className="rounded-full px-3 py-1 text-xs">{t.label}</button>
              ))}
            </div>
            <select value={form.subtype} onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value }))}
              style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="rounded-xl p-2 text-sm">
              {(SUBTYPES_BY_TYPE[form.type] || [{ key: '', label: '—' }]).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="rounded-xl p-2 text-sm">
              {LEVEL_OPTIONS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            <div className="flex gap-2">
              {LANG_OPTIONS.map((l) => (
                <button key={l.key} onClick={() => setForm((f) => ({ ...f, lang: l.key }))} style={{
                  background: form.lang === l.key ? c.gold : 'transparent', color: form.lang === l.key ? c.bg : c.text, border: `1px solid ${c.gold}`,
                }} className="rounded-full px-3 py-1 text-xs">{l.label}</button>
              ))}
            </div>
            <textarea value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} placeholder="النص…"
              style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="rounded-xl p-3 text-sm outline-none" rows={3} />
            <div className="flex items-center justify-between">
              <span style={{ color: c.text }} className="text-sm">مفعّل</span>
              <button onClick={() => setForm((f) => ({ ...f, active: !f.active }))} style={{ background: form.active ? c.gold : c.border }} className="w-11 h-6 rounded-full relative">
                <div style={{ background: c.bg, transform: form.active ? 'translateX(-22px)' : 'translateX(-2px)' }} className="w-5 h-5 rounded-full absolute top-0.5 transition-transform" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={save} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-full py-2.5 text-sm font-bold">حفظ</button>
              <button onClick={() => setEditing(null)} style={{ color: c.textDim, border: `1px solid ${c.border}` }} className="flex-1 rounded-full py-2.5 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {filtered.map((row) => (
          <div key={row.id} style={{ background: c.bg2, border: `1px solid ${c.border}`, opacity: row.active ? 1 : 0.5 }} className="rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1 text-[10px]" style={{ color: c.gold }}>
                {row.subtype && <span>{row.subtype}</span>}
                {row.level && <span>· {row.level}</span>}
                {row.lang === 'hassaniya' && <span>· 🇲🇷</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(row)} style={{ color: row.active ? '#7BC08C' : c.textDim }} className="text-[11px]">{row.active ? 'مفعّل' : 'معطّل'}</button>
                <button onClick={() => startEdit(row)} style={{ color: c.gold }}><Pencil size={13} /></button>
                <button onClick={() => remove(row.id)} style={{ color: c.rose }}><Trash2 size={13} /></button>
              </div>
            </div>
            <div style={{ color: c.text }} className="text-sm">{row.text}</div>
          </div>
        ))}
        {filtered.length === 0 && <EmptyState c={c} text="ماكاين محتوى فهاذ النوع." />}
      </div>
    </div>
  );
}
