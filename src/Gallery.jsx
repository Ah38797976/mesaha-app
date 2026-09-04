import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, X, Image as ImageIcon, Trash2, RefreshCw, Check, AlertCircle,
  ChevronLeft, ChevronRight, Heart,
} from 'lucide-react';
import {
  supabase, signedUrl, notifyPartner, removeFromBucket, SUPABASE_URL, SUPABASE_ANON_KEY,
} from './lib/supabaseClient';

// ملف مستقل قدر الإمكان — نفس خطوط ومقاسات باقي التطبيق، بدون أي
// اعتماد على ثوابت من App.jsx (تفاديًا لأي استيراد دائري).
const FONT_DISPLAY = "'Aref Ruqaa', serif";

const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_DIM = 1600;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
// Soft cap on how many photos we pull at once. Keeps the grid fast on a
// couple with a large shared album; a "load more" / infinite-scroll can
// build on top of this later without changing the query shape.
const PAGE_SIZE = 90;

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`;
  return `منذ ${Math.floor(s / 86400)} يوم`;
}

// شريط تنبيهات بسيط ومستقل (بدل alert()) — يُستخدم فقط داخل هذا الملف
// حتى يبقى Gallery مستقلًا كما هو مصمم أعلاه.
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, kind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return [toasts, push];
}

function ToastStack({ c, toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: c.bg2, border: `1px solid ${t.kind === 'error' ? c.rose : c.gold}`, color: c.text,
        }} className="rounded-full px-4 py-2 text-xs shadow-lg flex items-center gap-2 max-w-[90%]">
          {t.kind === 'error' && <AlertCircle size={13} style={{ color: c.rose }} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

// يضغط الصورة (أبعاد لا تتجاوز 1600px) قبل الرفع، يرجّع Blob بصيغة JPEG.
async function compressImage(file, maxDim = MAX_DIM, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
    else { width = Math.round(width * (maxDim / height)); height = maxDim; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل تجهيز الصورة'))), 'image/jpeg', quality);
  });
}

// رفع بـ XHR خام (بدل SDK) عشان نقدر نتابع شريط تقدّم حقيقي —
// عميل supabase-js ما يعطي progress event.
function uploadWithProgress(bucket, coupleId, blob, onProgress) {
  return new Promise((resolve, reject) => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { reject(new Error('انتهت الجلسة، أعد تسجيل الدخول')); return; }

      const path = `${coupleId}/photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(path);
        else reject(new Error(`فشل رفع الصورة (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('فشل الاتصال أثناء الرفع'));
      xhr.send(blob);
    })();
  });
}

export default function Gallery({ c, coupleId, me, partner }) {
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [openId, setOpenId] = useState(null);
  const [uploading, setUploading] = useState(null); // { progress, error }
  const fileInputRef = useRef(null);
  const pendingBlobRef = useRef(null);

  const [toasts, pushToast] = useToasts();
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('gallery_photos')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      // كان هذا الخطأ يُبتلع بصمت من قبل (data || [])، فيظهر للمستخدم "ما
      // فيه صور بعد" حتى لو كانت المشكلة الحقيقية رفض RLS للقراءة.
      console.error('gallery_photos select error:', error.message);
      setLoadError(true);
      pushToast('تعذّر تحميل الصور، حاول تحديث الصفحة', 'error');
    } else {
      setLoadError(false);
    }
    setPhotos(data || []);
    setLoading(false);
  }, [coupleId, pushToast]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  useEffect(() => {
    const ch = supabase.channel(`gallery_photos-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_photos', filter: `couple_id=eq.${coupleId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setPhotos((p) => [payload.new, ...p]);
          if (payload.eventType === 'UPDATE') setPhotos((p) => p.map((x) => (x.id === payload.new.id ? payload.new : x)));
          if (payload.eventType === 'DELETE') setPhotos((p) => p.filter((x) => x.id !== payload.old.id));
        }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [coupleId]);

  // signed urls لعرض الصور (bucket خاص). try/catch هنا يمسك أي استثناء
  // يصير خارج signedUrl() نفسها (مثلاً بمرحلة Promise.all أو
  // Object.fromEntries) ولا يتركه يختفي بصمت كـ unhandled promise rejection.
  useEffect(() => {
    const need = photos.filter((p) => p.storage_path && !urls[p.storage_path]);
    if (!need.length) return;
    (async () => {
      try {
        const entries = await Promise.all(need.map(async (p) => [p.storage_path, await signedUrl('couple-photos', p.storage_path)]));
        setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      } catch (err) {
        console.error('gallery signedUrl batch failed:', err);
        pushToast('تعذّر تحميل بعض الصور', 'error');
      }
    })();
  }, [photos, urls, pushToast]);

  const doUpload = useCallback(async (blob) => {
    let uploadedPath = null;
    try {
      uploadedPath = await uploadWithProgress('couple-photos', coupleId, blob, (progress) =>
        setUploading((u) => (u ? { ...u, progress } : u)));
      const { error: insertErr } = await supabase
        .from('gallery_photos')
        .insert({ couple_id: coupleId, added_by: me.id, storage_path: uploadedPath });
      if (insertErr) {
        // الرفع للـ Storage نجح لكن حفظ السطر فشل — نظّف الملف اليتيم فورًا
        // بدل ما يبقى محتفظ به بدون أي سطر يشير إليه.
        await removeFromBucket('couple-photos', uploadedPath);
        throw insertErr;
      }
      if (partner) notifyPartner({ coupleId, recipientId: partner.id, actorId: me.id, kind: 'gallery', body: `📷 أضاف ${me.display_name} صورة في صور تجمعنا` });
      pendingBlobRef.current = null;
      setUploading(null);
      pushToast('تم رفع الصورة ✓');
    } catch (e) {
      setUploading((u) => (u ? { ...u, error: e.message || 'فشل الرفع' } : u));
    }
  }, [coupleId, me, partner, pushToast]);

  const startUpload = useCallback(async (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      pushToast('نوع الملف غير مدعوم — اختر صورة (JPG, PNG, WEBP, HEIC...)', 'error');
      return;
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      setUploading({ progress: 0, error: 'حجم الصورة أكبر من 20 ميغابايت' });
      return;
    }
    setUploading({ progress: 0, error: null });
    try {
      const blob = await compressImage(file);
      pendingBlobRef.current = blob;
      await doUpload(blob);
    } catch (e) {
      setUploading((u) => (u ? { ...u, error: e.message || 'فشل تجهيز الصورة' } : u));
    }
  }, [doUpload, pushToast]);

  const retryUpload = () => {
    if (pendingBlobRef.current) {
      setUploading({ progress: 0, error: null });
      doUpload(pendingBlobRef.current);
    }
  };

  // uploading !== null يغطي كل من الرفع الجاري وحالة الخطأ (بانتظار إعادة
  // المحاولة أو الإغلاق) — في الحالتين لا نريد فتح منتقي ملف ثانٍ فوقه.
  const pickPhoto = () => { if (!uploading) fileInputRef.current?.click(); };
  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) startUpload(file);
  };

  const saveComment = async (id, comment) => {
    const { error } = await supabase.from('gallery_photos').update({ comment }).eq('id', id);
    if (error) { pushToast('تعذّر حفظ التعليق', 'error'); return false; }
    return true;
  };

  const deletePhoto = async (photo) => {
    const { error } = await supabase.from('gallery_photos').delete().eq('id', photo.id);
    if (error) { pushToast('تعذّر حذف الصورة', 'error'); return; }
    supabase.storage.from('couple-photos').remove([photo.storage_path]).then(({ error: storErr }) => {
      if (storErr) console.error('couple-photos remove failed:', storErr.message);
    });
    setOpenId(null);
  };

  const nameFor = (userId) => (userId === me.id ? (me.display_name || 'أنا') : (partner?.display_name || 'الشريك'));
  const openIndex = photos.findIndex((p) => p.id === openId);
  const openPhoto = openIndex >= 0 ? photos[openIndex] : null;
  // التنقّل بين الصور (سلايدر): نفس ترتيب الشبكة (الأحدث أولًا).
  // clamp بدل التدوير الدائري — أوضح للمستخدم متى وصل لأول/آخر صورة.
  const goNext = useCallback(() => {
    if (openIndex >= 0 && openIndex < photos.length - 1) setOpenId(photos[openIndex + 1].id);
  }, [openIndex, photos]);
  const goPrev = useCallback(() => {
    if (openIndex > 0) setOpenId(photos[openIndex - 1].id);
  }, [openIndex, photos]);

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <ToastStack c={c} toasts={toasts} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChosen} disabled={!!uploading} />

      <div className="flex items-center justify-between mb-4">
        <div style={{ fontFamily: FONT_DISPLAY, color: c.gold }} className="text-xl">صور تجمعنا ❤️</div>
        <button onClick={pickPhoto} disabled={!!uploading} style={{ background: c.goldSoft, color: c.gold, opacity: uploading ? 0.5 : 1 }}
          className="w-9 h-9 rounded-full flex items-center justify-center">
          <Plus size={18} />
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: c.bg3, aspectRatio: '1 / 1' }} className="rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && loadError && photos.length === 0 && (
        <div style={{ color: c.rose }} className="text-sm text-center mt-16">
          تعذّر تحميل الصور — تحقق من اتصالك وحاول مجددًا
        </div>
      )}

      {!loading && !loadError && photos.length === 0 && !uploading && (
        <div className="relative mt-10 rounded-2xl overflow-hidden flex flex-col items-center justify-center py-14 px-6"
          style={{ background: c.bg2, border: `1px solid ${c.border}` }}>
          {/* خلفية افتراضية بسيطة (قلب باهت) بدل الاعتماد على صورة خارجية —
              تبقي الشاشة الفارغة دافئة دون أي طلب شبكة إضافي */}
          <Heart size={140} style={{ color: c.gold, opacity: 0.08, position: 'absolute' }} />
          <Heart size={34} style={{ color: c.gold }} className="relative mb-3" />
          <div style={{ color: c.text }} className="relative text-sm font-bold text-center">
            أضيفوا أول صورة لكم ❤️
          </div>
          <button onClick={pickPhoto} style={{ background: c.goldSoft, color: c.gold, border: `1px solid ${c.border}` }}
            className="relative mt-4 rounded-full px-4 py-2 text-xs font-bold flex items-center gap-1.5">
            <Plus size={14} /> إضافة صورة
          </button>
        </div>
      )}

      {!loading && <div className="grid grid-cols-3 gap-1.5">
        {photos.map((p) => (
          <button key={p.id} onClick={() => setOpenId(p.id)}
            style={{ background: c.bg3, aspectRatio: '1 / 1' }}
            className="rounded-lg overflow-hidden relative">
            {urls[p.storage_path]
              ? <img src={urls[p.storage_path]} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={20} style={{ color: c.textDim }} /></div>}
            <div style={{ background: 'rgba(0,0,0,0.45)' }}
              className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between">
              <span style={{ color: '#F1E4C6' }} className="text-[9px] truncate">{nameFor(p.added_by)}</span>
              <span style={{ color: '#F1E4C6' }} className="text-[8px]">{timeAgo(p.created_at)}</span>
            </div>
          </button>
        ))}
      </div>}

      {/* شريط رفع الصورة: تقدّم + إعادة محاولة عند الفشل */}
      {uploading && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
          <div style={{ background: c.bg2, border: `1px solid ${c.border}`, maxWidth: 420, width: '100%' }}
            className="rounded-2xl p-4">
            {uploading.error ? (
              <div className="flex items-center justify-between gap-3">
                <div style={{ color: c.rose }} className="text-xs flex-1">{uploading.error}</div>
                <button onClick={retryUpload} style={{ background: c.gold, color: c.bg }}
                  className="rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1">
                  <RefreshCw size={13} /> إعادة المحاولة
                </button>
                <button onClick={() => { pendingBlobRef.current = null; setUploading(null); }}>
                  <X size={16} style={{ color: c.textDim }} />
                </button>
              </div>
            ) : (
              <div>
                <div style={{ color: c.textDim }} className="text-xs mb-2">جاري رفع الصورة… {uploading.progress}%</div>
                <div style={{ background: c.bg3 }} className="h-1.5 rounded-full overflow-hidden">
                  <div style={{ background: c.gold, width: `${uploading.progress}%` }} className="h-full transition-all" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {openPhoto && (
        <PhotoViewer
          c={c}
          photo={openPhoto}
          url={urls[openPhoto.storage_path]}
          addedByName={nameFor(openPhoto.added_by)}
          isMine={openPhoto.added_by === me.id}
          onClose={() => setOpenId(null)}
          onSaveComment={(text) => saveComment(openPhoto.id, text)}
          onDelete={() => deletePhoto(openPhoto)}
          onNext={goNext}
          onPrev={goPrev}
          hasNext={openIndex >= 0 && openIndex < photos.length - 1}
          hasPrev={openIndex > 0}
        />
      )}
    </div>
  );
}

function PhotoViewer({ c, photo, url, addedByName, isMine, onClose, onSaveComment, onDelete, onNext, onPrev, hasNext, hasPrev }) {
  const [comment, setComment] = useState(photo.comment || '');
  const [saved, setSaved] = useState(false);
  const touchRef = useRef({ x: 0, active: false });

  useEffect(() => { setComment(photo.comment || ''); setSaved(false); }, [photo.id, photo.comment]);

  const save = async () => {
    const ok = await onSaveComment(comment.trim() || null);
    if (!ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // سحب يمين/يسار على الهاتف للتنقّل بين الصور (سلايدر). عتبة 45px
  // تكفي لتمييز السحب المقصود عن لمسة عرضية، بغضّ النظر عن اتجاه RTL —
  // الحركة الفعلية للإصبع هي ما يُحتسب: يسار = التالي، يمين = السابق.
  const SWIPE_THRESHOLD = 45;
  const onTouchStart = (e) => {
    touchRef.current = { x: e.touches[0].clientX, active: true };
  };
  const onTouchEnd = (e) => {
    if (!touchRef.current.active) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    touchRef.current.active = false;
    if (dx <= -SWIPE_THRESHOLD && hasNext) onNext();
    else if (dx >= SWIPE_THRESHOLD && hasPrev) onPrev();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div style={{ maxWidth: 420, width: '100%' }} className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm" style={{ color: '#F1E4C6' }}>
            <div className="font-bold">{addedByName}</div>
            <div style={{ color: '#C9BBA0' }} className="text-xs">{new Date(photo.created_at).toLocaleString('ar')}</div>
          </div>
          <button onClick={onClose}><X size={22} style={{ color: '#F1E4C6' }} /></button>
        </div>

        <div className="relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {url
            ? <img src={url} alt="" className="w-full max-h-[60vh] object-contain rounded-xl mb-3" />
            : <div style={{ background: c.bg3 }} className="w-full h-64 rounded-xl mb-3 flex items-center justify-center">
                <ImageIcon size={28} style={{ color: c.textDim }} />
              </div>}

          {hasPrev && (
            <button onClick={onPrev} aria-label="الصورة السابقة"
              style={{ background: 'rgba(0,0,0,0.45)' }}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center">
              <ChevronLeft size={18} style={{ color: '#F1E4C6' }} />
            </button>
          )}
          {hasNext && (
            <button onClick={onNext} aria-label="الصورة التالية"
              style={{ background: 'rgba(0,0,0,0.45)' }}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center">
              <ChevronRight size={18} style={{ color: '#F1E4C6' }} />
            </button>
          )}
        </div>

        <div style={{ background: c.bg2, border: `1px solid ${c.border}` }} className="rounded-xl p-3">
          {isMine ? (
            <div className="flex items-center gap-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="أضف تعليقًا…"
                style={{ background: c.bg3, color: c.text, border: `1px solid ${c.border}` }}
                className="flex-1 rounded-full px-3 py-2 text-xs outline-none" />
              <button onClick={save} style={{ background: c.gold, color: c.bg }}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                <Check size={15} />
              </button>
            </div>
          ) : (
            photo.comment && <div style={{ color: c.text }} className="text-sm">{photo.comment}</div>
          )}
          {saved && <div style={{ color: c.gold }} className="text-[10px] mt-1">تم الحفظ ✓</div>}
        </div>

        {isMine && (
          <button onClick={onDelete} style={{ color: c.rose }}
            className="mt-3 mx-auto flex items-center gap-1.5 text-xs">
            <Trash2 size={14} /> حذف الصورة
          </button>
        )}
      </div>
    </div>
  );
}
