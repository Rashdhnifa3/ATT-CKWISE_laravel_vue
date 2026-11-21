# نشر ATT&CKWISE (Vue + Laravel) على خادم Linux عبر Docker Compose

الهدف المعتمد: خادم Linux (VPS) بمعمارية **x86_64 (amd64)**، عليه Docker Engine وDocker Compose v2. لا يوجد في المستودع إعداد استضافة إنتاج آخر معتمد لهذه النسخة. ملفات `Dockerfile` و`.github/workflows` في جذر المستودع تبني Navigator الأصلي (Angular) ولا تُستعمل هنا. الاستضافة المشتركة غير مدعومة وغير مختبرة.

القيم بين `<…>` يستبدلها صاحب الخادم.

## ما في الحزمة

`attackwise-<VERSION>-linux-amd64.tar.gz` (وبجانبه ملف `.sha256`) يحتوي:

| الملف | الوظيفة |
|---|---|
| `images/attackwise-web-<VERSION>-linux-amd64.tar.gz` | صورة الواجهة: Nginx مع بناء Vue، بلا Node وبلا أدوات بناء |
| `images/attackwise-api-<VERSION>-linux-amd64.tar.gz` | صورة الـ API: ‏Laravel على PHP-FPM، باعتماديات الإنتاج من `composer.lock` فقط |
| `compose.yaml`، `compose.tls.yaml` | تعريف الخدمتين، والوضع الاختياري لـ TLS داخل الحاوية |
| `attackwise.sh` | أوامر التثبيت والتشغيل والتحقق |
| `attackwise.env.example` | نموذج إعداد الخادم |
| `nginx/tls.conf` | إعداد Nginx لوضع TLS المدمج |
| `proxy/nginx-host.conf.example`، `proxy/Caddyfile.example` | وكيل عكسي على الخادم ينهي TLS |
| `release.env` | رقم الإصدار والـ commit |
| `MANIFEST.txt` | الـ commit، والصور ومعرّفاتها، والصور الأساسية مع digest، والإصدارات |
| `SHA256SUMS` | بصمات كل ملفات الحزمة |
| `LICENSE.txt`، `NOTICE.txt` | الترخيص والإسناد |

الحزمة لا تحتوي `.env` ولا مفاتيح ولا شهادات ولا بيانات مستخدمين.

## متطلبات الخادم

- Linux على x86_64. الصور مبنية لـ `linux/amd64` فقط، فلا تعمل على ARM.
- Docker Engine 24 أو أحدث، و`docker compose` v2.20 أو أحدث. جُرّبت مع الإصدارات المذكورة في `MANIFEST.txt` وتقرير الإصدار.
- 1 vCPU، و1 GB ذاكرة على الأقل، و2 GB قرص للصور والكاش.
- اتصال خارجي من الخادم بـ `https://raw.githubusercontent.com`، لأن الـ API ينزّل فهرس ATT&CK وحزمه الرسمية ويحفظها في الكاش.
- مستخدم نشر عضو في مجموعة `docker`، ومجلد `/opt/attackwise` مملوك له.
- للنشر العام: دومين يشير إلى الخادم، وشهادة TLS له.

## أول تثبيت

```sh
# على جهازك: انقل الحزمة إلى الخادم
scp attackwise-<VERSION>-linux-amd64.tar.gz attackwise-<VERSION>-linux-amd64.tar.gz.sha256 <user>@<server>:/opt/attackwise/releases/

# على الخادم
cd /opt/attackwise/releases
sha256sum -c attackwise-<VERSION>-linux-amd64.tar.gz.sha256
tar -xzf attackwise-<VERSION>-linux-amd64.tar.gz
cd attackwise-<VERSION>-linux-amd64
./attackwise.sh load        # يتحقق من SHA256SUMS ثم ينفّذ docker load للصورتين
./attackwise.sh init        # مرة واحدة: ينشئ /opt/attackwise/config/attackwise.env ويولّد APP_KEY
nano /opt/attackwise/config/attackwise.env    # عدّل APP_URL=<https://your-domain> ووضع النشر
./attackwise.sh up          # يشغّل الخدمتين، ينتظر حالة healthy، ثم يتحقق
```

- **`init`:**
  - لا يكتب فوق ملف موجود.
  - لا يعيد توليد `APP_KEY` إذا كان موجودًا.
  - لا يطبع المفتاح.
  - الملف `/opt/attackwise/config/attackwise.env` يبقى خارج مجلد الإصدار بصلاحية `600`. خذ منه نسخة احتياطية.
- **مسار آخر للإعداد:** ضع `ATTACKWISE_CONFIG_FILE=<path>` قبل كل أمر.

## HTTPS

اختر وضعًا واحدًا عبر `ATTACKWISE_TLS` في ملف الإعداد.

**1. `proxy` (الافتراضي): وكيل عكسي موجود على الخادم ينهي TLS**

- الحزمة تستمع على `127.0.0.1:8080` فقط.
- انسخ `proxy/nginx-host.conf.example` أو `proxy/Caddyfile.example`، وضع `<your-domain>` ومسار الشهادة.
- الرؤوس المطلوبة من الوكيل:
  - `Host`
  - `X-Forwarded-Proto`
  - `X-Forwarded-For`
- مهلة القراءة 300 ثانية على الأقل، لأن أول طلب لإصدار ATT&CK جديد يُنزّل حوالي 55 MB.
- `HSTS` يضيفه الوكيل نفسه.

```sh
sudo cp proxy/nginx-host.conf.example /etc/nginx/sites-available/attackwise   # ثم عدّل <your-domain>
sudo ln -s /etc/nginx/sites-available/attackwise /etc/nginx/sites-enabled/
sudo certbot --nginx -d <your-domain>        # أو شهادتك الموجودة
sudo nginx -t && sudo systemctl reload nginx
```

**2. `builtin`: حاوية الويب تقدّم HTTPS بنفسها، دون وكيل آخر**

في ملف الإعداد:

```sh
ATTACKWISE_TLS=builtin
ATTACKWISE_HTTP_BIND=0.0.0.0
ATTACKWISE_HTTP_PORT=80
ATTACKWISE_HTTPS_BIND=0.0.0.0
ATTACKWISE_HTTPS_PORT=443
ATTACKWISE_TLS_CERT_DIR=/opt/attackwise/tls
```

ثم ضع الشهادة بحيث يقرؤها المستخدم 101 (مستخدم nginx داخل الحاوية):

```sh
sudo install -d -m 0750 -o 101 -g 101 /opt/attackwise/tls
sudo install -m 0440 -o 101 -g 101 /etc/letsencrypt/live/<your-domain>/fullchain.pem /opt/attackwise/tls/fullchain.pem
sudo install -m 0400 -o 101 -g 101 /etc/letsencrypt/live/<your-domain>/privkey.pem   /opt/attackwise/tls/privkey.pem
./attackwise.sh up
```

- المنفذ 80 يحوّل إلى HTTPS.
- بعد تجديد الشهادة: أعد نسخ الملفين، ثم `docker compose -p attackwise restart web` أو `./attackwise.sh up`.

## فحص الصحة

```sh
./attackwise.sh verify                          # عبر المنفذ المحلي
./attackwise.sh verify https://<your-domain>    # عبر الدومين العام
./attackwise.sh status
```

`verify` يفحص من نفس عنوان الواجهة:
- الصفحة الرئيسية وسياسة الكاش، وملف JavaScript فعلي.
- ملف غير موجود يرجع 404، وليس صفحة HTML.
- `version.json`، و`/api/v1/health`، وفهرس ATT&CK، وحزمة Enterprise حقيقية.
- مسار API غير موجود يرجع `404` بصيغة `{"error":{"code":"not_found",…}}`.

لتخطي تنزيل الحزمة الكبيرة: `ATTACKWISE_VERIFY_BUNDLE=0 ./attackwise.sh verify`.

## التحديث

```sh
cd /opt/attackwise/releases
sha256sum -c attackwise-<NEW>-linux-amd64.tar.gz.sha256 && tar -xzf attackwise-<NEW>-linux-amd64.tar.gz
cd attackwise-<NEW>-linux-amd64
./attackwise.sh load && ./attackwise.sh up
```

- لا تشغّل `init` في التحديث.
- ملف الإعداد والمفتاح والكاش (حجم `attackwise_attack-cache`) تبقى كما هي.
- احتفظ بمجلد الإصدار السابق للرجوع.

## الرجوع

**إلى إصدار سابق من هذه الحزمة:** صوره ما زالت محمّلة.

```sh
cd /opt/attackwise/releases/attackwise-<PREVIOUS>-linux-amd64
./attackwise.sh up
```

**إلى الموقع السابق (Angular):**
1. نفّذ `./attackwise.sh down`. هذا يوقف الحاويات ويحذفها فقط، والحجم والإعداد يبقيان.
2. أعد تشغيل الخدمة السابقة على **نفس الدومين والمنفذ**.

خطط المستخدمين محفوظة في متصفحاتهم (`localStorage`) بنفس الصيغة، فتظهر في Angular بعد الرجوع. جُرّب هذا محليًا بالترتيب Angular ثم Vue ثم Angular.

لا تستعمل `docker compose down -v`، ولا تحذف الحجم `attackwise_attack-cache`، ولا ملف الإعداد.

## ملاحظات تشغيلية

- **الخطط والاستيراد والتصدير** تبقى في متصفح المستخدم، والخادم لا يستقبل أي ملف.
- **يجب تقديم Vue على نفس أصل الموقع الحالي** (البروتوكول والدومين والمنفذ)، حتى يرى المستخدمون خططهم المحفوظة.
- **CORS** معطّل افتراضيًا، فلا يلزم لأن الواجهة والـ API على نفس الأصل. فعّله فقط إذا احتاجه موقع آخر، عبر `ATTACKWISE_FRONTEND_ORIGINS`.
- **السجلات:** `./attackwise.sh logs` (stdout/stderr للحاويتين). Laravel لا يكتب ملفات سجل.
- **الاعتماديات:** لا قاعدة بيانات، ولا جلسات، ولا طوابير، ولا خدمات إضافية.

## الإصدار الذي اختُبر محليًا

حزمة `2026.11.21-ca2d3d4` مبنية لـ Linux amd64 من `ca2d3d4`. بصمة الأرشيف الموزّع هي `ea8170e690b8e77060abb646b0278f9466fc3e538b9e7204e56f3ec4746b9ea1`. أُعيد تحميل صور الأرشيف، واجتاز مسار المستخدم على الحاويتين اختبار المصفوفة Enterprise 20.1 وتعديل الخطة وإعادة فتحها وJSON وWord والطباعة. نجح فحص HTTP وفحص TLS المدمج بشهادة اختبار، وبقيت بصمة الحزمة المخزنة على القرص مطابقة بعد إعادة إنشاء الحاويتين. حافظ أمر init على ملف إعداد المفتاح عند تكراره.

عند الانتقال من Angular، اضبط صفحة HTML القديمة على إعادة التحقق قبل التحويل، وامسح نسختها من كاش الوكيل أو CDN عند التبديل. افحص في متصفح استعمل الموقع سابقًا واحتفظ بنفس الأصل وبيانات الموقع. بروفة التحويل المحلية أعادت خطتين مصطنعتين إلى Angular مع تعديل Vue. أدلة الإصدار في `attackwise/docs/migration/evidence/production-ca2d3d4/`. اختبر الدومين والشهادة الفعليين وتوجيه الوكيل بعد ضبط خادمك.
