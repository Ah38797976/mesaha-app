import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// This is almost certainly the "خطأ" you were seeing: without VITE_SUPABASE_URL
// and VITE_SUPABASE_ANON_KEY set (as a local .env file, or as Environment
// Variables on the hosting provider), the app can't create the Supabase
// client and nothing (signup, buttons, anything) works.
//
// IMPORTANT: we deliberately do NOT `throw` here anymore. Throwing at module
// scope happens the instant this file is imported — before React ever gets a
// chance to mount — which is exactly what produced a totally blank white
// page with no visible error. Instead we expose `isSupabaseConfigured` (and
// `supabaseConfigError`) so the app entry point can detect this case and
// render a clear, visible error screen. The check itself is NOT removed or
// weakened — a misconfigured app still cannot silently proceed and hit
// Supabase with undefined credentials.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseConfigError = isSupabaseConfigured
  ? null
  : 'إعدادات Supabase ناقصة: تأكد من ضبط VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (محليًا في ملف .env، أو في إعدادات الاستضافة كـ Environment Variables) — خذهم من لوحة تحكم مشروعك فـ Supabase > Project Settings > API، ثم أعد النشر (Redeploy).';

// When misconfigured, `supabase` is left as `null` rather than calling
// createClient() with undefined values (which throws its own, less clear
// error). Every consumer of `supabase` in this app only runs from inside
// user-triggered handlers/effects, never at module scope, so this is safe —
// the app entry point blocks rendering of the real UI until configured (see
// main.jsx), so these null-client code paths are never actually reached in
// the misconfigured state.
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Exposed so a feature that needs raw upload progress (plain XHR doesn't go
// through the SDK, which has no progress event) can talk to the Storage
// REST endpoint directly without duplicating the env lookup above. Nothing
// else in this file changed.
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

/* -----------------------------------------------------------
   Storage helpers
----------------------------------------------------------- */

// Upload a File (e.g. from an <input type="file">) into a bucket, scoped by
// couple id, and return the storage path to save on the row.
export async function uploadToBucket(bucket, coupleId, file, prefix = '') {
  const ext = file.name?.split('.').pop() || 'bin';
  const path = `${coupleId}/${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

// Upload a raw Blob (e.g. a recorded voice note) the same way.
export async function uploadBlob(bucket, coupleId, blob, ext = 'webm', prefix = '') {
  const path = `${coupleId}/${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: false,
    contentType: blob.type || undefined,
  });
  if (error) throw error;
  return path;
}

// Get a temporary signed URL to display/play a private storage object.
export async function signedUrl(bucket, path, expiresIn = 3600) {
  // TEMP DEBUG: try/catch إضافي حوالين النداء كامل — عشان نمسك حتى
  // الاستثناءات غير المتوقعة (شبكة، CORS، إلخ) اللي ما ترجع كـ
  // { error } عادي من مكتبة supabase-js، وما كانت راح تظهر بالنسخة
  // السابقة. لا يغير أي سلوك بالمسار الناجح إطلاقًا.
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) {
      console.error('signedUrl failed:', error.message);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`signedUrl error (returned)\nbucket: ${bucket}\npath: ${path}\n${error.message}`);
      }
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error('signedUrl threw:', err);
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`signedUrl EXCEPTION\nbucket: ${bucket}\npath: ${path}\n${err?.message || err}`);
    }
    return null;
  }
}

/* -----------------------------------------------------------
   Notifications
----------------------------------------------------------- */

// Insert a row into `notifications` for the partner. The app listens for
// INSERTs on this table (filtered by recipient_id) to show in-app toasts.
export async function notifyPartner({ coupleId, recipientId, actorId, kind, body }) {
  const { error } = await supabase.from('notifications').insert({
    couple_id: coupleId,
    recipient_id: recipientId,
    actor_id: actorId,
    kind,
    body,
  });
  if (error) console.error('notifyPartner failed:', error.message);
}

/* -----------------------------------------------------------
   Chat cards
----------------------------------------------------------- */

// Insert a "rich card" message into the chat — used by the share buttons
// (questions, memories, stories, games, phrases...) to drop a nicely
// rendered card into the conversation instead of plain text.
// cardKind: 'question' | 'memory' | 'story' | 'phrase' | 'game'
// payload: small JSON object with whatever the card needs to render
// (title, subtitle, text, date, photo_path, etc.) — kept free-form on
// purpose so each content type can carry different fields.
export async function sendChatCard({ coupleId, senderId, cardKind, payload }) {
  const { error } = await supabase.from('messages').insert({
    couple_id: coupleId,
    sender_id: senderId,
    type: 'card',
    card_kind: cardKind,
    card_payload: payload,
  });
  if (error) console.error('sendChatCard failed:', error.message);
}
