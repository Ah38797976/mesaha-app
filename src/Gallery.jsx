import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Image as ImageIcon, X, Trash2, Pencil, Check } from 'lucide-react';
import { supabase, signedUrl, notifyPartner, SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/supabaseClient';

/* This file is fully additive: it adds ONE new table (`gallery_photos`) and
   ONE new private storage bucket (`gallery-photos`) — see
   supabase/gallery_migration.sql. It doesn't import from or modify App.jsx,
   the login/chat/games/questions/lock screens, the design tokens, or any
   existing table. App.jsx only needs one new nav entry + one new
   `<GalleryScreen />` render line to wire this in (see GALLERY_SETUP.md). */

const FONT_DISPLAY = "'Aref Ruqaa', serif";
const BUCKET = 'gallery-photos';
const TABLE = 'gallery_photos';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_ORIGINAL_MB = 20; // sanity limit on the ORIGINAL file, before compression
const MAX_DIM = 1600; // longest side after compression, in px
const JPEG_QUALITY = 0.82;

/* ---------------------------------------------------------
   helpers
--------------------------------------------------------- */
function formatDateAr(iso) {
  return new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatTimeAr(iso) {
  return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّرت قراءة الصورة')); };
    img.src = url;
  });
}

// Resizes + re-encodes the image client-side so we never upload a huge
// original. Always outputs a jpeg (simplest, smallest, universally playable)
// regardless of the source format.
async function compressImage(file) {
  const img = await loadImageFromFile(file);
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('تعذّر ضغط الصورة');
  return blob;
}

// Plain XHR (not the supabase-js client) so we get real upload progress —
// the SDK's fetch-based upload has no progress event.
function uploadWithProgress({ path, blob, contentType, accessToken, onProgress }) {
  return new Promise((resolve, reject) => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`, true);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('فشل رفع الصورة، حاول مرة ثانية'));
    };
    xhr.onerror = () => reject(new Error('مشكلة بالاتصال أثناء الرفع'));
    xhr.send(blob);
  });
}

/* ---------------------------------------------------------
   realtime list of shared photos (mirrors useCoupleTable in App.jsx,
   kept local so this file doesn't need to import from App.jsx)
--------------------------------------------------------- */
function useGalleryPhotos(coupleId) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from(TABLE).select('*').eq('couple_id', coupleId).order('created_at', { ascending: false });
    setRows(data || []);
  }, [coupleId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`${TABLE}-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setRows((r) => [payload.new, ...r]);
          if (payload.eventType === 'UPDATE') setRows((r) => r.map((x) => x.id === payload.new.id ? payload.new : x));
          if (payload.eventType === 'DELETE') setRows((r) => r.filter((x) => x.id !== payload.old.id));
        }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);
  return rows;
}

/* ---------------------------------------------------------
   main screen
--------------------------------------------------------- */
export function GalleryScreen({ c, coupleId, me, partner }) {
  const photos = useGalleryPhotos(coupleId);
  const [mediaUrls, setMediaUrls] = useState({});
  const [pending, setPending] = useState([]); // uploads in flight: {id, file, previewUrl, status, progress, error}
  const [errorMsg, setErrorMsg] = useState('');
  const [viewer, setViewer] = useState(null); // the photo row currently open full-screen
  const fileInputRef = useRef(null);

  // resolve signed URLs for photos we don't have yet — same pattern the
  // chat screen already uses for images/voice notes
  useEffect(() => {
    const need = photos.filter((p) => p.photo_path && !mediaUrls[p.photo_path]);
    if (!need.length) return;
    (async () => {
      const entries = await Promise.all(need.map(async (p) => [p.photo_path, await signedUrl(BUCKET, p.photo_path)]));
      setMediaUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [photos, mediaUrls]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(''), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  const runUpload = async (id, file) => {
    setPending((p) => p.map((x) => x.id === id ? { ...x, status: 'compressing', error: null } : x));
    try {
      const blob = await compressImage(file);
      setPending((p) => p.map((x) => x.id === id ? { ...x, status: 'uploading', progress: 0 } : x));
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('انتهت الجلسة، سجّل الدخول من جديد');
      const path = `${coupleId}/gal-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      await uploadWithProgress({
        path, blob, contentType: 'image/jpeg', accessToken: session.access_token,
        onProgress: (pct) => setPending((p) => p.map((x) => x.id === id ? { ...x, progress: pct } : x)),
      });
      await supabase.from(TABLE).insert({ couple_id: coupleId, added_by: me.id, photo_path: path });
      if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'memory', body: `📸 أضاف ${me.display_name} صورة في صور تجمعنا` });
      setPending((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setPending((p) => p.map((x) => x.id === id ? { ...x, status: 'error', error: e.message || 'فشل الرفع' } : x));
    }
  };

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) { setErrorMsg('نقدر نرفع صور فقط (JPG / PNG / WEBP) 🙏'); continue; }
      if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) { setErrorMsg(`الصورة أكبر من ${MAX_ORIGINAL_MB}MB، اختر صورة أصغر`); continue; }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);
      setPending((p) => [...p, { id, file, previewUrl, status: 'compressing', progress: 0, error: null }]);
      runUpload(id, file);
    }
  };

  const removePending = (id) => setPending((p) => p.filter((x) => x.id !== id));

  const uploaderName = (row) => (row.added_by === me.id ? me.display_name : (partner?.display_name || '—'));

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-2xl mb-1">صور تجمعنا ❤️</div>
      <div style={{ color: c.textDim }} className="text-xs mb-4">كل صورة تحكي ذكرى من حكايتنا</div>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple
        className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      <button onClick={() => fileInputRef.current?.click()} style={{ background: c.gold, color: c.bg }}
        className="rounded-full px-5 py-2.5 text-sm font-bold flex items-center gap-1.5 w-fit mb-5">
        <Plus size={16} /> أضف ذكرى
      </button>

      {errorMsg && (
        <div style={{ background: c.goldSoft, color: c.gold, border: `1px solid ${c.gold}` }} className="rounded-xl px-3 py-2 text-xs mb-4">
          {errorMsg}
        </div>
      )}

      {!pending.length && !photos.length ? (
        <div style={{ color: c.textDim }} className="text-sm text-center py-16">
          ما فيه صور بعد — اضغط «+ أضف ذكرى» وشاركوا أول صورة 📸
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {pending.map((p) => (
            <div key={p.id} className="relative rounded-2xl overflow-hidden aspect-square" style={{ background: c.bg3 }}>
              <img src={p.previewUrl} alt="" className="w-full h-full object-cover" style={{ opacity: 0.5 }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
                style={{ background: 'rgba(0,0,0,0.4)' }}>
                {p.status !== 'error' ? (
                  <>
                    <div className="w-4/5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.3)' }}>
                      <div className="h-full transition-all" style={{ width: `${p.status === 'compressing' ? 12 : p.progress}%`, background: c.gold }} />
                    </div>
                    <span className="text-[10px] text-white">{p.status === 'compressing' ? 'جارِ التجهيز…' : `جارِ الرفع… ${p.progress}%`}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] text-white">{p.error}</span>
                    <div className="flex gap-2">
                      <button onClick={() => runUpload(p.id, p.file)} style={{ background: c.gold, color: c.bg }}
                        className="text-[10px] rounded-full px-3 py-1 font-bold">إعادة المحاولة</button>
                      <button onClick={() => removePending(p.id)} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
                        className="text-[10px] rounded-full px-3 py-1 font-bold">إلغاء</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {photos.map((m) => (
            <button key={m.id} onClick={() => setViewer(m)} style={{ background: c.bg3 }}
              className="relative rounded-2xl overflow-hidden aspect-square text-start">
              {mediaUrls[m.photo_path] ? (
                <img src={mediaUrls[m.photo_path]} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><ImageIcon size={22} style={{ color: c.textDim }} /></div>
              )}
              <div className="absolute bottom-0 inset-x-0 px-2.5 py-2"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}>
                <div className="text-white text-xs font-bold">{uploaderName(m)} ❤️</div>
                <div className="text-white text-[10px]" style={{ opacity: 0.85 }}>{formatDateAr(m.created_at)} • {formatTimeAr(m.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {viewer && (
        <PhotoViewerModal c={c} row={viewer} url={mediaUrls[viewer.photo_path]}
          mine={viewer.added_by === me.id} uploaderName={uploaderName(viewer)}
          onClose={() => setViewer(null)}
          onDeleted={() => setViewer(null)}
          coupleId={coupleId} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   full-screen viewer — caption edit + delete (own photos only)
--------------------------------------------------------- */
function PhotoViewerModal({ c, row, url, mine, uploaderName, onClose, onDeleted }) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [caption, setCaption] = useState(row.caption || '');
  const [busy, setBusy] = useState(false);

  const saveCaption = async () => {
    setBusy(true);
    await supabase.from(TABLE).update({ caption: caption.trim() || null }).eq('id', row.id);
    setBusy(false);
    setEditingCaption(false);
  };

  const del = async () => {
    setBusy(true);
    await supabase.storage.from(BUCKET).remove([row.photo_path]);
    await supabase.from(TABLE).delete().eq('id', row.id);
    setBusy(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose}><X size={22} style={{ color: '#fff' }} /></button>
        {mine && (
          <div className="flex items-center gap-4">
            <button onClick={() => setEditingCaption((v) => !v)}><Pencil size={18} style={{ color: '#fff' }} /></button>
            <button onClick={del} disabled={busy}><Trash2 size={18} style={{ color: c.rose }} /></button>
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center px-3 min-h-0">
        {url ? <img src={url} alt="" className="max-w-full max-h-full object-contain rounded-xl" /> : null}
      </div>
      <div className="px-5 py-4">
        <div style={{ color: '#fff' }} className="text-sm font-bold mb-1">{uploaderName} ❤️</div>
        <div style={{ color: 'rgba(255,255,255,0.7)' }} className="text-xs mb-2">
          {formatDateAr(row.created_at)} • {formatTimeAr(row.created_at)}
        </div>
        {editingCaption ? (
          <div className="flex items-center gap-2">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="أضف تعليق… مثال: أجمل ذكرى لنا"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
            <button onClick={saveCaption} disabled={busy} style={{ background: c.gold, color: c.bg }}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"><Check size={16} /></button>
          </div>
        ) : row.caption ? (
          <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-base">«{row.caption}»</div>
        ) : null}
      </div>
    </div>
  );
}
