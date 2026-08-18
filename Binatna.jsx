import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Heart, ArrowRight, Users, Brain, MessageSquareHeart, Flame,
  Trash2, Pencil, Check, RotateCw,
} from 'lucide-react';
import { supabase, notifyPartner } from '../lib/supabaseClient';

const FONT_DISPLAY = "'Aref Ruqaa', serif";
const FONT_BODY = "'Tajawal', sans-serif";

/* ---------------------------------------------------------
   Shared helpers
--------------------------------------------------------- */
const todayStr = () => new Date().toISOString().slice(0, 10);

const LEVELS = [
  { key: 'light', label: '❤️ خفيف' },
  { key: 'romantic', label: '💕 رومانسي' },
  { key: 'emotional', label: '💗 عاطفي' },
  { key: 'intimate', label: '🔥 حميمي' },
];
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.key, l.label]));

const LANGS = [
  { key: 'ar', label: 'فصحى' },
  { key: 'hassaniya', label: '🇲🇷 حسانية' },
];

function tierFor(total) {
  if (total >= 200) return { emoji: '💞', label: 'توأم الروح' };
  if (total >= 100) return { emoji: '💗', label: 'نعرف بعض' };
  if (total >= 50) return { emoji: '💕', label: 'قريبين' };
  if (total >= 20) return { emoji: '❤️', label: 'متفاهمين' };
  return { emoji: '🌱', label: 'بداية الحكاية' };
}

function pickRandom(pool, usedIds) {
  if (!pool.length) return null;
  let candidates = pool.filter((x) => !usedIds.includes(x.id));
  if (!candidates.length) candidates = pool; // exhausted -> allow repeats again
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function bumpPoints(state, userId, amount) {
  const current = state.points_by_user || {};
  const updated = { ...current, [userId]: (current[userId] || 0) + amount };
  await supabase.from('binatna_state').update({ points_by_user: updated, updated_at: new Date().toISOString() }).eq('couple_id', state.couple_id);
}

/* ---------------------------------------------------------
   Couple game state (points, daily rotation) — one row/couple
--------------------------------------------------------- */
function useBinatnaState(coupleId) {
  const [state, setState] = useState(null);

  const ensure = useCallback(async () => {
    const { data } = await supabase.from('binatna_state').select('*').eq('couple_id', coupleId).maybeSingle();
    if (data) { setState(data); return data; }
    const { data: created } = await supabase.from('binatna_state')
      .insert({ couple_id: coupleId, points_by_user: {}, used_content_ids: [] })
      .select().single();
    setState(created);
    return created;
  }, [coupleId]);

  useEffect(() => { ensure(); }, [ensure]);

  useEffect(() => {
    const ch = supabase.channel(`binatna-state-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'binatna_state', filter: `couple_id=eq.${coupleId}` },
        (payload) => { if (payload.new) setState(payload.new); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  return [state, setState, ensure];
}

/* ---------------------------------------------------------
   Content bank loader (global, filtered)
--------------------------------------------------------- */
function useContentBank(filter) {
  const [items, setItems] = useState([]);
  const key = JSON.stringify(filter);
  useEffect(() => {
    let q = supabase.from('binatna_content').select('*').eq('is_active', true);
    if (filter.type) q = q.eq('type', filter.type);
    if (filter.game_mode) q = q.eq('game_mode', filter.game_mode);
    if (filter.level) q = q.eq('level', filter.level);
    if (filter.language) q = q.eq('language', filter.language);
    q.then(({ data }) => setItems(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return items;
}

/* ===========================================================
   Home entry card — drop this into HomeScreen's actions area
=========================================================== */
export function BinatnaHomeCard({ c, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      background: `linear-gradient(135deg, ${c.goldSoft}, transparent)`, border: `1px solid ${c.gold}`, color: c.text,
    }} className="w-full rounded-2xl p-4 flex items-center gap-3 mb-6 active:scale-95 transition-transform">
      <div style={{ background: c.gold, color: c.bg }} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0">
        <Heart size={20} fill={c.bg} />
      </div>
      <div className="flex-1 text-start">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-lg leading-tight">بيناتنا ❤️</div>
        <div style={{ color: c.textDim }} className="text-xs">ألعاب وأسئلة تقربكم أكثر</div>
      </div>
      <ArrowRight size={16} style={{ color: c.gold, transform: 'rotate(180deg)' }} />
    </button>
  );
}

/* ===========================================================
   Compatibility bar
=========================================================== */
function CompatibilityBar({ c, state, me, partner }) {
  const points = state?.points_by_user || {};
  const total = Object.values(points).reduce((a, b) => a + b, 0);
  const percent = Math.max(8, Math.min(100, 30 + total * 1.5));
  const tier = tierFor(total);
  return (
    <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: c.text }} className="text-sm font-bold">توافقكم اليوم: {Math.round(percent)}% ❤️</span>
        <span style={{ color: c.gold }} className="text-xs">{tier.emoji} {tier.label}</span>
      </div>
      <div style={{ background: c.bg3, height: 6 }} className="rounded-full overflow-hidden">
        <div style={{ background: `linear-gradient(90deg, ${c.gold}, ${c.rose})`, width: `${percent}%`, height: '100%', transition: 'width .5s ease' }} />
      </div>
      <div style={{ color: c.textDim }} className="text-[10px] mt-2">
        نتيجة ترفيهية داخل اللعبة، مش قياس علمي 🙂 — {me?.display_name}: {points[me?.id] || 0} · {partner?.display_name || 'شريكك'}: {(partner && points[partner.id]) || 0}
      </div>
    </div>
  );
}

/* ===========================================================
   MAIN HUB
=========================================================== */
export function BinatnaScreen({ c, me, partner, coupleId, onBack }) {
  const [view, setView] = useState('menu');
  const [state, , ensureState] = useBinatnaState(coupleId);

  // daily +5 bonus for both, once per couple per day — first person to open بيناتنا today triggers it
  useEffect(() => {
    if (!state) return;
    if (state.daily_date === todayStr()) return;
    (async () => {
      const points = { ...(state.points_by_user || {}) };
      points[me.id] = (points[me.id] || 0) + 5;
      if (partner) points[partner.id] = (points[partner.id] || 0) + 5;
      await supabase.from('binatna_state').update({
        daily_date: todayStr(), points_by_user: points, updated_at: new Date().toISOString(),
      }).eq('couple_id', coupleId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.daily_date, coupleId]);

  const MENU = [
    { key: 'quiz', icon: Brain, label: 'مين يعرف الثاني أكثر؟', desc: 'خمّن جواب شريكك' },
    { key: 'who_more', icon: Users, label: 'من الأكثر؟', desc: 'اختاروا سوا' },
    { key: 'confession', icon: MessageSquareHeart, label: 'صراحة بيننا 💕', desc: 'حسب المستوى اللي تختاروه' },
    { key: 'wheel', icon: RotateCw, label: 'عجلة الحب 🎡', desc: 'لفّة وشوف شنو طالع' },
    { key: 'challenge', icon: Flame, label: 'تحدي اليوم 🔥', desc: 'تحدي جديد كل يوم' },
  ];

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} style={{ color: c.gold }}><ArrowRight size={18} /></button>
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl">بيناتنا ❤️</div>
      </div>
      <div style={{ color: c.textDim }} className="text-xs mb-4">لعبة خاصة بيكم الاثنين فقط 🔒</div>

      <CompatibilityBar c={c} state={state} me={me} partner={partner} />

      {view === 'menu' && (
        <div className="grid gap-3">
          {MENU.map((m) => (
            <button key={m.key} onClick={() => setView(m.key)}
              style={{ background: c.bg2, border: `1px solid ${c.border}`, color: c.text }}
              className="rounded-2xl p-4 flex items-center gap-3 text-start active:scale-95 transition-transform">
              <div style={{ background: c.goldSoft, color: c.gold }} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0">
                <m.icon size={19} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">{m.label}</div>
                <div style={{ color: c.textDim }} className="text-xs">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {view !== 'menu' && (
        <button onClick={() => setView('menu')} style={{ color: c.gold }} className="text-xs mb-4 flex items-center gap-1">
          <ArrowRight size={13} /> رجوع لقائمة بيناتنا
        </button>
      )}

      {view === 'quiz' && <QuizGame c={c} me={me} partner={partner} coupleId={coupleId} state={state} />}
      {view === 'who_more' && <WhoMoreGame c={c} me={me} partner={partner} coupleId={coupleId} state={state} />}
      {view === 'confession' && <ConfessionGame c={c} me={me} partner={partner} coupleId={coupleId} />}
      {view === 'wheel' && <LoveWheel c={c} />}
      {view === 'challenge' && <DailyChallenge c={c} me={me} partner={partner} coupleId={coupleId} state={state} ensureState={ensureState} />}
    </div>
  );
}

/* ===========================================================
   1) مين يعرف الثاني أكثر؟
=========================================================== */
function QuizGame({ c, me, partner, coupleId, state }) {
  const [lang, setLang] = useState('ar');
  const [round, setRound] = useState(null);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const pool = useContentBank({ type: 'question', game_mode: 'quiz', language: lang });

  const loadOpenRound = useCallback(async () => {
    const { data } = await supabase.from('binatna_quiz_rounds').select('*')
      .eq('couple_id', coupleId).is('judged_correct', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setRound(data || null);
  }, [coupleId]);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from('binatna_quiz_rounds').select('*')
      .eq('couple_id', coupleId).not('judged_correct', 'is', null).order('created_at', { ascending: false }).limit(10);
    setHistory(data || []);
  }, [coupleId]);

  useEffect(() => { loadOpenRound(); loadHistory(); }, [loadOpenRound, loadHistory]);

  useEffect(() => {
    const ch = supabase.channel(`binatna-quiz-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'binatna_quiz_rounds', filter: `couple_id=eq.${coupleId}` },
        () => { loadOpenRound(); loadHistory(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, loadOpenRound, loadHistory]);

  const answeredCount = history.length;
  const correctCount = history.filter((h) => h.judged_correct).length;
  const pct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;

  const startRound = async () => {
    const usedIds = state?.used_content_ids || [];
    const q = pickRandom(pool, usedIds);
    if (!q) return;
    await supabase.from('binatna_state').update({ used_content_ids: [...usedIds, q.id].slice(-30) }).eq('couple_id', coupleId);
    const { data } = await supabase.from('binatna_quiz_rounds')
      .insert({ couple_id: coupleId, content_id: q.id, question_text: q.text })
      .select().single();
    setRound(data);
  };

  const submit = async () => {
    if (!input.trim() || !round) return;
    const text = input.trim();
    setInput('');
    if (!round.first_user_id) {
      await supabase.from('binatna_quiz_rounds').update({ first_user_id: me.id, first_answer: text }).eq('id', round.id);
      if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'binatna', body: '❤️ شريكك جاوب على سؤال جديد، دورك الآن!' });
    } else if (round.first_user_id !== me.id && !round.second_user_id) {
      await supabase.from('binatna_quiz_rounds').update({ second_user_id: me.id, second_answer: text }).eq('id', round.id);
    }
  };

  const judge = async (correct) => {
    const points = correct ? 10 : 0;
    await supabase.from('binatna_quiz_rounds').update({
      judged_correct: correct, points_awarded: points, judged_at: new Date().toISOString(),
    }).eq('id', round.id);
    if (correct && round.second_user_id) await bumpPoints(state, round.second_user_id, 10);
    setRound(null);
  };

  const iAmFirst = round?.first_user_id === me.id;
  const iAlreadyAnswered = round?.first_user_id === me.id || round?.second_user_id === me.id;
  const waitingForMeToGuess = round?.first_user_id && round.first_user_id !== me.id && !round.second_user_id;
  const waitingForMeToAnswer = !round?.first_user_id;
  const bothAnswered = round?.first_user_id && round?.second_user_id;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div style={{ color: c.gold }} className="text-xs font-bold">إجابات صحيحة: {correctCount} / {answeredCount} — {pct}% توافق</div>
        <LangToggle c={c} lang={lang} setLang={setLang} />
      </div>

      {!round && (
        <button onClick={startRound} disabled={!pool.length} style={{ background: c.gold, color: c.bg, opacity: pool.length ? 1 : 0.5 }}
          className="w-full rounded-full py-3 font-bold text-sm mb-5">سؤال جديد</button>
      )}

      {round && (
        <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{round.question_text}</div>
        </div>
      )}

      {round && waitingForMeToAnswer && (
        <div className="mb-5">
          <label style={{ color: c.textDim }} className="text-xs mb-1 block">جاوب بصراحة يا {me.display_name}</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="w-full rounded-xl p-3 text-sm outline-none mb-3" rows={2} />
          <button onClick={submit} disabled={!input.trim()} style={{ background: c.gold, color: c.bg, opacity: input.trim() ? 1 : 0.6 }}
            className="w-full rounded-full py-3 font-bold text-sm">أرسل جوابي</button>
        </div>
      )}

      {round && waitingForMeToGuess && (
        <div className="mb-5">
          <label style={{ color: c.textDim }} className="text-xs mb-1 block">خمّن جواب {partner?.display_name}</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
            className="w-full rounded-xl p-3 text-sm outline-none mb-3" rows={2} />
          <button onClick={submit} disabled={!input.trim()} style={{ background: c.gold, color: c.bg, opacity: input.trim() ? 1 : 0.6 }}
            className="w-full rounded-full py-3 font-bold text-sm">أرسل تخميني</button>
        </div>
      )}

      {round && iAlreadyAnswered && !bothAnswered && (
        <div style={{ background: c.goldSoft }} className="rounded-2xl p-4 text-center text-sm mb-5" >بانتظار الطرف الثاني…</div>
      )}

      {round && bothAnswered && (
        <div className="mb-5">
          <div className="grid gap-3 mb-4">
            <div style={{ background: c.goldSoft, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
              <div style={{ color: c.gold }} className="text-xs font-bold mb-1">جواب {me.id === round.first_user_id ? me.display_name : partner?.display_name} (الحقيقي)</div>
              <div style={{ color: c.text }} className="text-sm">{round.first_answer}</div>
            </div>
            <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3">
              <div style={{ color: c.rose }} className="text-xs font-bold mb-1">تخمين {me.id === round.second_user_id ? me.display_name : partner?.display_name}</div>
              <div style={{ color: c.text }} className="text-sm">{round.second_answer}</div>
            </div>
          </div>
          {iAmFirst ? (
            <div>
              <div style={{ color: c.textDim }} className="text-xs mb-2 text-center">هل خمّن صح يا {me.display_name}؟</div>
              <div className="flex gap-2">
                <button onClick={() => judge(true)} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-full py-2.5 text-sm font-bold">صح ✓ (+10)</button>
                <button onClick={() => judge(false)} style={{ color: c.textDim, border: `1px solid ${c.border}` }} className="flex-1 rounded-full py-2.5 text-sm">غلط</button>
              </div>
            </div>
          ) : (
            <div style={{ color: c.textDim }} className="text-xs text-center">بانتظار {partner?.display_name} يحدد إذا خمّنت صح…</div>
          )}
        </div>
      )}

      {!!history.length && (
        <div>
          <div style={{ color: c.gold }} className="text-xs font-bold mb-2">سجل النتائج 📜</div>
          <div className="grid gap-2">
            {history.map((h) => (
              <div key={h.id} style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-xl p-3 flex items-center justify-between">
                <div style={{ color: c.text }} className="text-xs flex-1 me-2">{h.question_text}</div>
                <span style={{ color: h.judged_correct ? '#7BC08C' : c.rose }} className="text-xs font-bold shrink-0">{h.judged_correct ? '✓ صح' : '✗ غلط'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   2) من الأكثر؟
=========================================================== */
function WhoMoreGame({ c, me, partner, coupleId, state }) {
  const [lang, setLang] = useState('ar');
  const [current, setCurrent] = useState(null); // {round_key, content_id, question_text, picks:[]}
  const pool = useContentBank({ type: 'question', game_mode: 'who_more', language: lang });
  const awardedRounds = useRef(new Set());

  const loadLatest = useCallback(async () => {
    const { data } = await supabase.from('binatna_who_more_picks').select('*')
      .eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(2);
    if (!data?.length) { setCurrent(null); return; }
    const roundKey = data[0].round_key;
    const picks = data.filter((d) => d.round_key === roundKey);
    setCurrent({ round_key: roundKey, content_id: picks[0].content_id, question_text: picks[0].question_text, picks });
  }, [coupleId]);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  useEffect(() => {
    const ch = supabase.channel(`binatna-whomore-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'binatna_who_more_picks', filter: `couple_id=eq.${coupleId}` },
        () => loadLatest())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, loadLatest]);

  const myPick = current?.picks.find((p) => p.user_id === me.id);
  const partnerPick = partner && current?.picks.find((p) => p.user_id === partner.id);
  const roundOpen = current && current.picks.length < 2;
  const roundDone = current && current.picks.length === 2;

  const startRound = async () => {
    const usedIds = state?.used_content_ids || [];
    const q = pickRandom(pool, usedIds);
    if (!q) return;
    await supabase.from('binatna_state').update({ used_content_ids: [...usedIds, q.id].slice(-30) }).eq('couple_id', coupleId);
    const roundKey = crypto.randomUUID();
    setCurrent({ round_key: roundKey, content_id: q.id, question_text: q.text, picks: [] });
  };

  const choose = async (name) => {
    if (!current || myPick) return;
    await supabase.from('binatna_who_more_picks').insert({
      couple_id: coupleId, content_id: current.content_id, question_text: current.question_text,
      round_key: current.round_key, user_id: me.id, chosen_name: name,
    });
  };

  useEffect(() => {
    if (!roundDone || !myPick || !partnerPick || !state) return;
    if (myPick.chosen_name !== partnerPick.chosen_name || !myPick.chosen_name) return;
    if (awardedRounds.current.has(current.round_key)) return;
    awardedRounds.current.add(current.round_key);
    bumpPoints(state, me.id, 10);
    if (partner) bumpPoints(state, partner.id, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundDone]);

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <LangToggle c={c} lang={lang} setLang={setLang} />
      </div>

      {!current && (
        <button onClick={startRound} disabled={!pool.length} style={{ background: c.gold, color: c.bg, opacity: pool.length ? 1 : 0.5 }}
          className="w-full rounded-full py-3 font-bold text-sm mb-4">سؤال جديد</button>
      )}

      {current && (
        <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
          <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl">{current.question_text}</div>
        </div>
      )}

      {current && !myPick && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[me.display_name, partner?.display_name].filter(Boolean).map((name) => (
            <button key={name} onClick={() => choose(name)} style={{ background: c.bg2, border: `1px solid ${c.border}`, color: c.text }}
              className="rounded-2xl py-5 text-sm font-bold active:scale-95 transition-transform">{name}</button>
          ))}
        </div>
      )}

      {current && myPick && !roundDone && (
        <div style={{ background: c.goldSoft }} className="rounded-2xl p-4 text-center text-sm mb-4">اخترت: {myPick.chosen_name} ✓ — بانتظار {partner?.display_name}…</div>
      )}

      {current && roundDone && (
        <div className="mb-5">
          <div className="grid gap-3 mb-3">
            <div style={{ background: c.goldSoft, border: `1px solid ${c.border}` }} className="rounded-2xl p-3 flex items-center justify-between">
              <span style={{ color: c.gold }} className="text-xs font-bold">{me.display_name}</span>
              <span style={{ color: c.text }} className="text-sm">{myPick.chosen_name}</span>
            </div>
            <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-2xl p-3 flex items-center justify-between">
              <span style={{ color: c.rose }} className="text-xs font-bold">{partner?.display_name}</span>
              <span style={{ color: c.text }} className="text-sm">{partnerPick.chosen_name}</span>
            </div>
          </div>
          {myPick.chosen_name === partnerPick.chosen_name ? (
            <div style={{ color: c.gold }} className="text-center text-sm font-bold">واضح أنكم متفاهمين ❤️ (+10)</div>
          ) : (
            <div style={{ color: c.textDim }} className="text-center text-xs">إجابات مختلفة هالمرة 🙂</div>
          )}
          <button onClick={() => setCurrent(null)} style={{ background: c.gold, color: c.bg }} className="w-full rounded-full py-2.5 text-sm font-bold mt-4">سؤال تاني</button>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   3) صراحة بيننا 💕 — leveled Q&A
=========================================================== */
function ConfessionGame({ c, me, partner, coupleId }) {
  const [level, setLevel] = useState('light');
  const [lang, setLang] = useState('ar');
  const [idx, setIdx] = useState(0);
  const [mine, setMine] = useState('');
  const [answers, setAnswers] = useState([]);
  const pool = useContentBank({ type: 'question', game_mode: 'confession', level, language: lang });
  const q = pool[idx % Math.max(pool.length, 1)];

  const loadAnswers = useCallback(async () => {
    if (!q) return;
    const { data } = await supabase.from('binatna_confession_answers').select('*').eq('couple_id', coupleId).eq('content_id', q.id);
    setAnswers(data || []);
  }, [coupleId, q]);

  useEffect(() => { setIdx(0); }, [level, lang]);
  useEffect(() => { loadAnswers(); setMine(''); }, [loadAnswers]);

  useEffect(() => {
    const ch = supabase.channel(`binatna-confession-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'binatna_confession_answers', filter: `couple_id=eq.${coupleId}` },
        () => loadAnswers())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId, loadAnswers]);

  const myAnswer = answers.find((a) => a.user_id === me.id);
  const partnerAnswer = partner && answers.find((a) => a.user_id === partner.id);

  const submit = async () => {
    if (!mine.trim() || !q) return;
    await supabase.from('binatna_confession_answers').upsert({
      couple_id: coupleId, content_id: q.id, question_text: q.text, user_id: me.id, answer_text: mine.trim(),
    }, { onConflict: 'couple_id,content_id,user_id' });
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'binatna', body: '❤️ شريكك جاوب على سؤال جديد، دورك الآن!' });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {LEVELS.map((l) => (
          <button key={l.key} onClick={() => setLevel(l.key)} style={{
            background: level === l.key ? c.gold : 'transparent', color: level === l.key ? c.bg : c.text, border: `1px solid ${c.gold}`,
          }} className="rounded-full px-3 py-1.5 text-xs">{l.label}</button>
        ))}
      </div>
      <div className="flex items-center justify-between mb-4">
        <div style={{ color: c.textDim }} className="text-xs">{pool.length ? `سؤال ${(idx % pool.length) + 1} من ${pool.length}` : 'لا يوجد أسئلة بهذا المستوى بعد'}</div>
        <LangToggle c={c} lang={lang} setLang={setLang} />
      </div>

      {q && (
        <>
          <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
            <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{q.text}</div>
          </div>
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setIdx((i) => (i - 1 + pool.length) % pool.length)} style={{ color: c.gold }} className="text-sm">السابق</button>
            <button onClick={() => setIdx((i) => (i + 1) % pool.length)} style={{ color: c.gold }} className="text-sm">التالي</button>
          </div>

          {!myAnswer && (
            <div className="mb-4">
              <textarea value={mine} onChange={(e) => setMine(e.target.value)} placeholder={`جوابك يا ${me.display_name}…`}
                style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-xl p-3 text-sm outline-none mb-3" rows={3} />
              <button onClick={submit} disabled={!mine.trim()} style={{ background: c.gold, color: c.bg, opacity: mine.trim() ? 1 : 0.6 }}
                className="w-full rounded-full py-3 font-bold text-sm">أرسل جوابي</button>
            </div>
          )}
          {myAnswer && !partnerAnswer && (
            <div style={{ background: c.goldSoft }} className="rounded-2xl p-4 text-center text-sm">جوابك محفوظ ✓ — بانتظار {partner?.display_name || 'شريكك'}…</div>
          )}
          {myAnswer && partnerAnswer && (
            <div className="grid gap-3">
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
        </>
      )}
    </div>
  );
}

/* ===========================================================
   4) عجلة الحب 🎡
=========================================================== */
const WHEEL_SEGMENTS = [
  { key: 'love_question', label: '❤️ سؤال حب', filter: { type: 'question', game_mode: 'confession', level: 'romantic' } },
  { key: 'message', label: '💌 رسالة', filter: { type: 'message' } },
  { key: 'funny', label: '😂 سؤال مضحك', filter: { type: 'question', game_mode: 'who_more' } },
  { key: 'challenge', label: '🎯 تحدي', filter: { type: 'challenge' } },
  { key: 'memory', label: '📸 ذكرى', special: 'أضيفوا سوا ذكرى جديدة فـ«ذكرياتنا» 📸' },
  { key: 'emotional', label: '💕 سؤال عاطفي', filter: { type: 'question', game_mode: 'confession', level: 'emotional' } },
  { key: 'surprise', label: '🎁 مفاجأة', filter: {} },
];

function LoveWheel({ c }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const seg = 360 / WHEEL_SEGMENTS.length;

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    const targetIdx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const extraSpins = 4 + Math.floor(Math.random() * 3);
    const targetDeg = 360 * extraSpins - (targetIdx * seg + seg / 2);
    setRotation((r) => r - (r % 360) + targetDeg);
    setTimeout(async () => {
      const chosen = WHEEL_SEGMENTS[targetIdx];
      if (chosen.special) {
        setResult({ label: chosen.label, text: chosen.special });
      } else {
        const { data } = await supabase.from('binatna_content').select('*').eq('is_active', true)
          .match(Object.fromEntries(Object.entries(chosen.filter).filter(([, v]) => v)));
        const pick = data?.length ? data[Math.floor(Math.random() * data.length)] : null;
        setResult({ label: chosen.label, text: pick?.text || 'ما لقينا محتوى بهاذ التصنيف بعد — زيدوا من لوحة الإدارة.' });
      }
      setSpinning(false);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 1600);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 240, height: 240 }}>
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0,
          borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `14px solid ${c.gold}`, zIndex: 2,
        }} />
        <div style={{
          width: 240, height: 240, borderRadius: '50%', border: `4px solid ${c.gold}`,
          background: `conic-gradient(${WHEEL_SEGMENTS.map((_, i) => `${i % 2 ? c.bg3 : c.goldSoft} ${i * seg}deg ${(i + 1) * seg}deg`).join(',')})`,
          transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 1.6s cubic-bezier(.17,.67,.2,1)' : 'none',
          position: 'relative',
        }}>
          {WHEEL_SEGMENTS.map((s, i) => (
            <div key={s.key} style={{
              position: 'absolute', top: '50%', left: '50%', width: 100, textAlign: 'center',
              transform: `rotate(${i * seg + seg / 2}deg) translate(0, -95px) rotate(0deg)`, transformOrigin: '0 0',
              fontSize: 11, color: c.text, marginLeft: -50,
            }}>{s.label}</div>
          ))}
        </div>
      </div>
      <button onClick={spin} disabled={spinning} style={{ background: c.gold, color: c.bg, opacity: spinning ? 0.6 : 1 }}
        className="rounded-full px-8 py-3 font-bold text-sm mt-6">{spinning ? 'تدور...' : 'لفّ العجلة 🎡'}</button>

      {result && (
        <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-5 mt-6 text-center w-full">
          <div style={{ color: c.gold }} className="text-xs font-bold mb-2">{result.label}</div>
          <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-lg leading-relaxed">{result.text}</div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   5) تحدي اليوم 🔥
=========================================================== */
function DailyChallenge({ c, me, partner, coupleId, state, ensureState }) {
  const [challenge, setChallenge] = useState(null);
  const [done, setDone] = useState([]);
  const pool = useContentBank({ type: 'challenge' });

  const assignIfNeeded = useCallback(async () => {
    if (!state || !pool.length) return;
    if (state.daily_challenge_id && state.daily_date === todayStr()) {
      const found = pool.find((p) => p.id === state.daily_challenge_id);
      setChallenge(found || pool[0]);
      return;
    }
    const q = pickRandom(pool, state.used_content_ids || []);
    await supabase.from('binatna_state').update({
      daily_challenge_id: q.id, daily_date: todayStr(),
      used_content_ids: [...(state.used_content_ids || []), q.id].slice(-30),
    }).eq('couple_id', coupleId);
    setChallenge(q);
  }, [state, pool, coupleId]);

  useEffect(() => { assignIfNeeded(); }, [assignIfNeeded]);

  const loadDone = useCallback(async () => {
    if (!challenge) return;
    const { data } = await supabase.from('binatna_challenge_log').select('*').eq('couple_id', coupleId).eq('content_id', challenge.id);
    setDone(data || []);
  }, [coupleId, challenge]);

  useEffect(() => { loadDone(); }, [loadDone]);

  const complete = async () => {
    if (!challenge || done.find((d) => d.completed_by === me.id)) return;
    await supabase.from('binatna_challenge_log').insert({ couple_id: coupleId, content_id: challenge.id, completed_by: me.id });
    await bumpPoints(state, me.id, 5);
    if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'binatna', body: '🔥 شريكك أكمل تحدي اليوم، هل أنت مستعد؟' });
    loadDone();
  };

  const myDone = done.find((d) => d.completed_by === me.id);
  const partnerDone = partner && done.find((d) => d.completed_by === partner.id);

  if (!challenge) return <div style={{ color: c.textDim }} className="text-sm text-center">جاري تحضير تحدي اليوم…</div>;

  return (
    <div>
      <div style={{ background: c.bg2, border: `1px solid ${c.gold}` }} className="rounded-3xl p-6 mb-4 text-center">
        <div style={{ color: c.gold }} className="text-xs font-bold mb-2">تحدي اليوم 🔥</div>
        <div style={{ fontFamily: FONT_DISPLAY, color: c.text }} className="text-xl leading-relaxed">{challenge.text}</div>
      </div>
      <div className="flex items-center gap-3 mb-4 text-xs" style={{ color: c.textDim }}>
        <span>{me.display_name}: {myDone ? '✓ أنجزه' : '⏳ لسه'}</span>
        <span>{partner?.display_name}: {partnerDone ? '✓ أنجزه' : '⏳ لسه'}</span>
      </div>
      <button onClick={complete} disabled={!!myDone} style={{ background: c.gold, color: c.bg, opacity: myDone ? 0.6 : 1 }}
        className="w-full rounded-full py-3 font-bold text-sm">{myDone ? 'أنجزته اليوم ✓' : 'أنهيت التحدي (+5)'}</button>
    </div>
  );
}

/* ---------------------------------------------------------
   Small language toggle used across games
--------------------------------------------------------- */
function LangToggle({ c, lang, setLang }) {
  return (
    <div className="flex gap-1">
      {LANGS.map((l) => (
        <button key={l.key} onClick={() => setLang(l.key)} style={{
          background: lang === l.key ? c.gold : 'transparent', color: lang === l.key ? c.bg : c.textDim, border: `1px solid ${c.border}`,
        }} className="rounded-full px-2.5 py-1 text-[10px]">{l.label}</button>
      ))}
    </div>
  );
}

/* ===========================================================
   ADMIN — content management (only for profiles.is_admin = true)
=========================================================== */
export function AdminBinatna({ c, me }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ type: 'question', game_mode: 'quiz', level: '', language: 'ar', text: '' });
  const [editingId, setEditingId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    const { data } = await supabase.from('binatna_content').select('*').order('created_at', { ascending: false }).limit(200);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setForm({ type: 'question', game_mode: 'quiz', level: '', language: 'ar', text: '' }); setEditingId(null); };

  const save = async () => {
    if (!form.text.trim()) return;
    const payload = {
      type: form.type,
      game_mode: form.type === 'question' ? form.game_mode : null,
      level: form.level || null,
      language: form.language,
      text: form.text.trim(),
      created_by: me.id,
    };
    if (editingId) {
      await supabase.from('binatna_content').update(payload).eq('id', editingId);
    } else {
      await supabase.from('binatna_content').insert(payload);
    }
    resetForm();
    load();
  };

  const edit = (row) => {
    setForm({ type: row.type, game_mode: row.game_mode || 'quiz', level: row.level || '', language: row.language, text: row.text });
    setEditingId(row.id);
  };
  const remove = async (id) => { await supabase.from('binatna_content').delete().eq('id', id); load(); };
  const toggleActive = async (row) => { await supabase.from('binatna_content').update({ is_active: !row.is_active }).eq('id', row.id); load(); };

  const filtered = typeFilter === 'all' ? rows : rows.filter((r) => r.type === typeFilter);

  return (
    <div>
      <div style={{ background: c.bg3, border: `1px solid ${c.border}` }} className="rounded-2xl p-4 mb-4">
        <div style={{ color: c.gold }} className="text-xs font-bold mb-3">{editingId ? 'تعديل عنصر' : 'إضافة عنصر جديد'}</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            style={{ background: c.bg2, color: c.text, border: `1px solid ${c.border}` }} className="rounded-lg p-2 text-xs">
            <option value="question">سؤال</option>
            <option value="challenge">تحدي</option>
            <option value="message">رسالة</option>
          </select>
          {form.type === 'question' && (
            <select value={form.game_mode} onChange={(e) => setForm((f) => ({ ...f, game_mode: e.target.value }))}
              style={{ background: c.bg2, color: c.text, border: `1px solid ${c.border}` }} className="rounded-lg p-2 text-xs">
              <option value="quiz">مين يعرف الثاني أكثر</option>
              <option value="who_more">من الأكثر</option>
              <option value="confession">صراحة بيننا</option>
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
            style={{ background: c.bg2, color: c.text, border: `1px solid ${c.border}` }} className="rounded-lg p-2 text-xs">
            <option value="">بدون مستوى</option>
            {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
            style={{ background: c.bg2, color: c.text, border: `1px solid ${c.border}` }} className="rounded-lg p-2 text-xs">
            {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>
        <textarea value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} placeholder="النص…"
          style={{ background: c.bg2, color: c.text, border: `1px solid ${c.border}` }} className="w-full rounded-lg p-2 text-sm outline-none mb-3" rows={2} />
        <div className="flex gap-2">
          <button onClick={save} disabled={!form.text.trim()} style={{ background: c.gold, color: c.bg }} className="flex-1 rounded-full py-2 text-sm font-bold flex items-center justify-center gap-1">
            <Check size={14} /> {editingId ? 'حفظ التعديل' : 'إضافة'}
          </button>
          {editingId && <button onClick={resetForm} style={{ color: c.textDim, border: `1px solid ${c.border}` }} className="flex-1 rounded-full py-2 text-sm">إلغاء</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {['all', 'question', 'challenge', 'message'].map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            background: typeFilter === t ? c.gold : 'transparent', color: typeFilter === t ? c.bg : c.textDim, border: `1px solid ${c.border}`,
          }} className="rounded-full px-3 py-1 text-[11px]">{t === 'all' ? 'الكل' : t === 'question' ? 'أسئلة' : t === 'challenge' ? 'تحديات' : 'رسائل'}</button>
        ))}
      </div>

      <div className="grid gap-2">
        {filtered.map((r) => (
          <div key={r.id} style={{ background: c.bg2, border: `1px solid ${c.border}`, opacity: r.is_active ? 1 : 0.5 }} className="rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span style={{ color: c.gold }} className="text-[10px]">{r.type}{r.game_mode ? ` · ${r.game_mode}` : ''}</span>
              {r.level && <span style={{ color: c.rose }} className="text-[10px]">{LEVEL_LABEL[r.level]}</span>}
              <span style={{ color: c.textDim }} className="text-[10px]">{r.language === 'hassaniya' ? '🇲🇷 حسانية' : 'فصحى'}</span>
            </div>
            <div style={{ color: c.text }} className="text-sm mb-2">{r.text}</div>
            <div className="flex gap-3">
              <button onClick={() => edit(r)} style={{ color: c.gold }} className="text-xs flex items-center gap-1"><Pencil size={12} /> تعديل</button>
              <button onClick={() => toggleActive(r)} style={{ color: c.textDim }} className="text-xs">{r.is_active ? 'تعطيل' : 'تفعيل'}</button>
              <button onClick={() => remove(r.id)} style={{ color: c.rose }} className="text-xs flex items-center gap-1"><Trash2 size={12} /> حذف</button>
            </div>
          </div>
        ))}
        {!filtered.length && <div style={{ color: c.textDim }} className="text-xs text-center py-6">لا يوجد محتوى بهذا التصنيف</div>}
      </div>
    </div>
  );
}
