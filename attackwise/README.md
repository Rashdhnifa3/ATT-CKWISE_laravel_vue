# ATT&CKWISE: نسخة Vue + Laravel (قيد المراجعة، غير مدموجة)

- التطبيق الأصلي (Angular، ATT&CK Navigator 5.3.2 مع طبقة التخطيط ATT&CKWISE) باقٍ كما هو في `../nav-app`، وهو المرجع.
- هذا المجلد يضم النسخة الجديدة على الفرع `attackwise-vue-migration`:
  - `frontend/`: ‏Vue 3 مع TypeScript strict وVite.
  - `backend/`: ‏Laravel 13. API قراءة فقط لبيانات ATT&CK الرسمية.
  - `shared/`: العقد، وبيانات D3FEND، والملفات الاصطناعية للاختبار.
  - `docs/`: التوثيق.
- لم يُستبدل الموقع ولم يُنشر شيء. القرار لصاحب المشروع.

| الوثيقة | المحتوى |
|---|---|
| `docs/migration/RUNNING.md` | تشغيل الأصل والجديد على منافذ منفصلة، والاختبارات من checkout نظيف، وأثر المنفذ على الخطط المحفوظة |
| `docs/migration/CURRENT_PARITY.md` | سجل التطابق: كل سلوك، مع دليله وحالته |
| `docs/migration/FINAL_REPORT.md` | نتائج التحقق والفروق المتبقية وحالة الجاهزية |
| `docs/migration/evidence/` | سجلات الاختبارات وتقارير المقارنة، ببيانات عامة أو اصطناعية |
| `docs/migration/handoff/` | تعليمات الترحيل الأصلية: START وSCOPE وVERIFY |

الوثائق القديمة (`FEATURE_INVENTORY.md` و`SOURCE_AUDIT.md` و`BASELINE_RESULTS.md` و`MIGRATION_PLAN.md` و`audit/`) محفوظة كمرجع تاريخي. يختلف بعضها عن الحالة الحالية:
- كانت تستبعد ميزة Plan، وهي ضمن النطاق الآن.
- تذكر فرعًا قديمًا اسمه `migration/attackwise-vue-laravel`.
- تفترض نقل واجهة Navigator الكلاسيكية.

التفاصيل في آخر `CURRENT_PARITY.md`.

## تشغيل سريع

```sh
(cd backend && composer install && cp .env.example .env && php artisan key:generate && php artisan serve --host=127.0.0.1 --port=8000)
(cd frontend && npm ci && npm run build && npm run preview)   # http://127.0.0.1:4174
```

الخطط تُحفظ في `localStorage` لكل أصل، أي لكل بروتوكول ومضيف ومنفذ. لذلك لا تظهر خطط Angular المحفوظة على منفذ آخر. انظر RUNNING.md.
