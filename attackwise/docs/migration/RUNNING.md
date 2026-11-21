# تشغيل الأصل والنسخة الجديدة واختبارهما

كل الأوامر تُشغّل محليًا ومربوطة بواجهة loopback ‏(`127.0.0.1`). لا شيء هنا ينشر أو يستبدل الموقع.

## المتطلبات (الإصدارات المستخدمة في التحقق)

| الأداة | الإصدار المجرَّب | ملاحظة |
|---|---|---|
| Node.js | 22.22.1 | ‏jsdom مثبّت على 29.0.2 لأن 31 يتطلب Node ‏22.22.2 أو أحدث |
| npm | 9.2.0 | ‏`attackwise/frontend/.npmrc` يضبط `legacy-peer-deps=true` لتجنّب عطل في محلّل npm 9.2 |
| PHP | 8.5.4 (CLI) | ‏`composer.json` يطلب `^8.3`. يلزم امتداد pdo_sqlite لاختبارات Laravel |
| Composer | 2.9.5 | |
| Chrome / Chromium | Chrome 156 لـ Karma، وChromium الخاص بـ Playwright 1.63.0 | ‏`CHROME_BIN` لـ Karma، و`npx playwright install chromium` مرة واحدة |
| Python 3 | أي إصدار حديث | يقدّم `nav-app/dist/browser` كما يفعل إعداد Playwright في الأصل |

## من checkout نظيف

```sh
git clone --branch attackwise-vue-migration <repo> attackwise-check   # أو: git worktree add ../attackwise-check attackwise-vue-migration
cd attackwise-check
```

ملفات القفل المعتمدة: `nav-app/package-lock.json`، و`attackwise/frontend/package-lock.json`، و`attackwise/backend/composer.lock`. استعمل `npm ci` و`composer install` فقط، ولا تستعمل `npm install` أو `composer update`.

### 1) الخادم Laravel (API القراءة فقط)

```sh
cd attackwise/backend
composer install
cp .env.example .env            # في Windows PowerShell: Copy-Item .env.example .env
php artisan key:generate
php artisan serve --host=127.0.0.1 --port=8000
# فحص سريع: curl http://127.0.0.1:8000/api/v1/health  →  {"data":{"status":"ok"}}
```

- أول طلب لحزمة رسمية ينزّل الفهرس والحزمة من `raw.githubusercontent.com`، وهو المضيف الوحيد المسموح افتراضيًا، ثم يخزّنهما على القرص.
- متغيرات اختيارية:
  - `ATTACKWISE_CACHE_DIR`: مجلد الكاش. الافتراضي `storage/app/attack-cache`.
  - `ATTACKWISE_INDEX_TTL`: مدة صلاحية الفهرس بالثواني. الافتراضي 3600.
  - `ATTACKWISE_ALLOWED_HOSTS`.
  - `ATTACKWISE_COLLECTION_INDEX_URL`.
  - `ATTACKWISE_UPSTREAM_TIMEOUT`.
  - `ATTACKWISE_MAX_BUNDLE_BYTES`.
  - `ATTACKWISE_FRONTEND_ORIGINS`: أصول CORS مفصولة بفواصل. يلزم فقط إذا كانت الواجهة تطلب الـ API من أصل آخر بدون وسيط.
- لا يحتاج الـ API إلى `php artisan migrate`، فلا جداول له.

### 2) واجهة Vue

```sh
cd attackwise/frontend
npm ci
npm run build                   # vue-tsc -b && vite build  →  dist/
npm run preview                 # http://127.0.0.1:4174  (يمرّر /api إلى 127.0.0.1:8000)
# للتطوير: npm run dev           # http://127.0.0.1:5173
```

- إذا كان الـ API على منفذ آخر، شغّل الواجهة مع المتغير `ATTACKWISE_API_PROXY=http://127.0.0.1:8001`.
- عند البناء لخادم حقيقي يجب أن يصل `/api/v1` من نفس الأصل عبر وسيط عكسي إلى Laravel. البديل هو البناء مع `VITE_ATTACKWISE_API_BASE=https://api.example/api/v1` وضبط `ATTACKWISE_FRONTEND_ORIGINS`.
- لم يُنفَّذ أي من خياري النشر هذين، والقرار للمستخدم.
- تعرّف الواجهة عن نفسها بالوسم `<meta name="attackwise-frontend" content="vue">`. الاختبارات ترفض العمل إذا كان العنوان يقدّم Angular.

### 3) الأصل Angular (مرجع المقارنة)

```sh
cd nav-app
npm ci
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist/browser   # http://127.0.0.1:4173
```

### المنافذ

| الخدمة | المنفذ | من يستعمله |
|---|---|---|
| Laravel API | 8000 (أو أي منفذ مع `ATTACKWISE_API_PROXY` و`ATTACKWISE_API_URL`) | Vue preview/dev واختبارات التوافق |
| Angular (dist) | 4173 | اختبارات Playwright في nav-app |
| Vue preview | 4174 | مشروع `vue` في Playwright |
| Vue dev | 5173 | التطوير فقط |
| اختبارات التوافق | 4181–4183، 4186–4187، 4192–4199، 4205–4208 | كل اختبار يشغّل التطبيقين ويوقفهما بنفسه |

المنفذ 4190 محظور في مواصفة Fetch، فلا تستعمله.

## أثر المنفذ على ظهور الخطط المحفوظة

- الخطط تُحفظ في `localStorage` للمتصفح، وهذا التخزين مربوط بالأصل: البروتوكول والمضيف والمنفذ.
  - المفتاح `attackwise-plans` مصفوفة من `{id, name, updated, data}`.
  - المفتاح `attackwise-draft` مسودة قديمة، تُنقل مرة واحدة ثم تُحذف.
  - مفاتيح التفضيلات: `attackwise-language` و`attackwise-theme` و`attackwise-color-blind`.
  - المفتاح `attackwise-plans-unreadable-backup` تكتبه Vue فقط.
- لذلك:
  - الخطط المحفوظة في Angular على `http://127.0.0.1:4173` **لا تظهر** في Vue على `http://127.0.0.1:4174`، ولا تظهر على `http://localhost:4173`. هذا ليس فقدانًا للبيانات: هي باقية في أصلها، وتظهر عند فتح العنوان نفسه.
  - كل منفذ تشغيل جديد يبدأ بقائمة خطط فارغة، والصفحة الأولى تنشئ «Enterprise Threat Plan» تلقائيًا إذا لم توجد خطط ولا رابط فيه `#`.
  - عند استبدال الموقع مستقبلًا يجب تقديم Vue على **نفس** البروتوكول والمضيف والمنفذ الحالي حتى يرى المستخدمون خططهم. هذا متحقق منه في `storage-same-origin.spec.ts`: ‏Angular ثم Vue ثم Angular على أصل واحد.
- الرجوع إلى Angular بعد العمل على Vue آمن للبيانات المكتوبة بصيغتها. لكن انتبه إلى:
  1. Angular لا يقرأ مفتاح النسخة الاحتياطية الذي تكتبه Vue.
  2. Angular يحذف من المصفوفة أي مدخلات لا يعرفها عند أول حفظ، بينما Vue تحتفظ بها.
  3. Angular يستبدل قيمة `attackwise-plans` غير المقروءة، بينما Vue تنسخها أولًا إلى المفتاح الاحتياطي.

  التفاصيل في CURRENT_PARITY.md، البنود ST-05 وST-06.
- لنقل خطة بين أصلين مختلفين: «Download plan JSON» من الأول، ثم «Open plan» في الثاني.

## الاختبارات

شغّل كل شيء من جذر الـ checkout. سجلات التشغيل النهائي في `docs/migration/evidence/final/`.

```sh
# الأصل (أعطال معروفة: Karma 4 من 315، وPlaywright 3 من 16، انظر FINAL_REPORT.md)
cd nav-app
npm run build
CHROME_BIN=/usr/bin/google-chrome npm test -- --watch=false --browsers=ChromeHeadlessCI
npx --no-install playwright test --list
npm run test:e2e

# Vue
cd ../attackwise/frontend
npm run typecheck && npm run typecheck:tests
npm run build
npx vitest run                                                     # اختبارات المنطق والمكوّنات (تتطلب npm ci في nav-app لأن اختبارات المقارنة تستورد كود الأصل)
node scripts/sync-reference-specs.mjs --check                       # تطابق نسخ مواصفات nav-app/e2e
npx --no-install playwright test --project=vue                      # مواصفات الأصل الـ13 على ناتج بناء Vue
npx --no-install playwright test --project=reference-legacy-ui      # 3 مواصفات Navigator الكلاسيكي، تفشل في الأصل أيضًا
ATTACKWISE_CACHE_DIR=<مجلد كاش الـ API> npx --no-install playwright test --project=compat   # يتطلب الـ API ونسخة nav-app/dist المبنية

# Laravel (قاعدة SQLite في الذاكرة من phpunit.xml)
cd ../backend
php artisan test
vendor/bin/pint --test
```

- اختبارات `compat` تقارن Angular وVue مباشرة، وكل اختبار يشغّل التطبيقين على منافذه.
- تحتاج الـ API قيد التشغيل. للمنفذ غير الافتراضي استعمل `ATTACKWISE_API_URL` و`ATTACKWISE_API_PROXY`.
- `ATTACKWISE_CACHE_DIR` يجب أن يشير إلى نفس مجلد كاش الخادم، لأن Angular يُخدَّم نفس بايتات الحزم الرسمية من هذا المجلد.
- `COMPAT_RUNS` يحدد عدد تكرارات قياس الأداء، والافتراضي 5.
- `COMPAT_CASES` يحصر حالات اختبار الملفات.
- السكربت `run-final.sh` المحفوظ في `evidence/` يشغّل السلسلة كاملة ويكتب `summary.txt`.
