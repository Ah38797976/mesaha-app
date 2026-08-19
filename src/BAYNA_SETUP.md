# بيناتنا ❤️ — خطوات التفعيل

## 1) شغّل ملف SQL
افتح Supabase → **SQL Editor** → الصق محتوى `supabase/bayna_migration.sql` كاملاً → Run.
آمن للتشغيل أكثر من مرة، ولا يمس أي جدول موجود عندك حاليًا.

## 2) اجعل حسابك أدمن (لرؤية «🎮 إدارة بيناتنا»)
من **SQL Editor** نفّذ (بعد استبدال الـ UUID بمعرف حسابك من جدول `profiles`):
```sql
update public.profiles set is_admin = true where id = '<YOUR-USER-UUID>';
```
تلقى الـ UUID من: Table Editor → profiles → عمود id (لحسابك).

## 3) انسخ الملفين إلى المشروع
- `src/App.jsx` (استبدل الملف القديم)
- `src/Bayna.jsx` (ملف جديد، يوضع بجانب App.jsx)

لم يتغير أي شيء آخر (lib/supabaseClient.js، package.json، إلخ).

## 4) شغّل وجرّب
```
npm install
npm run dev
```
افتح التطبيق → من الصفحة الرئيسية اضغط بطاقة **بيناتنا ❤️** (أو من شريط التنقل السفلي).
إذا فعّلت is_admin، يظهر لك تبويب **«إدارة»** إضافي في شريط التنقل لإدارة الأسئلة/التحديات/الرسائل/القصص.
