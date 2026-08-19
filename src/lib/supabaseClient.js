import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This is almost certainly the "خطأ" you were seeing: without a .env file
  // containing these two variables, the app can't even create the Supabase
  // client, so nothing (signup, buttons, anything) works.
  throw new Error(
    'إعدادات Supabase ناقصة: تأكد من وجود ملف .env في جذر المشروع فيه VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (خذهم من لوحة تحكم مشروعك فـ Supabase > Project Settings > API).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    console.error('signedUrl failed:', error.message);
    return null;
  }
  return data.signedUrl;
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
