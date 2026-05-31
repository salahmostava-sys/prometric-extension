# Prometric Auto Register — Chrome Extension

> **الإصدار:** v3.0 · **المنصة:** Chrome / Chromium · **Manifest:** V3

إضافة Chrome تُؤتمت تسجيل المختبرين على موقع Prometric (IBTA MEA) بالكامل — سواء تسجيلاً فردياً أو دفعياً من Excel / CSV / Google Sheets.

---

## الميزات

| الميزة | التفاصيل |
|--------|---------|
| **وضع فردي (Single)** | أدخل الاسم والبريد الإلكتروني ثم اضغط Start |
| **وضع دفعي (Batch)** | ارفع ملف `.xlsx` أو `.csv` وسجّل المئات تلقائياً |
| **Google Sheets** | أدخل رابط الـ Sheet مباشرةً مع فلتر اختياري للأيام |
| **توليد بيانات الدخول** | Username وPassword يُولَّدان تلقائياً من الاسم حسب نمط قابل للتخصيص |
| **إعادة المحاولة التلقائية** | يُعيد تسجيل العناصر الفاشلة بعد انتهاء الدفعة |
| **إزالة التكرار** | يتجاهل الصفوف المكررة (نفس الاسم + البريد) تلقائياً |
| **Turbo / Safe Mode** | تبديل سريع بين وضع السرعة ووضع الثبات |
| **Stability Mode** | انتظار أطول للصفحات البطيئة أو الخلفية |
| **Desktop Notifications** | إشعار على سطح المكتب عند انتهاء الدفعة |
| **History** | سجل كامل لجميع التسجيلات مع إمكانية التصدير CSV |
| **Backup & Restore** | تصدير/استيراد إعدادات الإضافة بصيغة JSON |
| **Dark / Light Mode** | دعم الوضعين مع حفظ التفضيل |

---

## هيكل الملفات

```
prometric-extension/
├── manifest.json       # إعدادات الإضافة (MV3)
├── background.js       # Service Worker — إدارة Queue والرسائل
├── bridge.js           # وسيط ISOLATED world → MAIN world
├── content.js          # أتمتة الصفحات (MAIN world)
├── popup.html          # واجهة المستخدم
├── popup.js            # منطق الـ Popup
├── icon.png            # أيقونة الإضافة (أصلية)
├── icon16.png          # 16×16
├── icon48.png          # 48×48
└── icon128.png         # 128×128
```

---

## المعمارية

```
┌─────────────────────────────────────────────────────┐
│                    popup.js                         │
│         (واجهة المستخدم — Control Panel)            │
└─────────────────┬───────────────────────────────────┘
                  │ chrome.runtime.sendMessage
                  ▼
┌─────────────────────────────────────────────────────┐
│                  background.js                      │
│       (Service Worker — Queue Manager)              │
│  • startSingle / startQueue / pauseQueue / stopQueue│
│  • resumeQueue / retryFailed / clearSession         │
│  • stepDone / stepFailed                            │
└────────────────┬────────────────────────────────────┘
                 │ chrome.storage.local (currentItem)
                 ▼
┌─────────────────────────────────────────────────────┐
│       bridge.js (ISOLATED world)                    │
│  • يقرأ storage ويرسل __prom_init للصفحة           │
│  • يستقبل __prom_msg من content.js ويمرره          │
└────────────────┬────────────────────────────────────┘
                 │ window CustomEvents
                 ▼
┌─────────────────────────────────────────────────────┐
│       content.js (MAIN world)                       │
│  • fillStep1 → Step2 → Step3 → Step4 → Dashboard   │
│  • MutationObserver يراقب تغييرات AJAX             │
└─────────────────────────────────────────────────────┘
```

---

## التثبيت

1. افتح Chrome وانتقل إلى `chrome://extensions`
2. فعّل **Developer mode** من أعلى اليمين
3. اضغط **Load unpacked** واختر مجلد المشروع
4. ستظهر الأيقونة في شريط الإضافات

---

## طريقة الاستخدام

### التسجيل الفردي

1. افتح الـ Popup واختر تبويب **Single**
2. أدخل الاسم الكامل (مثال: `ABDULLAH MOHAMMED AL RASHIDI`)
3. أدخل البريد الإلكتروني
4. اضغط **Start Registration**

### التسجيل الدفعي (Excel / CSV)

1. اختر تبويب **Excel / CSV**
2. حمّل ملف `.xlsx` أو `.csv` بالأعمدة: `Name, Email`
3. راجع ملخص الفحص (عدد الصفوف، الأخطاء، التكرار)
4. اضغط **Start Batch Registration**

**تنسيق الملف:**
```
Name,Email
AHMED ALI HASSAN,ahmed@email.com
SARA MOHAMMED OMAR,sara@email.com
```

> يمكن تحميل نموذج جاهز من زر **Download Template (CSV)**

### Google Sheets

1. اختر تبويب **Google Sheet**
2. الصق رابط الـ Sheet (يجب أن يكون مشاركاً للعموم بصلاحية **View**)
3. اضغط **Load Columns** لتحميل الأعمدة
4. حدد عمود الاسم وعمود البريد الإلكتروني (وعمود الأيام اختيارياً)
5. اضغط **Start Batch Registration**

---

## توليد بيانات الدخول

### Username

يُولَّد من أول كلمتين في الاسم (بالحروف الإنجليزية فقط):
```
"AHMED ALI HASSAN" → Username: AHMEDALI
"SARA MOHAMMED"    → Username: SARAMOHAMMED
```
إذا كان الـ Username محجوزاً يُضاف suffix تلقائياً: `AHMEDALI1`, `AHMEDALI2`, ..., `AHMEDALIa`, ...

### Password

يُولَّد من نمط قابل للتخصيص في الإعدادات:

| Tag | المعنى |
|-----|--------|
| `{F}` | أول حرف من الاسم الأول (كبير) |
| `{f}` | أول حرف من الاسم الأول (صغير) |
| `{L}` | أول حرف من الاسم الأخير (كبير) |
| `{l}` | أول حرف من الاسم الأخير (صغير) |

**مثال:** النمط `{F}@{f}#$1970` مع اسم `AHMED HASSAN` → `A@a#$1970`

---

## الإعدادات

| الإعداد | الافتراضي | الوصف |
|---------|-----------|-------|
| Page Delay | 1s | وقت الانتظار بين خطوات الصفحة |
| Next User Delay | 2s | وقت الانتظار بين المستخدمين في الدفعة |
| Fully Automated Mode | ✅ | الإنهاء التلقائي بدون ضغط |
| Auto-Retry Failed | ✅ | إعادة المحاولة للعناصر الفاشلة |
| Stability Mode | ❌ | انتظار أطول للصفحات البطيئة |
| Desktop Notifications | ✅ | إشعار عند انتهاء الدفعة |
| Password Pattern | `{F}@{f}#$1970` | نمط كلمة المرور |
| Security Answer | `a` | إجابة أسئلة الأمان |
| Mailing Address | `Al-Alameya` | العنوان الافتراضي |
| City | `JEDDAH` | المدينة الافتراضية |
| Country | `Saudi Arabia` | الدولة الافتراضية |

---

## الصلاحيات

| الصلاحية | السبب |
|---------|-------|
| `tabs` | فتح وإدارة نافذة التسجيل |
| `scripting` | حقن content scripts |
| `storage` | حفظ الإعدادات والـ Queue والتاريخ |
| `downloads` | تحميل ملفات التصدير والقوالب |
| `contextMenus` | قائمة Pause/Resume/Stop من الأيقونة |
| `notifications` | إشعار سطح المكتب عند الانتهاء |
| `unlimitedStorage` | حفظ تاريخ كبير (حتى 500 سجل) |

**Host Permissions:**
- `https://tcnet1.prometric.com/*` — موقع Prometric
- `https://docs.google.com/spreadsheets/*` — Google Sheets

---

## Context Menu

اضغط **كليك يمين** على أيقونة الإضافة للوصول إلى:

| العنصر | الوظيفة |
|--------|---------|
| Pause Registration | إيقاف مؤقت (يحتفظ بالـ Queue) |
| Resume Registration | استئناف من حيث توقف |
| Stop & Clear Queue | إيقاف تام ومسح الـ Queue |

---

## الأخطاء الشائعة والحلول

| الخطأ | السبب المحتمل | الحل |
|-------|--------------|------|
| `Username exhausted` | الـ username وجميع بدائله محجوزة | تغيير الاسم قليلاً أو تجاهل هذا المستخدم |
| `Option IBTA MEA not found` | الصفحة لم تُحمَّل بالكامل | زيادة Page Delay في الإعدادات |
| `Continue did not become ready` | مشكلة في صفحة Privacy Policy | تفعيل Stability Mode |
| `Invalid email` | صيغة البريد خاطئة في الملف | مراجعة ملف Excel قبل التشغيل |
| `No data found` | ملف `.xls` قديم | احفظ الملف بصيغة `.xlsx` أو `.csv` |

---

## التطوير

```
المتطلبات: Chrome 88+ (Manifest V3)
لا يوجد build system — الملفات تُحمَّل مباشرةً
```

### تسلسل خطوات التسجيل

```
InvalidHostHeader.aspx
    ↓ redirect
Login.aspx → Click "New User"
    ↓
Registration.aspx
  Step 1: اختيار IBTA MEA من القائمة المنسدلة
  Step 2: Username + Password + Security Questions
  Step 3: Profile Info (Name / Address / Email)
  Step 4: Privacy Policy (Agree / I Consent)
    ↓
Dashboard — تسجيل ناجح ✅
```

---

## الرخصة

للاستخدام الداخلي فقط — جميع الحقوق محفوظة.
