# رحلات المملكة — Kingdom Journeys

موقع احترافي كامل لشركة سياحة سعودية: واجهة أمامية متعددة الصفحات ثنائية اللغة
(العربية أولاً + الإنجليزية مع تبديل فوري RTL/LTR)، خلفية Node.js/Express مع قاعدة
بيانات SQLite، نماذج تواصل وحجز ونشرة بريدية، ولوحة تحكم إدارية متكاملة — مع طبقات
حماية أمنية مشددة في كل مسار.

A complete, production-minded website for a Saudi tourism company: bilingual
multi-page frontend (Arabic-first with an instant English/RTL–LTR toggle), an
Express + SQLite backend, contact/booking/newsletter pipelines and a full admin
console — with defense-in-depth security on every route.

---

## ✨ المميزات / Features

| القسم | التفاصيل |
|---|---|
| الصفحات العامة | الرئيسية، الوجهات، صفحة وجهة، الباقات، صفحة رحلة، من نحن، الحجز، تواصل، الأسئلة الشائعة، الخصوصية والشروط، 404 |
| ثنائية اللغة | قواميس UI كاملة + محتوى ثنائي اللغة من قاعدة البيانات، حفظ تفضيل اللغة في كوكي، أرقام لاتينية وتاريخ ميلادي للعربية |
| الحجز | اختيار باقة، عدّادات أشخاص، تقدير سعر فوري، تحقق فوري وخادمي، رقم مرجعي `KJ-XXXXXX` |
| النشرة البريدية | اشتراك من التذييل مع حماية من البوتات والتكرار |
| لوحة التحكم | دخول آمن، إحصاءات، إدارة الحجوزات/الرسائل/المشتركين/الباقات/الوجهات/التقييمات/الأسئلة/الإعدادات، سجل تدقيق، تصدير CSV |
| البريد | رسائل تأكيد وتنبيهات للمشرف عبر SMTP (اختياري في التطوير) |

## 🧰 التقنيات / Stack

- **الخادم:** Node.js ≥ 20.11، Express 4، Helmet، better-sqlite3، Zod، csrf-csrf، bcryptjs، nodemailer، express-rate-limit + express-slow-down.
- **الواجهة:** HTML/CSS/JS خالص (ES Modules) بدون خطوة بناء — تصميم نظام ألوان أخضر/ذهبي، خطوط Tajawal + Manrope.
- **لوحة التحكم:** SPA خفيفة داخل `public/admin/` بنفس الـ API المحمي.
- **الاختبارات:** `node --test` + jsdom (25 اختباراً تغطي الصفحات والنماذج والأمان ولوحة التحكم).

## 🚀 التشغيل السريع / Quick start

```bash
npm install
cp .env.example .env        # ثم عدّل القيم والأسرار
npm run seed                # ينشئ القاعدة ويملؤها بالمحتوى التجريبي
npm run dev                 # http://localhost:3000
npm test                    # يشغّل مجموعة الاختبارات الكاملة
```

### بيانات الدخول الافتراضية (تطوير فقط)

```
URL:     http://localhost:3000/admin
Email:   admin@kingdom-journeys.local
Password: ChangeMe-Now!123
```

يُطلب تغيير كلمة المرور عند أول دخول، ويمكن تغيير البريد/الكلمة عبر
`ADMIN_EMAIL` / `ADMIN_PASSWORD` في `.env` قبل أول تشغيل.

## 📜 الأوامر / Scripts

| الأمر | الوظيفة |
|---|---|
| `npm start` | تشغيل الخادم للإنتاج |
| `npm run dev` | تشغيل مع إعادة تحميل تلقائية |
| `npm run seed` | إنشاء المخطط + محتوى تجريبي (وجهات، باقات، تقييمات، أسئلة، حجوزات تجريبية) |
| `npm run reset-db` | تفريغ جميع الجداول (يتطلب `--force` داخلياً) |
| `npm run admin:password` | تعيين كلمة مرور المشرف من الطرفية: `npm run admin:password -- "New-Pass-123!"` (أو من `ADMIN_PASSWORD`)، مع `--email` لحساب آخر |
| `npm test` | اختبارات jsdom + أمان ضد خادم معزول بقاعدة مؤقتة |

## 🆘 لا يتم الدخول إلى لوحة التحكم؟ / Troubleshooting sign-in

| الحالة | السبب | الحل |
|---|---|---|
| تظهر رسالة «Incorrect email or password» | كلمة المرور مختلفة عن الموجودة في `.env` (مثلاً بُدّلت من داخل اللوحة) | في التطوير يعرض الخادم تلميحاً بكلمة المرور الأولى؛ أعد التعيين بـ `npm run admin:password` |
| بعد الدخول تظهر نافذة «Change password» | أول دخول يتطلب تعيين كلمة مرور جديدة (سلوك مقصود) — الجلسة ناجحة واللوحة ظاهرة خلفها | أدخل كلمة المرور الحالية + كلمة جديدة قوية (12 حرفاً، كبير/صغير، رقم، رمز) |
| يرجع فوراً إلى شاشة الدخول أو تظهر رسالة رمز الحماية (CSRF) | المتصفح يمنع كوكي اللوحة، غالباً لأن الصفحة مُدمجة داخل iframe في موقع آخر (المعاينات المُستضافة) | التطبيق يضبط `SameSite=None; Secure` تلقائياً عند الخدمة عبر HTTPS، ويعرض زر «Open the console in its own tab» كحل بديل. يمكن فرضه بالإعداد `COOKIE_SAMESITE=none` |
| شاشة الدخول لا تتفاعل | لم تُحمّل وحدة JavaScript (سياسة CSP أو خطأ سكربت) | يظهر تنبيه أعلى الصفحة بعد ٣ ثوانٍ «The console could not start — reload the page»؛ راجع الـ console |

## 🔐 الأمان / Security hardening

- **CSP صارم:** `script-src 'self'` + بصمات SHA-256 لسكربت الإقلاع فقط، بدون
  `unsafe-inline/unsafe-eval`، `frame-ancestors 'none'`، `object-src 'none'`.
- **CSRF:** Double-submit token لكل عمليات التعديل + ربط الجلسة بكوكي HttpOnly.
- **حماية النماذج:** Honeypot مخفي + حد زمني أدنى/أقصى للإرسال + فحص User-Agent؛
  البوتات تُعلَّم كرسائل spam بصمت دون إفشاء ذلك لها.
- **تحقق صارم:** Zod لكل مدخلات العامة والإدارة (422 بتفاصيل حقول)، وreject للمفاتيح غير المعروفة.
- **حد المعدل والإبطاء:** لكل مسار عام ولوحة التحكم ومحاولات الدخول (مع قفل مؤقت للحساب).
- **جلسات الإدارة:** كوكي HttpOnly/SameSite=Lax، جلسة واحدة نشطة لكل مشرف، إبطال الجلسات عند تغيير كلمة المرور، `must_change_pw` عند الإنشاء.
- **كوكي متكيّف:** عند وصول الطلب عبر HTTPS خارج الإنتاج (معاينات مُستضافة) تصبح الكوكيز `SameSite=None; Secure` لتعمل اللوحة داخل iframe مع الحفاظ على `Lax` كافتراضي صارم؛ ولا يُرسل `None` أبداً بدون `Secure` (تُرفض من المتصفح).
- **كلمات المرور:** bcrypt مع cost مرتفع؛ رسائل دخول موحّدة لا تكشف وجود الحساب.
- **التدقيق:** سجل audit لكل عملية حساسة (دخول/تعديل/تصدير) مع بصمة IP مجزأة.
- **تصدير CSV:** تهريب خلايا يمنع حقن الصيغ (leading `= + - @`) + BOM لدعم العربية في Excel.
- **رؤوس إضافية:** HSTS في الإنتاج، Referrer-Policy، Permissions-Policy،
  X-Content-Type-Options، COOP/CORP، إخفاء `X-Powered-By`.
- **خصوصية:** لا تُخزن عناوين IP مباشرة (تجزئة SHA-256 مع Salt)، وصفحة خصوصية متوافقة مع PDPL.

## 🗂️ هيكل المشروع / Structure

```
server/            الخادم
  app.js           توصيل الوسطاء والمسارات + الصفحات النظيفة URLs
  config.js        قراءة وتحقق متغيرات البيئة
  middleware/      securityHeaders (CSP بالبصم)، csrf، rateLimit، antiBot، auth، validate…
  repositories/    طبقة الوصول للبيانات (content, packages, leads, settings)
  routes/          content (عام)، leads (نماذج)، admin (محمي)
  schemas/         zod schemas لكل المدخلات
  services/        auth sessions، mailer، audit
  db/              schema.sql، seed.js، reset.js، admin-password.js
public/            الواجهة
  *.html           11 صفحة عامة
  css/styles.css   نظام التصميم الكامل
  js/core/         i18n، api، ui، forms، components، main…
  js/pages/        وحدة JS لكل صفحة
  js/i18n/         قواميس ar/en
  admin/           لوحة التحكم (index.html + js + css)
tests/             اختبارات node --test (خادم معزول + jsdom)
```

## 🌍 متغيرات البيئة / Environment

انظر `.env.example` للمشروح كاملاً: `PORT`, `BASE_URL`, `SESSION_SECRET`,
`CSRF_SECRET`, `DATABASE_FILE`, `ADMIN_*`, `SMTP_*`, `ALLOW_GOOGLE_FONTS`,
`TRUST_PROXY`, `COOKIE_SAMESITE` (auto/lax/strict/none), `COOKIE_SECURE`…
في الإنتاج يفرض `assertValidConfig()` أسراراً قوية و`NODE_ENV=production`.

## 🧪 الاختبارات / Tests

`npm test` يشغّل خادمًا معزولًا لكل ملف اختبار (منفذ عشوائي + قاعدة SQLite مؤقتة)
ثم يفحص عبر jsdom:

- تشغيل كل صفحة عامة وتهجين أقسامها من الـ API.
- تدفق الحجز الكامل (تقدير السعر، التحقق، الرقم المرجعي) والتواصل والتقاط البوتات.
- تبديل اللغة العربية/الإنجليزية واتجاه الصفحة.
- لوحة التحكم: الدخول، إجبار تغيير الكلمة، الإدارة التحرير.
- regression أمنية: الرؤوس، CSRF، Origin، التحقق، 401/403/404/422.
- كوكيز الجلسة: `Lax` على HTTP المباشر و`None; Secure` خلف HTTPS، ورسائل واضحة عندما
  يرفض المتصفح حفظ الكوكي (راجع `tests/session.test.mjs`).

## 📄 الترخيص / License

خاص بالمشروع — جميع الحقوق محفوظة لشركة رحلات المملكة.
