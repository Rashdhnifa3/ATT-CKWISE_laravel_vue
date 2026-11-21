# سجل التطابق الحالي: Angular (المرجع) ← Vue + Laravel

- **المرجع:** `nav-app` عند `a48b9e0` بكل ما يظهر للمستخدم اليوم: ATT&CK Navigator 5.3.2 مع طبقة التخطيط ATT&CKWISE.
- **النسخة الجديدة:** الفرع `attackwise-vue-migration`.
- **الأولوية عند التعارض:** التطبيق الحالي وبياناته يتقدّمان على الوثائق القديمة. انظر قسم «تعارض مع الوثائق القديمة» في الأسفل.
- **Plan ضمن النطاق.** ميزة التخطيط (الخطط، D3FEND، التقارير، الواجهة العربية) جزء من هذا الترحيل. الوثائق القديمة `BASELINE_RESULTS.md` و`SOURCE_AUDIT.md` كانت تستبعدها، لكن `SCOPE.md` يجعل المرجع «nav-app الحالية بكل مساراتها»، وهذه الميزة هي الواجهة الوحيدة التي يراها المستخدم.

## الرموز

### الإتاحة (أول السطر في عمود السلوك)

| الرمز | المعنى |
|---|---|
| «افتراضي» | يظهر بإعداد `config.json` الافتراضي دون أي رابط أو ملف |
| «إعداد» | يحتاج قيمة في `config.json`، مثل `versions` و`banner` و`default_layers` و`taxii_url` و`authentication` |
| «رابط» | يحتاج جزءًا من الرابط بعد `#`، مثل `layerURL` و`bundleURL` و`subtechniques` و`leave_site_dialog` |
| «ملف» | يحتاج فتح ملف خطة أو طبقة |
| «بلا مسار» | موجود في مصدر Angular، لكن لا يوجد زر أو رابط أو إعداد يصل إليه من الواجهة الحالية (دليل U1–U4) |

### الحالة

| الحالة | المعنى |
|---|---|
| **متحقَّق** | منفَّذ في Vue، ونفس المدخلات تعطي نفس النتيجة في Angular وVue، إما في اختبار مقارنة مباشر أو في نفس مواصفة Playwright للأصل |
| **منفَّذ** | منفَّذ في Vue لكنه لم يُقارَن مع Angular، أو اختُبر على Vue وحدها |
| **فاشل** | يعطي نتيجة مختلفة عن المرجع أو يتعطل |
| **محجوب** | لا يمكن التحقق منه في هذه البيئة، ويُذكر السبب |
| **غير قابل للوصول** | «بلا مسار» في المرجع. لم يُنقل كواجهة، ونُقل نموذج البيانات فقط حيث يلزم لفتح الملفات وحفظها |

### الاختبارات (المسارات نسبةً إلى `attackwise/`)

| الرمز | الاختبار |
|---|---|
| **T-diff** | `frontend/tests/unit/differential.spec.ts`: وحدات المرجع مستوردة مباشرة من `nav-app/src`، مقابل نسخ Vue على نفس المدخلات |
| **T-parse** | `frontend/tests/unit/parse-differential.spec.ts`: ‏`DataService` المرجع مقابل `DataService` في Vue، على بيانات اصطناعية وعلى Enterprise 20.1 الحقيقية |
| **T-dom** | `frontend/tests/unit/domain.spec.ts` (على Vue وحدها) |
| **T-comp** | `frontend/tests/unit/components.spec.ts`: مكوّنات Vue وحدها |
| **R:‹اسم›** | `frontend/tests/e2e/reference/‹اسم›.spec.ts`. هي نسخة من `nav-app/e2e/‹اسم›.spec.ts` تغيّرت فيها مسارات الاستيراد فقط، ويتحقق من ذلك الأمر `scripts/sync-reference-specs.mjs --check`. تنجح على Angular (خط الأساس) وعلى ناتج بناء Vue |
| **C:real** | `frontend/tests/e2e/compat/real-data.spec.ts`: بيانات Enterprise الحقيقية، 5 تكرارات |
| **C:file** | `compat/file-roundtrip.spec.ts`: ملفات قديمة في التطبيقين، ثم فتح تصدير كل تطبيق في الآخر |
| **C:store** | `compat/storage-same-origin.spec.ts`: أصل واحد بالترتيب Angular ← Vue ← Angular |
| **C:ui** | `compat/ui-parity.spec.ts`: شجرة الوصول وفرق البكسل ولوحة المفاتيح |
| **C:docx** و**C:net** | `compat/exports-and-network.spec.ts` |
| **C:links** | `compat/deep-links-and-config.spec.ts` |
| **C:taxii** | `compat/taxii-and-auth.spec.ts` |
| **C:extras** | `compat/planning-extras.spec.ts` |
| **C:print** | `compat/print-parity.spec.ts`: ملفات PDF من طباعة Chromium في التطبيقين |
| **API** | `backend/tests/Feature/AttackApiTest.php` |

الأدلة في `docs/migration/evidence/`:
- `final/`: سجلات التشغيل النهائي.
- `compat/`: تقارير المقارنة.
- `baseline/`: حالة الأصل قبل العمل وسجلات اختباراته.
- `diffs/`: الفروق المكتشفة وتسجيلها قبل إصلاح Vue.

### أدلة عدم الوصول

- **U1 — فرع Navigator الكلاسيكي.**
  - **الدليل:**
    - في `nav-app/src/app/tabs/tabs.component.html:14` يظهر الاستعمال الوحيد لـ `<DataTable>`، وفيه `[planning]="true"` قيمة ثابتة.
    - في `datatable/data-table.component.html:1` يأتي `<wise-planning *ngIf="planning">`. الأسطر 2 إلى 891 داخل `<ng-container *ngIf="!planning">`، وتضم:
      - شريط الأدوات؛
      - المصفوفات side وflat وmini؛
      - الـ tooltip وقائمة السياق والـ legend؛
      - الـ sidebar، وفيه البحث وإعدادات الطبقة ومراجعة الترقية؛
      - أزرار التصدير: JSON لكل الطبقات (السطر 192)، وExcel (الأسطر 202 و205 و213)، وSVG ‏(`exportRender`، السطر 227).
    - `@Input() planning` لا يكتبه أي شيء آخر. الأمر `grep "\[planning\]"` يعطي `tabs:14`، واستعمالًا داخليًا في `matrix-flat` الموجود هو نفسه داخل الفرع الكلاسيكي.
    - مفاتيح `features` في `config.json` لا تقرأ `planning` ولا تكتبه، وكذلك أجزاء الرابط ومفاتيح التخزين. هذه المفاتيح هي `export_render` و`export_excel` و`layer_settings` و`search` و`sorting` وغيرها، وكلها تتحكم بعناصر داخل الفرع الكلاسيكي نفسه.
    - مواصفات المرجع `layer.spec` و`selection.spec` و`layer-comparison.spec` تفشل على Angular نفسه لأنها لا تجد «Create New Layer» (`evidence/final/ref-e2e.log`). وتفشل بنفس الطريقة على Vue (`evidence/final/vue-legacy-ui.log`).
  - **ما قد يغيّر الحكم:** تعديل المصدر فقط، مثل `[planning]="false"` أو مسار جديد. لا يوجد إعداد أو رابط أو قيمة تخزين وقت التشغيل تفتح هذا الفرع.
- **U2 — أدوات التبويبات الكلاسيكية.**
  - قالب `tabs` لا يحتوي على شريط تبويبات، ولا لوحة «new layer» لكل مجال، ولا «More Options»، ولا «Open existing layer» بالرابط، ولا نموذج «Create layer from other layers»، ولا رابط الطبقة المخصص.
  - هذه الدوال لا يربطها أي قالب (بحث `grep` في `*.html` لا يجد شيئًا): `closeTab` و`layerByOperation` و`getLayerLink` و`addLayerLink` و`copyLayerLink` و`filterDomains` و`openSVGDialog`.
  - الدوال المربوطة من الواجهة الحالية:
    - `newBlankTab` من الشعار و«New plan»؛
    - `selectTab` من قائمة الخطط؛
    - `openUploadPrompt` و`loadLayerFromFile` من «Open plan»؛
    - `createPlan` و`resumePlan` و`deleteSavedPlan` و`setView` و`nextStep`؛
    - إضافة إلى `loadTabs`، الذي يعالج الروابط والطبقات الافتراضية.
- **U3 — نوافذ Help وLayer information.**
  - `openDialog('help')` و`openDialog('layers')` لا يستدعيهما أحد.
  - النافذة الوحيدة من هذا النوع التي تُفتح هي `'changelog'`، من `app.component.html:5` (زر «MITRE ATT&CK® Navigator v5.3.2») ومن `tabs.component.ts:911` (زر CHANGELOG في إشعار فرق الإصدار الصغير).
- **U4 — واجهة مراجعة الترقية.**
  - نافذة «Upgrade layer version?» تظهر فعلًا.
  - عند «Yes» يستدعي المرجع `openSidebar('layerUpgrade')`، لكن الـ sidebar موجود داخل فرع U1 فلا يُعرض أبدًا.
  - ما يصل للمستخدم هو طبقة على الإصدار الجديد، نُسخت فيها التعليقات تلقائيًا عبر `initCopyAnnotations`. هذا متحقَّق (C:file، الحالة v19-Yes).

## سجل التطابق

### نقطة الدخول والتخطيط والخطط (إضافات ATT&CKWISE)

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| P-01 «افتراضي» الصفحة الأولى وإنشاء خطة Enterprise | `tabs.component.html` (`wise-home`)، `tabs:createPlan`، `latestEnterpriseDomain` | فتح الموقع، كتابة اسم (حتى 100 حرف)، ثم «Start Threat Assessment» | تُحمَّل أحدث نسخة Enterprise مُعدّة، وتُفتح الخطة على عرض Attack. عند الفشل تظهر «Unable to load ATT&CK. Check your connection and try again.» ويمكن إعادة المحاولة | `App.vue` و`workspace.createPlan` | R:attackwise (إعادة المحاولة، أحدث إصدار)، R:plan-autosave، C:ui (home)، C:real | متحقَّق |
| P-02 «افتراضي» إنشاء أول خطة تلقائيًا | `tabs:ngAfterViewInit` | فتح الموقع بلا خطط محفوظة وبلا `#` | تُنشأ «Enterprise Threat Plan» (أو «خطة تهديدات المؤسسة» بالعربية). أي `#` في الرابط يمنع ذلك | `workspace.afterViewInit` | C:links (حالات `#subtechniques=false` وحدها، و`default_layers`)، C:real | متحقَّق |
| P-03 «افتراضي» الخطط المحفوظة: الاستئناف والحذف بتأكيد | `tabs:resumePlan`، `deleteSavedPlan` | «Your saved plans» ثم اختيار خطة، أو ✕ ثم «Delete» أو «Cancel» | تُفتح الخطة بنفس الـ `planId`، والحذف يحتاج تأكيدًا | `workspace.resumePlan` و`deleteSavedPlan` | R:plan-autosave، C:store، C:net (الخطة تظهر بعد إعادة التحميل) | متحقَّق |
| P-04 «افتراضي» التنقل بين الخطط المفتوحة | `tabs.component.html` (`workspace-tools`) | «New plan» أو الشعار يفتح الصفحة الأولى، وقائمة «Plan» للتبديل | تبويب فارغ أو الخطة المختارة | `workspace.newBlankTab` و`selectTab` | C:links (قائمة الخطط والخطة النشطة في 14 حالة)، C:file | متحقَّق |
| P-05 «افتراضي» عرض Attack: أعمدة التكتيكات والعدد، 20 تقنية لكل عمود، «Show more techniques» يضيف 20 | `planning.component.html`، `columnVisible`، `columnLimits` | فتح خطة والنقر على «Show more techniques» | نفس الأعمدة والأعداد وترتيب المعرّفات | `PlanningView.vue` و`usePlanning.ts` | C:real (التكتيكات والعدد والعمود الأول)، C:extras | متحقَّق |
| P-06 «افتراضي» البحث عن التقنيات في الترويسة | `ui.search`، `columnTechniques` | كتابة T1566، أو «phishing»، أو نص لا يطابق شيئًا، ثم المسح | التصفية تشمل التقنيات الفرعية والاسم العربي | `ui.search` و`usePlanning` | C:extras | متحقَّق |
| P-07 «افتراضي» مرشّح التكتيك بعرض كامل | `tacticFilter`، `scrollTactic` | اختيار تكتيك | عمود واحد | `usePlanning` | R:planning-refinements | متحقَّق |
| P-08 «افتراضي» اختيار تقنية أو تقنية فرعية، ولوحة التقييم من 0 إلى 10 (Save وSkip وClear score وEsc) | `toggle`، `edit`، `saveScore`، `clearScore` | النقر على بطاقة، إدخال درجة، ثم Save أو Skip | درجة صحيحة من 0 إلى 10، والزر معطّل عند الفراغ. الاختيار مستقل بين الأب والابن | `usePlanning` | T-comp، C:ui، C:real، C:extras (Clear score) | متحقَّق |
| P-09 «افتراضي» تلوين البطاقة بمستوى الدرجة (`data-risk`) | `scoreStyle`، `scoreLevel` | تقييم 0 و3 و7 و10 | ‏low وmedium وhigh، والقيمة missing دون تقييم | `planning-state.ts` (منسوخ) | T-diff (`validScore`/`scoreStyle`)، R:planning-refinements | متحقَّق |
| P-10 «افتراضي» زر «Clear» لكل الاختيارات والدرجات | `planning:clear` | تحديد تقنيتين ثم «Clear» | «0 Selected»، ولا بطاقة مضغوطة | `usePlanning.clear` | C:extras | متحقَّق |
| P-11 «افتراضي» عرض Defensive: قائمة الهجمات، والدفاعات المرتبطة مباشرة وعبر الأب، والحالة | `planning.component.ts` (`defenses`، `isDefenseChosen`) | «Defensive Plan»، اختيار هجوم ثم دفاع وتقييمه | نفس عدد النتائج ونفس الدفاعات لـ T1566، و«covered» بعد الاختيار | `usePlanning` | C:real (`resultsCount` و`phishingDefenses`)، C:ui، T-comp | متحقَّق |
| P-12 «افتراضي» بحث الدفاعات ومرشّح All وSelected وOfficial وD3FEND وCustom | `defenseFilter` | كتابة نص واختيار مرشّح | نفس القوائم | `usePlanning` | R:planning-refinements | متحقَّق |
| P-13 «افتراضي» بيانات D3FEND المحلية: تطابق المعرّف حرفيًا، بلا وراثة من الأب، بلا تكرار، مع حفظ الدليل | `planning/d3fend-data.ts`، `d3fend.service.ts`، `assets/d3fend/attack-d3fend.json` | اختيار هجوم له علاقات D3FEND | نفس الفهرس، والاستيراد يعيد إنتاج نفس الملف | `planning/d3fend*.ts`، والأصل منسوخ بنفس sha ‏`1c8cd33…`، و`scripts/import-d3fend.mjs` | T-diff (نفس الفهرس، رفض الصيغ الأخرى)، R:d3fend-mapping (4 اختبارات) | متحقَّق |
| P-14 «افتراضي» دفاعات مخصصة: إنشاء وتحقق وتعديل وحذف ينظّف كل المراجع | `addCustom`، `saveCustom`، `deleteCustom` | «Add custom defense»: اسم ودرجة وهجمات | رسائل التحقق نفسها، والحذف يزيل المعرّف من كل الحالة | `usePlanning` | T-comp، R:attackwise (عبر JSON)، R:planning-refinements | متحقَّق |
| P-15 «افتراضي» الربط اليدوي بين دفاع وهجوم | `linkDefense`، `toggleCustomAttack` | ربط دفاع غير مرتبط بهجوم | يُحفظ ويبقى بعد التحديث وفي JSON | `usePlanning` | R:planning-refinements | متحقَّق |
| P-16 «افتراضي» معادلات الخطر (strongest وaverage وsum)، والتقريب لمنزلتين، والفرق بين «Not Rated» والصفر، والنتائج السالبة، وحصر المؤشر | `planning/risk-calculation.ts` | تغيير «Risk formula» | نفس القيم لكل تركيبة | `risk-calculation.ts` (منسوخ) | T-diff (كل التركيبات، بما فيها الغائب والصفر والسالب والحدود)، R:risk-calculation، T-comp | متحقَّق |
| P-17 «افتراضي» عرض Final: جدول التقرير، المؤشر، الرسم التفاعلي | `planning.component.html` (`report-table`، `gauge`، `chart`) | «Final Plan» | نفس الجدول والقيم | `PlanningView.vue` | C:ui (final)، R:planning-refinements (الرسم)، C:docx | متحقَّق |
| P-18 «افتراضي» تقرير Word (.docx) بالعربية والإنجليزية | `planning/reference-report.ts` | «Export Word report (.docx)» | ملف بنفس الاسم والجداول والنص والرسم | `reference-report.ts` (منسوخ) و`docx` 9.15.4 | C:docx: ‏`document.xml` متطابق بايتًا ببايت، وصورة الرسم PNG متطابقة، بالعربية والإنجليزية (`evidence/compat/docx-report.json`) | متحقَّق |
| P-19 «افتراضي» «Download plan JSON» | `data-table:saveLayerLocally` | زر التنزيل في Final | طبقة 4.5 مع امتداد `attackwise` | `workspace.saveLayerLocally` | C:file، C:real، R:lovable-integration | متحقَّق |
| P-20 «افتراضي» «Print / PDF» | `planning:printReport` (`window.print()`) | النقر على الزر | يُستدعى `window.print` مرة واحدة | `usePlanning.printReport` | C:extras (مع إيقاف نافذة الطباعة) | متحقَّق |
| P-21 «افتراضي» شكل الصفحة المطبوعة | قواعد `@media print` في `planning.scss` و`shell.scss` | طباعة Final Plan بالعربية والإنجليزية: خطة صغيرة، وخطة كبيرة فيها 42 هجومًا على 3 صفحات، ومع خلفيات الرسوم أو بدونها | صفحات A4، والجدول باتجاه RTL في العربية. ترويسة الجدول تتكرر في كل صفحة ولا ينقسم صف بين صفحتين. أزرار الأدوات مخفية. مع تفعيل «Background graphics» تبقى الخلفية الداكنة ويصعب قراءة أسماء التقنيات في الجدول، وهذا سلوك الأصل نفسه. الافتراضي في Chrome بلا خلفيات وواضح | ملفات SCSS منسوخة كما هي | C:print (`print-parity.spec.ts`): نفس عدد الصفحات ونفس النص (`pdftotext`) وفرق بكسل 0 في 6 حالات. الصفحات فُحصت بصريًا | متحقَّق |
| P-22 «افتراضي» «Color Blind Friendly» وحفظه | `colorBlind`، `preference()`، ومفتاح `attackwise-color-blind` | تفعيل الخيار ثم إعادة التحميل | الصنف `color-blind` موجود والقيمة `'true'` محفوظة | `usePlanning` | C:extras | متحقَّق |
| P-23 «افتراضي» الحفظ التلقائي: عند كل تغيير، وعند `pagehide` و`visibilitychange` | `planning:changed`، و`@HostListener` في `tabs:saveAllPlans` | أي تعديل، ثم إغلاق الصفحة | الخطة محفوظة بالاسم | `usePlanning.changed` و`App.vue` | R:plan-autosave، C:store، T-comp | متحقَّق |
| P-24 «افتراضي» العربية والإنجليزية، RTL وLTR، والحفظ في `attackwise-language` | `planning-ui.service.ts` | زر «ع/EN» | تتغيّر قيمة `dir` والنصوص | `planning/ui.ts` | C:ui (عربي وإنجليزي، شجرة وصول متطابقة، صفر بكسل فرق)، R:lovable-integration | متحقَّق |
| P-25 «افتراضي» الثيمان Midnight Indigo وBlack & Orange، والحفظ في `attackwise-theme` | `ui.setTheme`، `attackwise-tokens.scss` | قائمة الألوان | نفس الألوان | `ui.ts` و`styles/*` (منسوخة) | C:ui (الثيمان)، R:planning-refinements | متحقَّق |
| P-26 «افتراضي» الأيقونات ونصوصها | `planning-icon.component.ts` | سطح المكتب والهاتف | ‏SVG بـ `aria-hidden` | `AwIcon.vue` | R:planning-icons، T-comp | متحقَّق |
| P-27 «افتراضي» الهاتف (390px) وسطح المكتب (1440px)، دون تمرير أفقي | `shell.scss` و`planning.scss` | المقاسان | نفس التخطيط | نفس SCSS | C:ui (20 لقطة، فرق البكسل = 0، `overflow` متطابق) | متحقَّق |
| P-28 «افتراضي» لوحة المفاتيح والتركيز | عناصر HTML الأصلية | Tab ×12، ثم Enter على زر اللغة | نفس ترتيب التركيز ونفس الإطار، وEnter يبدّل الاتجاه | نفس العناصر بنفس الترتيب | C:ui (keyboard) | متحقَّق |
| P-29 «افتراضي» رسالة فشل الحفظ | `planning:changed` و`storageMessage` | التخزين ممتلئ أو معطّل | «Browser storage unavailable. Download your plan to keep it.» | `usePlanning` | C:store، T-comp | متحقَّق |
| P-30 «افتراضي» الأداء (الوسيط من 5 تكرارات، نفس الجهاز) | — | فتح المصفوفة، ثم اختيار وتقييم، ثم استيراد | انظر FINAL_REPORT | — | C:real (`evidence/compat/metrics-real-data.json`) | متحقَّق (Vue أسرع في الخطوات الثلاث) |

### التخزين المحلي

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| ST-01 «افتراضي» المفاتيح والصيغة: `attackwise-plans` = ‏`[{id,name,updated,data}]` | `planning/plan-storage.service.ts` | أي حفظ | مصفوفة مرتبة بالأحدث | `planning/plan-storage.ts`، بنفس المفاتيح والصيغة | C:store، T-dom | متحقَّق |
| ST-02 «افتراضي» نفس الأصل بالترتيب Angular ← Vue ← Angular | — | خطتان في Angular، ثم Vue: استعادة وتعديل وإعادة تحميل، ثم Angular | البيانات المتوقعة موجودة بعد الرجوع، والتعديل من Vue يظهر | — | C:store (`evidence/compat/storage-same-origin.json`) | متحقَّق |
| ST-03 «افتراضي» نقل المسودة القديمة `attackwise-draft` مرة واحدة ثم حذفها | `migrateLegacyDraft` | وجود المفتاح القديم | تتحوّل إلى خطة ويُحذف المفتاح | نفس الخوارزمية | C:store، T-dom | متحقَّق |
| ST-04 «افتراضي» فشل الكتابة | `save()` يعيد `false` | حصة ممتلئة | رسالة P-29، والتطبيق لا يتعطل | نفس السلوك | C:store، T-comp، T-dom | متحقَّق |
| ST-05 «افتراضي» قيمة `attackwise-plans` غير مقروءة | `plan-storage.service.ts:list/save` | JSON تالف في المفتاح | تُستبدل القيمة التالفة عند أول حفظ، فتضيع | تُنسخ مرة واحدة إلى `attackwise-plans-unreadable-backup` قبل أول كتابة، ثم نفس سلوك المرجع | C:store يسجّل النتيجتين، وT-dom | متحقَّق، مع فرق مقصود: تقوية تحفظ البيانات. لا أثر عند الرجوع لأن Angular يتجاهل المفتاح الاحتياطي |
| ST-06 «افتراضي» مدخلات لا تطابق صيغة الخطة داخل المصفوفة | `plan-storage.service.ts` | مدخل غريب في المصفوفة | يُحذف عند أول حفظ | يبقى كما هو | T-dom (Vue وحدها) | منفَّذ، مع فرق مقصود. عند الرجوع إلى Angular يُحذف المدخل في أول حفظ، كما في السابق |
| ST-07 «افتراضي» أصل مختلف (منفذ آخر) | `localStorage` لكل أصل | فتح Vue على منفذ آخر | لا تظهر الخطط، ولا تضيع | نفس السلوك | C:store («Different port shows no plans»). الشرح في RUNNING.md | متحقَّق |
| ST-08 «افتراضي» مفاتيح التفضيلات `attackwise-language` و`attackwise-theme` و`attackwise-color-blind` | `planning-ui.service.ts`، `planning.component.ts` | تغيير اللغة والثيم والخيار | تُحفظ وتُستعاد | `ui.ts` و`usePlanning` | C:ui، C:extras، R:planning-refinements | متحقَّق |
| ST-09 «إعداد» بيانات اعتماد `authentication` لا تُخزَّن | — | إعداد مصدر بمفتاح | المفتاح لا يُكتب في `localStorage` | نفس السلوك | C:taxii (`keyInLocalStorage=false` في 7 حالات) | متحقَّق |

### الخادم Laravel (API القراءة فقط) والشبكة

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| A-01 `GET /api/v1/health` | `shared/contracts/api.md` | — | (لا يوجد في Angular) | `HealthController` | API | متحقَّق (حسب العقد) |
| A-02 الفهرس: كاش مع TTL، ونسخة قديمة عند فشل المصدر، ورفض فهرس تالف | العقد، و`config.service.ts` (المرجع يقرأ GitHub مباشرة) | فتح الموقع | نفس JSON الفهرس | `AttackDataService` و`AttackIndexController` | API (5 اختبارات) | متحقَّق |
| A-03 الحزم `bundles/{domain}/{version}`: الإصدار الرئيسي يؤخذ من أول مدخل مدرج، والإصدار الفرعي بالضبط، والبايتات محفوظة، والكاش يُعاد استعماله | العقد، و`parseCollectionIndex` | فتح خطة | — | `AttackBundleController` (يمرّر `{"data":…}` كتدفق) | API، وC:real (Enterprise 20.1 بـ 26,699 كائن، متطابقة بايتًا ببايت) | متحقَّق |
| A-04 مجال أو إصدار غير موجود يعطي 404، ومُعامِل غير صالح يُرفض قبل أي طلب | العقد | — | — | تحقق داخل `AttackDataService` | API | متحقَّق |
| A-05 أخطاء المصدر تعطي 502 بالشكل `{error:{code,message}}`، ولا تُخزَّن | العقد | — | — | `bootstrap/app.php` | API | متحقَّق |
| A-06 لا جلب من مضيف خارج القائمة المسموحة (افتراضيًا `raw.githubusercontent.com`)، وhttps فقط | العقد | — | — | `ATTACKWISE_ALLOWED_HOSTS` | API | متحقَّق |
| A-07 CORS للأصول المُعدّة فقط | العقد | — | — | `config/cors.php` | API | متحقَّق |
| A-08 لا يوجد مسار يقبل طبقات أو ملفات أو روابط من المستخدم (لا وسيط URL مفتوح) | العقد، و`SCOPE.md` | — | — | `routes/api.php` | API (`test_there_is_no_endpoint_that_accepts_user_layers`) | متحقَّق |
| A-09 محتوى المستخدم يبقى في المتصفح أثناء الاستيراد والتعديل والحفظ والتصدير | `SCOPE.md` | استيراد طبقة فيها علامة خاصة، ثم تعديل وحفظ وJSON وDOCX | — | — | C:net: كل الطلبات GET لنفس الأصل أو للـ API القرائي، ولا جسم للطلبات، والعلامة غير موجودة في أي طلب (`evidence/compat/network-audit.json`) | متحقَّق |
| A-10 «إعداد» المصادر المخصصة وTAXII تُجلب من المتصفح مباشرة، لا عبر Laravel | العقد | — | — | `DataService.getDomainData` | C:taxii، C:links | متحقَّق |
| A-11 ترويسات الطلبات التي كانت عبر `HttpClient`: ‏`Accept: application/json, text/plain, */*` | سلوك Angular HttpClient الافتراضي | — | — | `httpClientInit` في config وبيانات المصادر المخصصة والروابط والـ D3FEND والـ Changelog | C:taxii. الفرق الذي اكتُشف ثم أُصلح مسجّل في `evidence/diffs/taxii-auth-accept.txt` | متحقَّق |

### بنود الجرد السابق: الواجهة (UI-001 إلى UI-091)

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| UI-001 «افتراضي/رابط/إعداد» التنقل الأولي | `tabs:constructor`، `loadTabs`، `ngAfterViewInit` | فتح الموقع، أو مع `default_layers`، أو مع `#layerURL` فاشل | تبويب فارغ ثم خطة تلقائية أو طبقات افتراضية. عند فشل الرابط: ‏alert «ERROR retrieving layer from …» ثم الصفحة الأولى | `workspace.boot` و`loadTabs` و`afterViewInit` | C:links (14 حالة) | متحقَّق |
| UI-002a «افتراضي» طبقة جديدة في المجال الحالي (Enterprise) | `tabs:newLayer`، `latestDomains` | «Start Threat Assessment» | خطة Enterprise على أحدث إصدار | `workspace.createPlan` | R:attackwise، C:real | متحقَّق |
| UI-002b «بلا مسار» أزرار Enterprise وMobile وICS لإنشاء طبقة | لوحة new-tab الكلاسيكية | — | غير معروضة (U2) | لم تُنقل | U2 | غير قابل للوصول |
| UI-002c «ملف» فتح طبقة لمجال غير Enterprise (Mobile) | `tabs:readJSONFile` (حارس Enterprise-only) | فتح `layer-mobile.json` | لا تُفتح، وتظهر snackbar: «Only Enterprise ATT&CK plans are supported in this workspace.» | نفس الحارس | C:file | متحقَّق |
| UI-003 «بلا مسار» طبقات إصدارات أقدم من «More Options» | `tabs:filterDomains` | — | غير معروضة (U2) | لم تُنقل. فتح ملفات الإصدارات الأقدم متاح (J08) | U2 | غير قابل للوصول |
| UI-004 «رابط» مجموعة أو حزمة مخصصة | `tabs:newLayerFromURL`، `validateInput` | ‏`#bundleURL=…&version=14&domain=Enterprise-Attack` | طبقة «layer» على v14 من الحزمة المخصصة. بلا `domain` يُتجاهل الرابط ويُستعمل `layerURL` | `workspace.newLayerFromURL` | C:links (3 حالات). نموذج الواجهة الكلاسيكي U2 | متحقَّق |
| UI-005 «افتراضي» إضافة تبويب والتبديل | `tabs:openTab`، `newBlankTab`، `selectTab` | «New plan»، قائمة Plan، الشعار | انظر P-04 | `workspace` | C:links، C:file، C:ui | متحقَّق |
| UI-006 «بلا مسار» إغلاق التبويب | `tabs:closeTab`، `closeActiveTab` | — | لا زر للإغلاق (U2) | لم يُنقل كواجهة | U2 | غير قابل للوصول |
| UI-007a «رابط/ملف» تسمية الطبقة الفريدة | `tabs:getUniqueLayerName` | طبقة بلا اسم | «layer» ثم «layer1» … | `workspace.getUniqueLayerName` | T-dom، C:links (حالة bundleURL تعطي «layer») | متحقَّق |
| UI-007b «بلا مسار» إعادة التسمية من layer-settings | `layer-settings` | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| UI-008 «ملف» استيراد JSON محلي | `tabs:loadLayerFromFile`، `readJSONFile` | «Open plan» أو «↑ Open existing .json plan» | انظر J01–J11 | `workspace.readJSONFile` | C:file (10 ملفات وملف تالف)، R:attackwise | متحقَّق |
| UI-009 «رابط/إعداد» استيراد طبقة بعيدة | `tabs:loadLayerFromURL` | ‏`#layerURL` أو `default_layers` | تُفتح الطبقة، وعند الفشل alert | `workspace.loadLayerFromURL` | C:links. نموذج الرابط الكلاسيكي U2 | متحقَّق |
| UI-010 «رابط» قراءة أجزاء الرابط | `getNamedFragmentValue`، `loadTabs` | ‏`layerURL` مكرر، والأولوية bundleURL ثم layerURL ثم default_layers | ‏First، Pair A، Pair B (الأخيرة نشطة)، والأولوية كما في المرجع | نفس الخوارزمية | C:links، T-dom | متحقَّق |
| UI-011 «رابط/إعداد» سياسة الترقية للطبقات الافتراضية | `tabs:upgradeLayer(..., defaultLayers=true)` | طبقة v13 بالرابط بينما أحدث إصدار v14 | تُفتح على v13 دون نافذة ترقية | `workspace.upgradeLayer` | C:links (حالة «outdated layer from a start-up link») | متحقَّق |
| UI-012 «ملف» تنبيه فرق صيغة الطبقة | `tabs:versionMismatchWarning` | طبقة 4.3 أو 3.0 | فرق صغير: snackbar مع زر CHANGELOG. فرق كبير: النافذة تظهر **مرتين** (خلل في المرجع حُفظ كما هو) | نفس السلوك | C:file (الأحداث متطابقة) | متحقَّق |
| UI-013 «بلا مسار» تعبيرات الطبقات المشتقة | `tabs:layerByOperation`… | — | U2 | لم تُنقل | U2 | غير قابل للوصول |
| UI-014 «بلا مسار» وراثة الطبقات المشتقة | `tabs:opSettings` | — | U2 | لم تُنقل | U2 | غير قابل للوصول |
| UI-015 «بلا مسار» رابط Navigator المخصص | `tabs:getLayerLink`… | — | U2 | لم يُنقل | U2 | غير قابل للوصول |
| UI-016 «بلا مسار» نسخ الرابط المخصص | `tabs:copyLayerLink` | — | U2 | لم يُنقل | U2 | غير قابل للوصول |
| UI-017a «افتراضي» ثيمات ATT&CKWISE | `tabs.component.html` (`theme-picker`) | انظر P-25 | — | — | C:ui | متحقَّق |
| UI-017b «بلا مسار» ثيم Navigator (فاتح وداكن ونظام) | `app:themeChangeHandler`، `tabs:handleUserThemeChange` | — | لا عنصر في القالب يستدعي `handleUserThemeChange`. اختباران في Karma يفشلان في المرجع (`theme-override-light`، `theme-use-system`) | لم يُنقل. Vue تعرض النوافذ بالثيم الداكن مثل `theme-override-dark` | U2، و`evidence/final/ref-karma.log` | غير قابل للوصول |
| UI-018 «افتراضي/رابط» تحذير مغادرة الموقع | `app:promptNavAway` | إغلاق الصفحة بعد تفاعل، ومع `#leave_site_dialog=false` | prompt، ثم prompt، ثم لا prompt | `App.vue` | C:links | متحقَّق |
| UI-019 «افتراضي/إعداد» الترويسة والـ banner والتذييل | `tabs` و`app.component.html` | ‏`banner` في الإعداد | نص الـ banner حرفيًا، وزر الإصدار في التذييل | `App.vue` | C:links (banner)، C:ui | متحقَّق |
| UI-020 «بلا مسار» Help | `help` | — | U3 | لم يُنقل | U3 | غير قابل للوصول |
| UI-021a «افتراضي» Changelog | `changelog.component.html` | زر «MITRE ATT&CK® Navigator v5.3.2»، أو زر CHANGELOG في الـ snackbar | نافذة عنوانها h1 «Changelog»، و85 قسمًا و202 رابطًا، وتُغلق بـ close وEsc | `AppDialogs.vue` (marked + sanitizer) | C:links. الفرق (h3 بدل h1) سُجّل ثم أُصلح: `evidence/diffs/deep-links-changelog.txt` | متحقَّق |
| UI-021b «بلا مسار» مرجع صيغة الطبقة (layer-information) | `layer-information` | — | U3 | لم يُنقل | U3 | غير قابل للوصول |
| UI-022 «افتراضي» تنبيه توافق المتصفح | `tabs:ngAfterViewInit` (Safari 13 أو أقدم) | فتح الموقع في Safari 13 أو أقدم | نافذة «Browser compatibility» | `isSafariAtMost13` في `workspace` | لا يتوفر Safari 13 للاختبار. فحص IE في `svg-export` هو U1 | محجوب |
| UI-023 «بلا مسار» عدة مصفوفات في الجدول | حلقة المصفوفات في `datatable` | — | U1. عرض التخطيط يجمع تكتيكات المجال | — | U1. أعمدة التكتيكات متحقَّقة في P-05 | غير قابل للوصول |
| UI-024 «بلا مسار» مؤشر التحميل في الجدول | `datatable` spinner | — | U1. حالة التحميل الظاهرة هي «Loading ATT&CK…» على الزر (P-01) | — | U1 | غير قابل للوصول |
| UI-025 «بلا مسار» تخطيط side | `matrix-side` | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| UI-026 «بلا مسار» تخطيط flat | `matrix-flat` | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| UI-027 «بلا مسار» تخطيط mini | `matrix-mini` | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| UI-028 «بلا مسار» خيارات العناوين | `layer-settings`، `tactic-cell` | — | U1 | لم تُنقل. قيم `layout` محفوظة في الملف (L16) | U1 | غير قابل للوصول |
| UI-029 «بلا مسار» عدد التكتيكات وتنسيقها في المصفوفة | `matrix-common:getTacticBackground` | — | U1. عدد كل عمود في التخطيط متحقَّق (P-05) | — | U1 | غير قابل للوصول |
| UI-030 «بلا مسار» الاختيار الأساسي في المصفوفة | `matrix-common:onTechniqueLeftClick` | — | U1. اختيار التخطيط هو P-08 | — | U1 | غير قابل للوصول |
| UI-031 «بلا مسار» تفضيلات الاختيار | `datatable` selection_behavior | — | U1. القيم محفوظة في الملف (C:file) | — | U1 | غير قابل للوصول |
| UI-032 «بلا مسار» اختيار تكتيك كامل | `matrix-common:onTacticClick` | — | U1 | — | U1 | غير قابل للوصول |
| UI-033 «بلا مسار» الإبراز | `onTechniqueHighlight` | — | U1 | — | U1 | غير قابل للوصول |
| UI-034 «بلا مسار» توسيع الأب | `onToggleSubtechniquesVisible` | — | U1. توسيع البطاقة في التخطيط (`card-options`) متحقَّق في T-comp وC:ui | — | U1 | غير قابل للوصول |
| UI-035 «بلا مسار» التوسيع الجماعي | `datatable:expandSubtechniques` | — | U1 | — | U1 | غير قابل للوصول |
| UI-036 «بلا مسار» شارات التقنيات الفرعية | `technique-cell` | — | U1 | — | U1 | غير قابل للوصول |
| UI-037 «بلا مسار» أولوية مظهر الخلية | `matrix/cell.ts` | — | U1 | — | U1 | غير قابل للوصول |
| UI-038 «بلا مسار» أولوية خط التعليقات | `Cell:getTechniqueUnderlineColor` | — | U1 | — | U1 | غير قابل للوصول |
| UI-039 «بلا مسار» Tooltip | `technique-cell/tooltip` | — | U1 | — | U1 | غير قابل للوصول |
| UI-040 «بلا مسار» Tooltip مثبّت | `contextmenu:pinCell` | — | U1 | — | U1 | غير قابل للوصول |
| UI-041 «بلا مسار» إجراءات قائمة السياق | `contextmenu` | — | U1 | — | U1 | غير قابل للوصول |
| UI-042 «بلا مسار» روابط قائمة السياق | `contextmenu:viewTechnique`… | — | U1 | — | U1 | غير قابل للوصول |
| UI-043 «بلا مسار» عناصر قائمة السياق المخصصة | `context-menu-item.ts` و`custom_context_menu_items` | — | U1. المفتاح في الإعداد لا أثر له على الواجهة الحالية | — | U1 | غير قابل للوصول |
| UI-044 «بلا مسار» تنظيم شريط الأدوات | `datatable:setCurrentControlSection` | — | U1 | — | U1 | غير قابل للوصول |
| UI-045 «بلا مسار» تفضيلات شريط الأدوات | `datatable:handle*ControlsSettingsDropdown` | — | U1 | — | U1 | غير قابل للوصول |
| UI-046 «بلا مسار» شريط ثابت وتمرير | `datatable:updateStickyToolbar` (يتوقف في `ngAfterViewInit` إذا كان `planning`) | — | U1 | — | U1 | غير قابل للوصول |
| UI-047 «بلا مسار» مرشّحات المنصات | `datatable` filters | — | U1. ‏`filters` محفوظة في الملف (L11 وL12) | — | U1 | غير قابل للوصول |
| UI-048 «بلا مسار» أنماط الترتيب | `datatable` sorting | — | U1. ‏`sorting` محفوظ (L13) | — | U1 | غير قابل للوصول |
| UI-049 «بلا مسار» محرّر التدرّج | `datatable` colorSetup | — | U1. ‏`gradient` محفوظ (L15) | — | U1 | غير قابل للوصول |
| UI-050 «بلا مسار» لون خلفية التكتيك | `datatable` tacticRowColor | — | U1. القيمة محفوظة (L18) | — | U1 | غير قابل للوصول |
| UI-051 «بلا مسار» إخفاء المعطّل | `toggle_hide_disabled` | — | U1. ‏`hideDisabled` محفوظ | — | U1 | غير قابل للوصول |
| UI-052 «بلا مسار» محرّر التعليقات الجماعي | `datatable:onTechniqueSelect` | — | U1 | — | U1 | غير قابل للوصول |
| UI-053 «بلا مسار» تعديل حالة التفعيل | `setSelectedState` | — | U1. ‏`enabled` محفوظ (L07) | — | U1 | غير قابل للوصول |
| UI-054 «بلا مسار» تعديل اللون يدويًا | colorpicker | — | U1. ‏`color` محفوظ (L07) | — | U1 | غير قابل للوصول |
| UI-055 «بلا مسار» درجات Navigator الرقمية | `validateScoreInput` | — | U1. ‏`score` محفوظ (L07). درجات التخطيط هي P-08 | — | U1 | غير قابل للوصول |
| UI-056 «بلا مسار» التعليقات | comment textarea | — | U1. ‏`comment` محفوظ (L07) | — | U1 | غير قابل للوصول |
| UI-057 «بلا مسار» روابط وبيانات وصفية للتقنية | `list-input` | — | U1. القيم محفوظة (L07) | — | U1 | غير قابل للوصول |
| UI-058 «بلا مسار» الفواصل في القوائم | `list-input:addDivider` | — | U1. الفواصل محفوظة في الملف | — | U1 | غير قابل للوصول |
| UI-059 «بلا مسار» مسح التعليقات | resetSelectedTechniques | — | U1. زر «Clear» في التخطيط مختلف (P-10) | — | U1 | غير قابل للوصول |
| UI-060 «بلا مسار» بيانات الطبقة الوصفية وروابطها | `layer-settings` | — | U1. القيم محفوظة (C:file، `layer-v4.5-annotated`) | — | U1 | غير قابل للوصول |
| UI-061 «بلا مسار» إعدادات التجميع | `layer-settings` aggregate | — | U1 | — | U1 | غير قابل للوصول |
| UI-062 «بلا مسار» تحرير الـ legend | `datatable` legend | — | U1. ‏`legendItems` محفوظة (L18) | — | U1 | غير قابل للوصول |
| UI-063 «بلا مسار» حقول البحث وتوقيتها | `search-and-multiselect:query` | — | U1. بحث التخطيط هو P-06 | — | U1 | غير قابل للوصول |
| UI-064 «بلا مسار» التنقل في نتائج البحث | `search-and-multiselect` | — | U1 | — | U1 | غير قابل للوصول |
| UI-065 «بلا مسار» الاختيار من البحث | `select`، `selectAll` | — | U1 | — | U1 | غير قابل للوصول |
| UI-066 «بلا مسار» الاختيار المتعدد بالعلاقات (مجموعات، برمجيات، حملات…) | `getStixData`، `getRelated` | — | U1. البيانات تُحلَّل وتتطابق (D12) | دوال `used()` و`relatedTechniques()` لم تُنقل | U1، T-parse | غير قابل للوصول |
| UI-067 «بلا مسار» الاختيار المتعدد بمكوّنات البيانات | `stixDataComponentsResults` | — | U1. البيانات تتطابق (D14 وD15) | — | U1، T-parse | غير قابل للوصول |
| UI-068 «بلا مسار» دورة حياة الـ sidebar | `sidebar:ngOnChanges` | — | U1 | — | U1 | غير قابل للوصول |
| UI-069a «افتراضي» تصدير JSON للطبقة الحالية | `datatable:saveLayerLocally` (يُستدعى من `wise-planning (download)`) | «Download plan JSON» | انظر P-19 | `workspace.saveLayerLocally` | C:file، C:real | متحقَّق |
| UI-069b «بلا مسار» تصدير كل الطبقات في JSON | `saveAllLayersLocally` (`data-table.component.html:192`) | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| UI-070 «بلا مسار» تصدير تعليقات المرئي فقط | `downloadAnnotationsOnVisibleTechniques` | — | U1. القيمة الافتراضية `false` هي المستعملة في التنزيل، وكذلك في Vue | — | U1، C:file | غير قابل للوصول |
| UI-071 «بلا مسار» Excel لطبقة واحدة | `saveLayerLocallyExcel` (`:205`) | — | U1. لا زر XLSX في الواجهة الحالية، فلا يوجد ملف XLSX للمقارنة | لم يُنقل | U1 | غير قابل للوصول |
| UI-072 «بلا مسار» Excel لعدة طبقات | `saveAllLayersLocallyExcel` (`:213`) | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| UI-073 «بلا مسار» معاينة SVG ونموذج الرسم | `tabs:openSVGDialog` (يُستدعى فقط من `datatable:exportRender`، `:227`) | — | U1. لا يوجد ملف SVG للمقارنة | لم يُنقل | U1 | غير قابل للوصول |
| UI-074 «بلا مسار» أبعاد SVG | `svg-export:setSize` | — | U1 | — | U1 | غير قابل للوصول |
| UI-075 «بلا مسار» نصوص SVG | `svg-export:optimalFontSize` | — | U1 | — | U1 | غير قابل للوصول |
| UI-076 «بلا مسار» ثيم SVG وترويسته | SVG config | — | U1 | — | U1 | غير قابل للوصول |
| UI-077 «بلا مسار» legend وتدرّجات SVG | `buildLegend` | — | U1 | — | U1 | غير قابل للوصول |
| UI-078 «بلا مسار» التقنيات الفرعية وحدود SVG | RenderableTactic | — | U1 | — | U1 | غير قابل للوصول |
| UI-079 «بلا مسار» تنزيل SVG | `downloadSVG` | — | U1 | — | U1 | غير قابل للوصول |
| UI-080 «افتراضي» الطباعة وPDF | `styles.scss`، و«Print / PDF» في التخطيط | انظر P-20 وP-21 | — | — | C:extras، C:print | متحقَّق |
| UI-081 «إعداد/رابط» مفاتيح الميزات | `config.service.ts:setFeature_object`، `setFeature`، `getAllFragments` | ‏`features` في الإعداد، و`#subtechniques=false` و`#leave_site_dialog=false` | الميزات المؤثرة في الواجهة الحالية اثنتان فقط: `leave_site_dialog` و`subtechniques`. البقية تتحكم بعناصر في U1 | `ConfigService` | C:links، T-dom | متحقَّق |
| UI-082a «افتراضي» لوحة المفاتيح والوصول في الواجهة الحالية | — | انظر P-28 | — | — | C:ui | متحقَّق |
| UI-082b «بلا مسار» اختصارات لوحة المفاتيح في الجدول | `datatable:handleKeyDown*` (مربوطة داخل U1) | — | U1 | — | U1 | غير قابل للوصول |
| UI-083 «ملف» تجهيز الترقية | `tabs:versionUpgradeDialog`، `upgradeLayer` | ملف v19 مع «Yes» أو «No» | نافذة «Upgrade layer version?». ‏Yes: طبقة على الإصدار الأحدث بتعليقات منسوخة تلقائيًا. No: يبقى الإصدار القديم | `workspace.upgradeLayer`، `AppDialogs.vue` | C:file (`layer-attack-v19-Yes` و`-No`) | متحقَّق |
| UI-084 «بلا مسار» فئات التغيير في الترقية | `layer-upgrade:sections` | — | U4 | — | U4 | غير قابل للوصول |
| UI-085 «بلا مسار» المراجع التاريخية | `getPreservedURL` | — | U4 | — | U4 | غير قابل للوصول |
| UI-086 «بلا مسار» مرشّحات الترقية والتصفح | `applyFilters` | — | U4 | — | U4 | غير قابل للوصول |
| UI-087 «بلا مسار» علامات المراجعة | `reviewedChanged` | — | U4 | — | U4 | غير قابل للوصول |
| UI-088a «ملف» النسخ التلقائي عند الترقية | `initCopyAnnotations` | انظر UI-083 | — | `layer/upgrade.ts` | C:file | متحقَّق |
| UI-088b «بلا مسار» النسخ اليدوي والتراجع | `copyAnnotations`، `revertCopy` | — | U4 | لم يُنقل | U4 | غير قابل للوصول |
| UI-089 «بلا مسار» سحب التكتيكات المتغيرة | `tacticsChanged`، `onDrop` | — | U4 | — | U4 | غير قابل للوصول |
| UI-090 «بلا مسار» التفاعل مع مصفوفة الترقية | `changelog-cell` | — | U4 | — | U4 | غير قابل للوصول |
| UI-091 «بلا مسار» إنهاء الترقية | `layer-upgrade:closeSidebar` | — | U4 | — | U4 | غير قابل للوصول |

### بنود الجرد السابق: البيانات (D01 إلى D20)

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| D01 «افتراضي» اكتشاف الإصدارات الرسمية | `data.service.ts:parseCollectionIndex` | فتح الموقع | فهرس GitHub مباشرة. لكل إصدار رئيسي يؤخذ **أول** مدخل مدرج، ويُتجاهل ما دون 4 | الفهرس عبر `/api/v1/attack/index`، ونفس اختيار المدخل | T-dom، API، C:real (نفس «Enterprise Matrix v20» ونفس البيانات) | متحقَّق |
| D02 «إعداد» إصدارات مخصصة وقوائم حزم | `setUpDomains` | ‏`versions.entries[].domains[].data` | تُدمج الحزم وتُعرض | `DataService.setUpDomains` | C:links، C:taxii، T-parse | متحقَّق |
| D03 «إعداد» مصادقة Basic لـ Workbench | `getDomainData` (`authentication`) | ‏`authentication:{enabled,serviceName,apiKey}` | ترويسة `Basic base64(service:key)` إلى روابط `data` لذلك الإصدار فقط. مفتاح خاطئ يعطي «Unable to load ATT&CK…». عند إعادة التوجيه لأصل آخر يُسقط المتصفح الترويسة | نفس السلوك (`fetch`) | C:taxii (3 حالات على خادم اختبار محلي): المفتاح يصل للوجهة فقط، ولا يُخزَّن | متحقَّق (محليًا) |
| D03-ext «إعداد» المصادقة مع خادم ATT&CK Workbench حقيقي | — | — | — | — | لا يتوفر خادم Workbench. المتحقَّق منه هو صيغة الترويسة والوجهة والنجاح والفشل مع خادم محلي | محجوب |
| D04 «إعداد» TAXII 2.0 و2.1 | `utils/taxii2lib.ts`، `getDomainData` | ‏`taxii_url` و`taxii_collection` | ‏`GET {taxii_url}api/v21/collections/{id}/objects/` مع `Accept: application/taxii+json;version=2.1` و`version: 2.1` و`Authorization: Basic Og==` (بيانات فارغة، وإعداد `authentication` **لا** يُطبَّق). مع `cti-taxii.mitre.org`: STIX 2.0 والمسار `stix/`. المهلة 10 ثوانٍ، والحالة HTTP لا تُفحص، والصفحة الأولى فقط | `domain/taxii.ts` (نقل لنفس السلوك) | C:taxii: نجاح، 401، مهلة، مسار 2.0 (عبر route محلي) | متحقَّق (محليًا) |
| D04-ext «إعداد» TAXII مع خادم حقيقي (ترقيم الصفحات `more/next`، مصادقة الخادم) | — | — | المرجع لا يتابع الصفحات | نفس السلوك | لا يتوفر خادم TAXII حقيقي. الخادم `cti-taxii.mitre.org` لم يُطلب من الشبكة | محجوب |
| D05 «افتراضي» دورة تحميل البيانات | `loadDomainData`، `dataLoaded` | فتح خطة قبل وصول البيانات، وإعادة المحاولة | المصفوفة تظهر عند وصول البيانات | `dataRevision` (إصلاح خلل وُجد في Vue: المصفوفة كانت تبقى فارغة) | R:attackwise، C:real، C:file | متحقَّق |
| D06 «إعداد» دمج عدة حزم | `parseBundles` | حزمتان لنفس المجال | — | نفس الكود | T-parse (حزمتان اصطناعيتان) | متحقَّق |
| D07 «افتراضي» البيانات الوصفية لكائنات STIX | `stix-object.ts` | — | — | `domain/stix.ts` | T-parse (Enterprise 20.1 كاملة) | متحقَّق |
| D08 «افتراضي» المصفوفات وموضع التكتيكات | `createMatrices` | — | 1 مصفوفة و15 تكتيكًا | — | T-parse، C:real | متحقَّق |
| D09 «افتراضي/رابط» التقنيات الفرعية، و`#subtechniques=false` | `createTechniques` | — | 370 تقنية و481 تقنية فرعية | — | T-parse، T-dom، C:links | متحقَّق |
| D10 «افتراضي» المنصات | `parsePlatforms` | — | — | — | T-parse | متحقَّق |
| D11 «افتراضي» عائلات العلاقات | `parseRelationship` | — | 10 خرائط علاقات | — | T-parse (كل الخرائط متطابقة) | متحقَّق |
| D12 «افتراضي» المجموعات والحملات والبرمجيات | فئات STIX | — | 193 مجموعة و57 حملة و845 برمجية تُحلَّل ولا تُعرض (U1) | تُحلَّل. دوال الاستعلام الخاصة بالبحث لم تُنقل | T-parse | متحقَّق (التحليل) |
| D13 «افتراضي» التخفيفات والأصول واستراتيجيات الكشف | فئات STIX | — | 268 كائن course-of-action (بما فيها القديمة والمُهمَلة) تتغذى منها قائمة Defensive، و708 استراتيجيات كشف تُحلَّل ولا تُعرض | — | T-parse، C:real | متحقَّق |
| D14 «ملف/إعداد» مصادر ومكوّنات البيانات القديمة | `DataComponent`، `supportsLegacyDataSources` | — | — | — | T-parse (`dataSources` و`component_rel`) | متحقَّق |
| D15 «افتراضي» ربط التحليلات والمكوّنات الحديثة | `buildDataComponentToTechniquesMap` | — | 109 مكوّنات | — | T-parse (`dataComponentsToTechniques`) | متحقَّق |
| D16 «افتراضي» Notes | `note.ts` | — | 0 في 20.1 | — | T-parse (الحالة الاصطناعية تمر بالمسار نفسه) | متحقَّق |
| D17 «إعداد» شجرة الميزات | `ConfigService.setFeature*` | — | — | `ConfigService` | T-dom (Vue وحدها)، C:links (الأثر الظاهر) | متحقَّق (الأثر الظاهر) |
| D18 «رابط» تجاوز الميزات من الرابط | `getAllFragments` | ‏`#subtechniques=false` و`#leave_site_dialog=false` | — | — | C:links، T-dom | متحقَّق |
| D19 «إعداد» قيم الإعداد والطبقات الافتراضية | `loadConfig`، `tabs.loadTabs` | ‏`banner` و`default_layers` (مفعّل وغير مفعّل) | — | — | C:links | متحقَّق |
| D20 «بلا مسار» استبدال القيم في قائمة السياق المخصصة | `context-menu-item.ts` | — | U1 | لم يُنقل | U1 | غير قابل للوصول |

### بنود الجرد السابق: الطبقة (L01 إلى L23)

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| L01 «افتراضي» هوية الطبقة وحالتها، و`planId` | ‏`ViewModel`، `newViewModel` | إنشاء أو فتح | — | `layer/view-model.ts` | C:file، T-dom | متحقَّق |
| L02 «ملف» تعليقات خاصة بالتكتيك (`techniqueID^tactic`) | `initTechniqueVMs` | طبقة فيها tactic أو بدونه | — | — | T-dom، C:file | متحقَّق |
| L03 «بلا مسار» نطاق الاختيار (عبر التكتيكات أو مع الأب) | `selectTechnique*` | — | U1. القيم محفوظة في الملف | التخطيط يكتب `selectedTechniques` مباشرة كما في المرجع | U1، C:file | غير قابل للوصول |
| L04 «افتراضي» شارة «N Selected» | `tabs:selectedCount` | اختيار تقنيات | عدد المعرّفات الفريدة | `workspace.selectedCount` | C:links، C:real، C:extras | متحقَّق |
| L05a «افتراضي» مسح الاختيار | `clearSelectedTechniques` | «Clear» | — | — | C:extras | متحقَّق |
| L05b «بلا مسار» عكس الاختيار، واختيار ما عليه تعليق أو ما ليس عليه | `invertSelection`… | — | U1 | لم يُنقل | U1 | غير قابل للوصول |
| L06 «بلا مسار» الإبراز | `highlightTechnique` | — | U1 | — | U1 | غير قابل للوصول |
| L07 «ملف» حقول التعليقات (score وcolor وcomment وenabled وmetadata وlinks وshowSubtechniques) | `TechniqueVM` | فتح طبقة ثم تصديرها | الحقول محفوظة كما هي | `layer/annotations.ts` | T-diff (TechniqueVM)، C:file (`layer-v4.5-annotated` في الاتجاهين) | متحقَّق |
| L08 «بلا مسار» التعديل الجماعي والقيم المختلطة | `editSelectedTechniques` | — | U1 | — | U1 | غير قابل للوصول |
| L09 «بلا مسار» تعديل الروابط والبيانات الوصفية جماعيًا | `editSelectedTechniqueValues` | — | U1 | — | U1 | غير قابل للوصول |
| L10 «بلا مسار» مسح التعليقات | `resetAnnotations` | — | U1 | — | U1 | غير قابل للوصول |
| L11 «ملف» المرشّحات | `filterTechniques`… | — | تطبيقها على العرض هو U1، والقيم محفوظة | `Filter` | C:file | متحقَّق (الحفظ). العرض غير قابل للوصول |
| L12 «ملف» أسماء المنصات التاريخية | `Filter.deserialize` | طبقة 3.0 | تُحوَّل الأسماء | — | T-diff، C:file (`layer-v3-legacy`) | متحقَّق |
| L13 «ملف» الترتيب | `sortTechniques` | — | العرض U1، والقيمة محفوظة | — | C:file | متحقَّق (الحفظ). العرض غير قابل للوصول |
| L14 «بلا مسار» الدرجة المجمّعة | `calculateAggregateScore` | — | U1 | — | U1 | غير قابل للوصول |
| L15 «ملف» التدرّج | `Gradient` | — | الألوان وتسلسلها | `Gradient` | T-diff، C:file | متحقَّق |
| L16 «ملف» التخطيط (`layout`) والقيم القديمة | `LayoutOptions` | — | — | — | T-diff، C:file | متحقَّق |
| L17 «ملف» التوسيع الأولي | `initTechniqueVMs` | — | `showSubtechniques` محفوظة | — | C:file | متحقَّق |
| L18 «ملف» الـ legend وخلفية التكتيك | `ViewModel` | — | محفوظة | — | C:file | متحقَّق |
| L19 «بلا مسار» عمليات الطبقات | `layerOperation` | — | U2 | — | U2 | غير قابل للوصول |
| L20 «بلا مسار» وراثة العمليات | — | — | U2 | — | U2 | غير قابل للوصول |
| L21 «ملف» مقارنة إصدارات ATT&CK | `compareVersions` | ترقية v19 | تُستعمل للنسخ التلقائي | `layer/upgrade.ts` | C:file | متحقَّق |
| L22a «ملف» نقل التعليقات تلقائيًا عند الترقية | `initCopyAnnotations` | — | — | — | C:file | متحقَّق |
| L22b «بلا مسار» النسخ اليدوي والتراجع | `copyAnnotations`، `revertCopy` | — | U4 | — | U4 | غير قابل للوصول |
| L23 «بلا مسار» حالة الـ sidebar المؤقتة | `sidebarContentType` | — | U1، ولا تُكتب في الملف | — | U1 | غير قابل للوصول |

### بنود الجرد السابق: ملفات JSON (J01 إلى J11)

| السلوك | مرجع الكود أو الاختبار | مدخلات وخطوات المستخدم | نتيجة Angular | التنفيذ الجديد | الاختبار والدليل | الحالة |
|---|---|---|---|---|---|---|
| J01 «ملف/رابط» كائن واحد أو مصفوفة طبقات | `readJSONFile`، `loadLayerFromURL` | ‏`layers-array.json` و`pair.json` | كل طبقة خطة مستقلة | `workspace` | C:file، C:links | متحقَّق |
| J02 «ملف» أسماء المجالات البديلة (`mitre-enterprise`) | `deserializeDomainVersionID` | ‏`layer-v3-legacy.json` | مسار فتح الملف يرفض الاسم البديل بنفس رسالة Enterprise-only (UI-002c)، ولا تُفتح خطة. التحويل موجود في `deserializeDomainVersionID` لكن الحارس يسبقه | نفس السلوك | C:file (الأحداث متطابقة)، T-dom | متحقَّق (مع حفظ سلوك المرجع) |
| J03 «ملف» الرجوع للإصدار عند غيابه أو عدم دعمه | نفس الدالة | — | — | — | T-dom، C:file | متحقَّق |
| J04 «ملف» غياب tactic | `initTechniqueVMs` | — | يُطبَّق على كل التكتيكات | — | T-dom، C:file | متحقَّق |
| J05 «ملف» `viewMode` القديم | `LayoutOptions` | طبقة 3.0 | — | — | T-diff، C:file | متحقَّق |
| J06 «ملف» نصوص المنصات التاريخية | `Filter` | — | — | — | T-diff، C:file | متحقَّق |
| J07 «ملف» تنبيه صيغة الطبقة الأقدم | `versionMismatchWarning` | ‏4.3 و3.0 | انظر UI-012 | — | C:file | متحقَّق |
| J08 «ملف» إصدار ATT&CK أقدم | `upgradeLayer` | ‏v19 مع Yes أو No | انظر UI-083 | — | C:file | متحقَّق |
| J09 «ملف» طبقة ببيانات مخصصة (`customDataURL`) | `readJSONFile` | ملف فيه `customDataURL` و`attack: 15` | خطة على v15 من الحزمة المخصصة | — | C:links | متحقَّق |
| J10 «ملف» الحقول المجهولة | `serialize` | ‏`x_unknown_top_level` | لا تُكتب في التصدير | — | C:file (`layer-v4.5-annotated` و`layers-array`) | متحقَّق |
| J11 «ملف» حقول غير صالحة أو JSON تالف | `readJSONFile`، `deserialize` | ‏`malformed.json` | لا تُفتح خطة، ولا تظهر رسالة (خطأ في console فقط) في التطبيقين | — | C:file | متحقَّق |

## الفروق المتبقية

| البند | الفرق | الأثر على المستخدم |
|---|---|---|
| ST-05 | تحتفظ Vue بنسخة من قيمة الخطط غير المقروءة بدل أن تفقدها | لا أثر سلبي. الرجوع لـ Angular يتجاهل المفتاح الإضافي |
| ST-06 | تحتفظ Vue بمدخلات المصفوفة غير المعروفة، وAngular يحذفها | لا أثر على الخطط الصحيحة |
| UI-022 | تنبيه Safari 13 أو أقدم لم يُختبر | يخص فقط متصفحات قديمة جدًا |
| D03-ext، D04-ext | لم يُختبر Workbench أو TAXII حقيقي | الإعداد الافتراضي لا يستعملهما. من يضبطهما يحتاج تحققًا مع خادمه |
| كل «غير قابل للوصول» | واجهة Navigator الكلاسيكية (التخطيطات، SVG، XLSX، البحث، عمليات الطبقات، مراجعة الترقية، Help) لم تُنقل | لا أثر على الموقع الحالي لأنها غير ظاهرة فيه. إذا أراد المستخدم إعادة تفعيلها في Angular لاحقًا (بتعديل المصدر)، فلا مقابل لها في Vue |

## تعارض مع الوثائق القديمة

| الوثيقة القديمة | ما تقوله | الحالة الفعلية |
|---|---|---|
| `BASELINE_RESULTS.md` | «Playwright: 5 passed؛ اثنان يمسّان تغييرات Plan مستبعدة من النطاق». و315 اختبار Karma ناجح | ‏nav-app الحالية فيها 16 مواصفة Playwright، تنجح منها 13 وتفشل 3 لأنها تعتمد على واجهة Navigator الكلاسيكية. وKarma: ‏311 من 315. ميزة Plan هي الواجهة الحالية، وهي ضمن النطاق |
| `SOURCE_AUDIT.md`، و`README.md` (قبل التحديث) | فرع الترحيل `migration/attackwise-vue-laravel`، والمستودع `attack-navigator/` | الفرع الفعلي `attackwise-vue-migration`، والمستودع هو جذر `att-ckwise` |
| `FEATURE_INVENTORY.md` | أسماء مكوّنات مقترحة (`NavigatorView.vue` و`NewLayerPanel.vue`…) وحالة «Not implemented» | المكوّنات الفعلية هي `App.vue` و`PlanningView.vue` و`AppDialogs.vue`. الحالة الفعلية لكل بند في هذا الملف |
| `MIGRATION_PLAN.md`، و`audit/*.md` | تفترض نقل Navigator الكلاسيكي كاملًا | الواجهة الكلاسيكية غير قابلة للوصول في المرجع (U1–U4)، فنُقل ما يصل إليه المستخدم ونموذج البيانات اللازم للملفات |
