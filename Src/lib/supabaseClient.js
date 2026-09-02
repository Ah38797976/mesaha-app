import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// This is almost certainly the "خطأ" you were seeing: without a .env file
// containing these two variables, the app can't even create the Supabase
// client, so nothing (signup, buttons, anything) works.
//
// We deliberately do NOT throw at module-import time anymore — a throw here
// happens before React even mounts, outside any component's render, so the
// ErrorBoundary in main.jsx has nothing to catch and the user just sees a
// blank page. Instead we export the message and let App.jsx throw it from
// inside the component tree (see the `if (SUPABASE_CONFIG_ERROR) throw ...`
// at the top of MesahaApp), where the ErrorBoundary can catch it and show
// the message + retry button.
export const SUPABASE_CONFIG_ERROR = (!supabaseUrl || !supabaseAnonKey)
  ? 'إعدادات Supabase ناقصة: تأكد من وجود ملف .env في جذر المشروع فيه VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (خذهم من لوحة تحكم مشروعك فـ Supabase > Project Settings > API).'
  : null;

// When config is missing, createClient() itself would throw on bad input
// (or produce a client that fails on first use). We only ever call
// createClient with real values — if they're missing, SUPABASE_CONFIG_ERROR
// above is set and MesahaApp throws before anything touches `supabase`.
export const supabase = SUPABASE_CONFIG_ERROR
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);

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
  // السابقة. لا يغيّر أي سلوك بالمسار الناجح إطلاقًا.
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

// Remove an object from a bucket by its storage path — the delete-side
// counterpart of uploadToBucket/uploadBlob above. Used e.g. to clean up an
// orphaned file when the DB insert that should reference it fails, or when
// the user deletes a photo/voice note and its storage object must go too.
export async function removeFromBucket(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error('removeFromBucket failed:', error.message);
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
