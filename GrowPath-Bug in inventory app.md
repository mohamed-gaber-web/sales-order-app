## **ملخّص األخطاء المبدئيه في تطبيقGrow Path** 

**Bug Summary Report — Grow Path Mobile App** 

عبر التحليل الثابت للـ ) يحتوي هذا الجدول على جميع األخطاء والقصور المرصودة في كود التطبيق (إصدارv1.0 Debug Build .كل صف يبيّن: اسم الشاشة المعنيّة، شرح الخطأ، والمطلوب إلصالحه  . المُستخرَج من ملفAPK JavaScript bundle 

||||||||
|---|---|---|---|---|---|---|
||**الجمالي**||🔴<br>**( حرجCritical**<br>**)**||🟡<br>**( مرتفعHigh**<br>**)**|🔵<br>**متوسط**<br>**(**<br>**Medium**<br>**)**|
||||||||
||**15**||||||
||||**7**||**5**|**3**|
||||||||
||**جدول الخطاء**||||||
||||||||
|**#**|**اسم الشاشة**||**( شرح البجBug**<br>**)**||**( المطلوب لحلهRequired Fix**<br>**)**||
||||||||
||||||||
|**1**<br>**CRITI**<br>**CAL**|**`LoginPage`**|**:تسجيل الدخول مزيف بالكامل**الدالة<br>|||تنفيذAuthorization Code Flow with PKCE<br>عبر مكتبة<br>@<br>azure/msal-angular<br>بحيث تتم المصادقة الحقيقية على<br>Microsoft 365 / Azure AD<br>،<br>ول يتم قبول الدخول إل بعد<br>التحقق من كلمة المرور والـMFA<br>.إن كان مفعل||
||شاشة تسجيل<br>الدخول—<br>/<br>auth/login|`signIn()`<br>،تستقبل البريد اللكتروني فقط<br>+ ول تتحقق من كلمة المرور إطلقا. أي بريد<br>أي كلمة مرور بطول4<br>محارف فأكثر تدخل<br>.المستخدم للتطبيق|||||
||||||||
||**`LoginPage`**<br>**`— Sign in`**<br>**`with`**<br>**`Microsoft`**<br>زر تسجيل الدخول<br>عبرMicrosoft|**:الزر مزيف**ل يفتح صفحةMicrosoft<br>الحقيقية. الكود يحتوي على<br>`setTimeout(...1600)`<br>ثم يسجل<br>دخول كحساب ثابت<br>`user@growpath.net`<br>بغض النظر عن<br>.المستخدم الفعلي|||||
|**2**<br>**CRITI**<br>**CAL**|||||ربط الزر بـMSAL Popup / Redirect Flow<br>الفعلي بحيث<br>يفتحlogin.microsoftonline.com<br>ويعيد للمستخدم بعد<br>.المصادقة الناجحة||
||||||||
||||||||
|**3**<br>**CRITI**<br>**CAL**|**`AuthServic`**|**Client Secret**<br>**:مكشوف في الكود**السر|||( إبطالRevoke<br>)<br>السر الحالي فورا منAzure Portal<br>،<br>ثم إعادة<br>تصميم المعمارية بحيث ل يحتفظ الجهاز بـclient_secret<br>على<br>الطلق (استخدامPublic Client + PKCE<br>.)||
||**`e /`**<br>**`main.js`**<br>خدمة المصادقة<br>على مستوى<br>التطبيق|(  الخاص بالتطبيق`clientSecret`<br>) مدمج<br>داخل ملف`main.js`<br>ويظهر فورا عند<br>استخراج الـAPK<br>.<br>هذا يسمح لي شخص<br>بانتحال هوية التطبيق واستدعاء الـAPIs<br>.بصلحياته|||||
||||||||
||||||||
|**4**<br>**CRITI**<br>**CAL**|**`All`**|**:اسم الشركة مكتوب صراحة في الكود**القيمة|||استبدال القيمة الثابتة بمتغير يتم جلبه من ملف العدادات<br>(<br>environment.ts<br>)<br>،أو من خصائص المستخدم بعد تسجيل دخوله<br>" بحيث يتم استبدالusmf<br>"<br>:بكود شركة العميل الفعلي (مثل<br>"<br>GROW", "ACME<br>,"<br>.)إلخ||
||**`screens /`**<br>**`common.js`**<br>جميع شاشات<br>التطبيق المتصلة بـ<br>Dynamics<br>365|`"usmf"`<br>(وهي شركة الـDemo Data<br>:التابعة لمايكروسوفت) متكررة في كل مكان<br>`this.company = "usmf"`<br>و<br>`dataAreaId = "usmf"`<br>. التطبيق لن<br>.يعمل مع شركة أي عميل حقيقي|||||
||||||||
||||||||
|**5**<br>**CRITI**<br>**CAL**|**`App Router`**|**:غياب حراس المصادقة على معظم المسارات**|||إضافةcanActivate: [AuthGuard]<br>على كل وحدة<br>(<br>Module<br>)<br>في ملفapp-routing.module.ts<br>ليكون التحقق<br>.من المصادقة موحدا على كل المسارات المحمية||
||**`(app-`**<br>**`routing.mo`**<br>**`dule)`**<br>مسارات التطبيق<br>(<br>Routing<br>)<br>—<br>جميع الوحدات|حارس الـ`canActivate`<br>موجود فقط على<br>مسار`/dashboard`<br>. باقي المسارات<br>(<br>`sales-order, purchase-`<br>`order, transfer-order,`<br>`inventory, sales-order-line`<br>)<br>يمكن فتحها مباشرة عبرURL<br>بدون تسجيل<br>.دخول|||||
||||||||



|||||
|---|---|---|---|
|**#**|**اسم الشاشة**|**( شرح البجBug**<br>**)**|**( المطلوب لحلهRequired Fix**<br>**)**|
|||<br>|<br>|
||**`VendorRetu`**<br>**`rns`**<br>شاشة مرتجعات<br>المورد—<br>/<br>inventory/ve<br>ndor-returns|**خدمة الـBackend**<br>**:غير مكتملة**الكود نفسه<br>:يحوي تحذيرا صريحا من المطو ر<br>`console.warn("VendorReturnS`<br>`ervice.postVendorReturn:`<br>`backend API not yet wired")`<br>.<br>يعني الميزة معروضة في الواجهة لكن قد ل<br>يسجل المرتجع فيDynamics 365<br>.||
|**6**<br>**CRITI**<br>**CAL**|||إكمال ربط الـendpoint<br>/<br>api/services/GP_vendorReturnServiceGroup/GP<br>_<br>VendorReturnService/postVendorReturn<br>في الـ<br>Backend<br>،<br>واختبارهend-to-end<br>،<br>.وإزالة التحذير من الكود|
|||||
||**`Production`**<br>**`Issue`**<br>شاشة صرف<br>النتاج—<br>/<br>inventory/pro<br>duction-issue|**ترجع نجاحا وهميا بدون استدعاء الـ**<br>**Backend**<br>**!**<br>الدالة<br>`postProductionIssue()`<br>ترجع<br>`of({success: true})`<br>مباشرة دون<br>إرسال أي طلب. المستخدم سيرى رسالة نجاح<br>وهو في الحقيقة لم يسجل شيء في النظام—<br>.كارثة محاسبية  محتملة||
|**7**<br>**CRITI**<br>**CAL**|||إزالة الـstub fake-success<br>فورا، وربط الدالة بـHTTP call<br>فعلي للـbackend endpoint<br>المعني، مع معالجة أخطاء واضحة<br>.في حال فشل لستدعاء|
|||||
|||||
|**8**<br>**HIGH**|**`LoginPage`**|" الزرForgot password<br>"?<br>موجود مرئيا<br>|إما (أ) ربط الزر بصفحة استرجاع كلمة المرور الذاتية فيAzure<br>AD )SSPR URL(<br>,<br>أو (ب) إخفاء الزر إذا لم تكن الميزة ضمن<br>.النطاق|
||**`— Forgot`**<br>**`Password`**<br>رابط نسيت كلمة<br>المرور|في شاشة تسجيل الدخول لكن ل يوجد له أي<br>handler<br>.<br>.الضغط عليه ل يفعل شيئا||
|||||
|||||
|**9**<br>**HIGH**|**`BottomTabB`**|**:الزر ل يفتح صفحة**الضغط عليه يعرض|تنفيذ شاشةProfilePage<br>تعرض اسم المستخدم وبريده ومعلوماته<br>منAzure AD<br>،<br>مع زر تسجيل الخروج وخيارات تغيير اللغة<br>.والمظهر|
||**`ar —`**<br>**`Profile`**<br>زرProfile<br>في<br>القائمة السفلية|`Toast: "Profile — Coming`<br>`Soon"`<br>.فقط، ل توجد شاشة بروفايل منفذة||
|||||
|||||
|**10**<br>**HIGH**|**`AndroidMan`**|**:اسم الحزمة لزال  لفتراضي**في ملف|تعديلapplicationId<br>فيbuild.gradle<br>(<br>مستوىapp<br>)<br>إلى<br>com.growpath.app<br>،<br>وإعادة بناء التطبيق، والتأكد من تطابق<br>Manifest<br>معcapacitor.config.json<br>.|
||**`ifest.xml`**<br>ملف العدادات<br>الساسي للندرويد|Manifest<br>،<br>الـpackage<br>=<br>`"ionic.app.base"`<br>(لسملفتراضي<br>لقالبIonic<br>)<br>بدل أن يكون<br>`"com.growpath.app"`<br>كما هو معلن<br>فيcapacitor.config.json. Google<br>Play<br>.سيرفض النشر بهذالسم||
|||||
|||||
|**11**<br>**HIGH**|**`AndroidMan`**|**بني التطبيق كنسخةDebug**<br>**:**<br>الخاصية|إنتاج نسخةRelease<br>،موقعة بشهادة النتاج المعتمدة لشركة العميل<br>معdebuggable=false<br>،<br>عبرgradle<br>assembleRelease<br>أوbundleRelease<br>.|
||**`ifest.xml`**<br>إعدادات بناء<br>التطبيق|`android:debuggable="true"`<br>مفعلة، والتطبيق موقع بشهادةAndroid<br>Debug<br>.<br>غير قابل للنشر التجاري ويمك ن<br>المهاجمين منلتصال به عبرADB<br>وقراءة<br>.الذاكرة||
|||||
||**`AndroidMan`**<br>**`ifest.xml`**<br>إعدادات النسخ<br>لحتياطي للبيانات|**:النسخ  لحتياطي مفعل**الخاصية<br>`android:allowBackup="true"`<br>تسمح لي شخص لديه وصول للجهاز عبر<br>ADB<br>بسحب نسخة كاملة من بيانات التطبيق<br>(تشملlocalStorage<br>و<br>sessionStorage<br>والـTokens<br>.)||
|**12**<br>**HIGH**|||تعديل الخاصية إلىandroid:allowBackup="false<br>"<br>في<br>AndroidManifest.xml<br>،<br>وإضافةrules.xml<br>لستثناء الملفات<br>.الحساسة إن لزم البقاء على نسخ احتياطي  محدود|
|||||
||**`Side Menu`**<br>**`— Coming`**<br>**`Soon Items`**|**5**<br>**:عناصر معروضة في القائمة لكنها معطلة**<br>Movement )Inventory(, Return<br>Customer )Sales Order(, Return<br>Order )Sales Order(, Picking List||
|**13**<br>**MEDI**<br>**UM**|||،اتخاذ قرار لكل عنصر: (أ) إكمال التنفيذ ضمن خطة الصدار الحالي<br>(ب) إخفاء العنصر من القائمة حتى يكتمل، أو (ج) البقاء عليه مع<br>( تنبيه واضح للعميل ضمن مستندات النطاقScope<br>.)|
|||||



||||||
|---|---|---|---|---|
|**#**|**اسم الشاشة**|**( شرح البجBug**<br>**)**||**( المطلوب لحلهRequired Fix**<br>**)**|
|||<br>||<br>|
||عناصر القائمة<br>الجانبية المعلمة<br>Coming Soon|)Production(, Report As Finished<br>(<br>Production<br>.)<br>كلها لهاflag<br>`comingSoon: true`<br>ول تستجيب<br>للضغط. تخلق توقعات للعميل بميزات غير<br>.موجودة|||
||||||
||||||
||||||
|**14**<br>**MEDI**<br>**UM**|**`AndroidMan`**|**تجاوزScoped Storage**<br>**:**<br>الخاصية||إزالة الخاصية إذا لم يكن التطبيق يحتاج لقراءة/كتابة ملفات خارج<br>المجلد الخاص به. إن كانت الحاجة فعلية،لنتقال إلى<br>MediaStore API<br>أوStorage Access Framework<br>.|
||**`ifest.xml`**<br>إعدادات التخزين<br>الخارجي|`android:requestLegacyExtern`<br>`alStorage="true"`<br>تتجاوز نموذج<br>التخزين المن الذي فرضتهAndroid 10<br>.+<br>ليست مشكلة كارثية حاليا لكنGoogle Play<br>.قد يطلب مبررا|||
||||||
||||||
|**15**<br>**MEDI**<br>**UM**|**`All`**|/ مؤشر اللغة العربيةRTL<br>غير مرصود في||إضافة دعمi18n<br>لـAngular<br>(<br>@ مكتبةngx-translate/core<br>أوngx-i18n<br>)<br>مع ملفات ترجمة عربية، وتغييرdirection<br>تلقائيا<br>.بناء على لغة المستخدم|
||**`screens`**<br>**`(UX`**<br>**`Consistenc`**<br>**`y)`**<br>تجربة المستخدم<br>العامة على كل<br>الشاشات|الكود. ملفManifest<br>يحوي<br>android:supportsRtl="true<br>"<br>لكن<br>واجهةAngular<br>مكتوبة بالنجليزية فقط<br>(<br>Customer Account, Order Type<br>,<br>إلخ). إذا كان العميل عربيا، التطبيق لن يدعمه<br>.بشكل كامل|||
||||||
||**دليل اللوان**||.يجب إصلحه قبل أي إصدار للعميل. التطبيق غير قابل للنشر إنتاجيا بوجود هذه الخطاء<br>.يجب إصلحه قبل إطلق الصدار التجاري الول، يؤثر على الجودة والمان لكن ل يمنعلختبار<br>.يفضل معالجته في الصدارات اللحقة، يحسن تجربة المستخدم ولتساق العام||
||||.يجب إصلحه قبل أي إصدار للعميل. التطبيق غير قابل للنشر إنتاجيا بوجود هذه الخطاء||
||**CRITICAL —**<br>**حرج**||||
||||||
||||.يجب إصلحه قبل إطلق الصدار التجاري الول، يؤثر على الجودة والمان لكن ل يمنعلختبار||
||**HIGH — مرتفع**||||
||||||
||||.يفضل معالجته في الصدارات اللحقة، يحسن تجربة المستخدم ولتساق العام||
||**MEDIUM —**<br>**متوسط**||||
||||||



## **:مالحظات هامة** 

— يكتشف األخطاء البرمجية الواضحة لكن ال يحلّ محل )( • هذا الملخّص مبني على تحليل ثابت للكودStatic Code Analysis لختبار اليدوي على جهاز حقيقي . ة، أخطاء واجهة) ال يمكن رصدها من الكود وحده .• قد تظهر أخطاء إضافية عند تشغيل التطبيق فعليالت حاف (مشاكل أداء، ح قبل تسليم أي نسخة للعميل النهائي .تستوجب إصالحا فوريا • األخطاء ذات الخطورةCRITICAL 

