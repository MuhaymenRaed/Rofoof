export type Lang = "ar" | "en";

/** UI string dictionary. Product names live in lib/products.ts (bilingual). */
export const dict = {
  // Header / nav
  "nav.home": { ar: "الرئيسية", en: "Home" },
  "nav.store": { ar: "المتجر", en: "Store" },
  "nav.orders": { ar: "طلباتي", en: "My Orders" },
  "nav.favorites": { ar: "المفضلة", en: "Favorites" },
  "brand.name": { ar: "رفوف", en: "rofoof" },

  // Toggles / aria
  "toggle.dark": { ar: "داكن", en: "Dark" },
  "toggle.light": { ar: "فاتح", en: "Light" },
  "toggle.lang": { ar: "English", en: "العربية" },
  "aria.search": { ar: "بحث", en: "Search" },
  "aria.favorites": { ar: "المفضلة", en: "Favorites" },
  "aria.cart": { ar: "السلة", en: "Cart" },
  "aria.menu": { ar: "القائمة", en: "Menu" },
  "aria.close": { ar: "إغلاق", en: "Close" },

  // Ticker
  "ticker.line": {
    ar: "ستكرات · بروشات · ميداليات · بوسترات — توصيل لجميع محافظات العراق",
    en: "Stickers · Brooches · Medals · Posters — delivery to all Iraqi provinces",
  },
  "ticker.promo": {
    ar: "كود خصم ROFOOF10 — بوسترات ميكو × تيتو متوفرة الآن",
    en: "Use code ROFOOF10 — Miku × Teto posters available now",
  },

  // Hero
  "hero.tag": { ar: "وصل جديد", en: "New arrivals" },
  "hero.title": {
    ar: "ستكرات وميداليات صناعة عراقية",
    en: "Iraqi-made stickers & medals",
  },
  "hero.desc": {
    ar: "ستكرات، بروشات، ميداليات وبوسترات لكل اهتماماتك — منتجات مرتبة في حانة البوستات ♥",
    en: "Stickers, brooches, medals & posters for every fandom — curated with love ♥",
  },
  "hero.shop": { ar: "تسوّق الآن", en: "Shop now" },
  "hero.track": { ar: "تتبّع طلبك", en: "Track order" },
  "stat.followers": { ar: "متابع", en: "Followers" },
  "stat.products": { ar: "منتج", en: "Products" },
  "stat.rating": { ar: "تقييم", en: "Rating" },

  // Sections
  "section.bestsellers": { ar: "الأكثر طلباً", en: "Best sellers" },
  "section.fresh": { ar: "وصل حديثاً", en: "Just landed" },
  "section.track": { ar: "تتبّع طلبك", en: "Track your order" },
  "section.viewAll": { ar: "عرض الكل", en: "View all" },

  // Categories
  "cat.all": { ar: "الكل", en: "All" },
  "cat.stickers": { ar: "ستكرات", en: "Stickers" },
  "cat.posters": { ar: "بوسترات", en: "Posters" },
  "cat.brooches": { ar: "بروشات", en: "Brooches" },
  "cat.medals": { ar: "ميداليات 3D", en: "3D Medals" },

  // Fandoms (filter)
  "fandom.label": { ar: "الفئة", en: "Fandom" },
  "fandom.all": { ar: "الكل", en: "All" },
  "fandom.gaming": { ar: "قيمنق", en: "Gaming" },
  "fandom.anime": { ar: "أنمي", en: "Anime" },
  "fandom.memes": { ar: "ميمز", en: "Memes" },
  "fandom.local": { ar: "محلي", en: "Local" },

  // Badges
  "badge.bestseller": { ar: "الأكثر طلباً", en: "Bestseller" },
  "badge.new": { ar: "جديد", en: "New" },
  "badge.waterproof": { ar: "مقاوم للماء", en: "Waterproof" },
  "badge.soldout": { ar: "نفد المخزون", en: "Sold out" },

  // Store toolbar
  "store.title": { ar: "المتجر", en: "Store" },
  "store.searchPlaceholder": { ar: "ابحث عن منتج…", en: "Search products…" },
  "store.filter": { ar: "تصفية", en: "Filter" },
  "store.waterproofOnly": { ar: "مقاوم للماء", en: "Waterproof" },
  "store.maxPrice": { ar: "أعلى سعر", en: "Max price" },
  "store.results": { ar: "منتج", en: "products" },
  "store.empty": { ar: "لا توجد منتجات مطابقة", en: "No matching products" },
  "store.emptyHint": {
    ar: "جرّب تعديل الفلاتر أو البحث",
    en: "Try adjusting filters or search",
  },
  "store.clear": { ar: "مسح الفلاتر", en: "Clear filters" },
  "store.sort": { ar: "ترتيب", en: "Sort" },
  "sort.popular": { ar: "الأكثر رواجاً", en: "Most popular" },
  "sort.priceAsc": { ar: "السعر: الأقل", en: "Price: low to high" },
  "sort.priceDesc": { ar: "السعر: الأعلى", en: "Price: high to low" },
  "sort.newest": { ar: "الأحدث", en: "Newest" },

  // Product card / quick view
  "product.add": { ar: "أضف للسلة", en: "Add to cart" },
  "product.added": { ar: "أُضيف ✓", en: "Added ✓" },
  "product.soldout": { ar: "نفد المخزون", en: "Sold out" },
  "product.notes": {
    ar: "ملاحظات / نص مخصص لهذا المنتج",
    en: "Notes / custom text for this product",
  },
  "product.notesPlaceholder": {
    ar: "اكتب هنا أي نص أو تعليمات خاصة…",
    en: "Write any custom text or instructions…",
  },
  "product.quantity": { ar: "الكمية", en: "Quantity" },
  "product.related": { ar: "منتجات مشابهة", en: "You may also like" },

  // Cart drawer
  "cart.title": { ar: "السلة", en: "Cart" },
  "cart.empty": { ar: "السلة فارغة", en: "Your cart is empty" },
  "cart.emptyHint": {
    ar: "أضف بعض المنتجات لتبدأ",
    en: "Add some products to get started",
  },
  "cart.browse": { ar: "تصفّح المتجر", en: "Browse store" },
  "cart.subtotal": { ar: "المجموع الفرعي", en: "Subtotal" },
  "cart.delivery": { ar: "التوصيل", en: "Delivery" },
  "cart.deliveryNote": {
    ar: "يُحتسب عند التأكيد",
    en: "Calculated at confirmation",
  },
  "cart.total": { ar: "الإجمالي", en: "Total" },
  "cart.checkout": {
    ar: "إتمام الطلب عبر واتساب",
    en: "Checkout via WhatsApp",
  },
  "cart.remove": { ar: "حذف", en: "Remove" },
  "cart.items": { ar: "عنصر", en: "items" },

  // Tracker steps
  "step.pending": { ar: "بانتظار التأكيد", en: "Pending" },
  "step.accepted": { ar: "مقبول", en: "Accepted" },
  "step.shipping": { ar: "بالطريق", en: "On the way" },
  "step.delivered": { ar: "تم التوصيل", en: "Delivered" },

  // Order statuses
  "status.review": { ar: "قيد المراجعة", en: "Under review" },
  "status.accepted": { ar: "تم القبول", en: "Accepted" },
  "status.shipped": { ar: "تم الشحن", en: "Shipped" },
  "status.delivered": { ar: "تم التسليم", en: "Delivered" },

  // Orders page
  "orders.title": { ar: "طلباتي", en: "My Orders" },
  "orders.subtitle": {
    ar: "كل طلباتك ومتابعة حالتها في مكان واحد",
    en: "All your orders and their status in one place",
  },
  "orders.tracking": { ar: "رقم التتبّع", en: "Tracking no." },
  "orders.empty": { ar: "لا توجد طلبات بعد", en: "No orders yet" },
  // Install app (PWA) banner
  "pwa.title": { ar: "ثبّت تطبيق رفوف", en: "Install the rofoof app" },
  "pwa.hint": {
    ar: "وصول أسرع من شاشتك الرئيسية",
    en: "Faster access from your home screen",
  },
  "pwa.install": { ar: "تثبيت", en: "Install" },
  "pwa.iosHint": {
    ar: "اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»",
    en: "Tap Share, then “Add to Home Screen”",
  },

  "orders.cancel": { ar: "إلغاء الطلب", en: "Cancel order" },
  "orders.cancelTitle": { ar: "إلغاء الطلب؟", en: "Cancel this order?" },
  "orders.cancelHint": {
    ar: "لا يمكن التراجع بعد الإلغاء، وسيُحذف الطلب نهائياً. يمكنك الإلغاء فقط قبل قبول الطلب.",
    en: "This can't be undone — the order will be permanently removed. You can only cancel before it's accepted.",
  },
  "orders.cancelYes": { ar: "نعم، ألغِ الطلب", en: "Yes, cancel it" },
  "orders.cancelNo": { ar: "تراجع", en: "Keep order" },
  "orders.cancelling": { ar: "جارٍ الإلغاء…", en: "Cancelling…" },
  "orders.cancelError": { ar: "تعذّر إلغاء الطلب، حاول مرة أخرى", en: "Couldn't cancel the order, try again" },

  // Favorites page
  "fav.title": { ar: "المفضلة", en: "Favorites" },
  "fav.subtitle": {
    ar: "المنتجات التي أعجبتك محفوظة هنا",
    en: "Products you liked are saved here",
  },
  "fav.empty": {
    ar: "قائمة المفضلة فارغة",
    en: "Your favorites list is empty",
  },
  "fav.emptyHint": {
    ar: "اضغط على ♥ في أي منتج لإضافته هنا",
    en: "Tap ♥ on any product to save it here",
  },
  "fav.count": { ar: "منتج مفضّل", en: "saved products" },

  // Footer
  "footer.tagline": {
    ar: "ستكرات وميداليات وبوسترات صناعة عراقية ♥",
    en: "Iraqi-made stickers, medals & posters ♥",
  },
  "footer.shop": { ar: "تسوّق", en: "Shop" },
  "footer.help": { ar: "المساعدة", en: "Help" },
  "footer.contact": { ar: "تواصل معنا", en: "Contact" },
  "footer.delivery": {
    ar: "ادارة سريعة لطلباتك",
    en: "Fast management of your orders",
  },
  "footer.location": {
    ar: "توصيل لكل المحافظات",
    en: "Delivery to all provinces",
  },
  "footer.rights": {
    ar: "جميع الحقوق محفوظة Qcode",
    en: "All rights reserved Qcode",
  },
  "footer.policies": { ar: "السياسات", en: "Policies" },
  "footer.returns": { ar: "الإرجاع والاستبدال", en: "Returns" },
  "footer.shipping": { ar: "الشحن والتوصيل", en: "Shipping" },

  // Nav (admin)
  "nav.dashboard": { ar: "لوحة التحكم", en: "Dashboard" },

  // Auth
  "auth.login": { ar: "تسجيل الدخول", en: "Sign in" },
  "auth.logout": { ar: "تسجيل الخروج", en: "Sign out" },
  "auth.account": { ar: "حسابي", en: "Account" },
  "auth.email": { ar: "البريد الإلكتروني", en: "Email" },
  "auth.password": { ar: "كلمة المرور", en: "Password" },
  "auth.signinTitle": { ar: "أهلاً بعودتك", en: "Welcome back" },
  "auth.signinSub": {
    ar: "سجّل الدخول للمتابعة إلى رفوف",
    en: "Sign in to continue to rofoof",
  },
  "auth.noAccess": { ar: "هذه الصفحة للمدراء فقط", en: "Admins only" },
  "auth.noAccessHint": {
    ar: "سجّل الدخول بحساب مدير للوصول إلى لوحة التحكم",
    en: "Sign in with an admin account to access the dashboard",
  },
  "auth.signedInAs": { ar: "مسجّل الدخول", en: "Signed in" },
  "auth.role.admin": { ar: "مدير", en: "Admin" },
  "auth.role.customer": { ar: "عميل", en: "Customer" },
  "auth.signup": { ar: "إنشاء حساب", en: "Create account" },
  "auth.signupTitle": { ar: "أنشئ حسابك", en: "Create your account" },
  "auth.signupSub": {
    ar: "انضم إلى رفوف لتتبّع طلباتك ومفضّلتك",
    en: "Join rofoof to track orders and favorites",
  },
  "auth.name": { ar: "الاسم الكامل", en: "Full name" },
  "auth.noAccount": { ar: "ليس لديك حساب؟", en: "No account?" },
  "auth.haveAccount": {
    ar: "لديك حساب بالفعل؟",
    en: "Already have an account?",
  },
  "auth.toSignup": { ar: "أنشئ حساباً", en: "Sign up" },
  "auth.toSignin": { ar: "سجّل الدخول", en: "Sign in" },
  "auth.confirmEmail": {
    ar: "تحقّق من بريدك لتأكيد الحساب ثم سجّل الدخول",
    en: "Check your email to confirm your account, then sign in",
  },
  "auth.invalidCreds": {
    ar: "بيانات الدخول غير صحيحة",
    en: "Invalid email or password",
  },
  "auth.genericError": {
    ar: "حدث خطأ، حاول مجدداً",
    en: "Something went wrong, try again",
  },
  "auth.google": { ar: "المتابعة عبر Google", en: "Continue with Google" },
  "auth.or": { ar: "أو", en: "or" },
  "auth.oauthError": {
    ar: "تعذّر تسجيل الدخول عبر Google",
    en: "Google sign-in failed",
  },
  "auth.forgot": { ar: "نسيت كلمة المرور؟", en: "Forgot password?" },
  "auth.accountExists": {
    ar: "هذا البريد مسجّل بالفعل — سجّل الدخول بدلاً من ذلك",
    en: "This email is already registered — sign in instead",
  },
  "auth.emailNotConfirmed": {
    ar: "لم يتم تأكيد بريدك بعد — تحقّق من صندوق الوارد لديك",
    en: "Your email isn't confirmed yet — check your inbox",
  },
  "auth.rateLimited": {
    ar: "محاولات كثيرة جداً، حاول مرة أخرى بعد قليل",
    en: "Too many attempts — please try again shortly",
  },
  "auth.weakPassword": {
    ar: "كلمة المرور ضعيفة جداً، اختر كلمة أقوى",
    en: "That password is too weak — choose a stronger one",
  },

  // Password reset
  "reset.requestTitle": {
    ar: "استعادة كلمة المرور",
    en: "Reset your password",
  },
  "reset.requestSub": {
    ar: "أدخل بريدك وسنرسل لك رابط استعادة كلمة المرور",
    en: "Enter your email and we'll send you a reset link",
  },
  "reset.sendLink": { ar: "إرسال الرابط", en: "Send reset link" },
  "reset.sending": { ar: "جارٍ الإرسال…", en: "Sending…" },
  "reset.sentTitle": { ar: "تحقّق من بريدك", en: "Check your email" },
  "reset.sentHint": {
    ar: "إذا كان البريد مسجّلاً لدينا فستصلك رسالة تتضمّن رابط الاستعادة خلال دقائق.",
    en: "If that email is registered, a reset link is on its way — check your inbox in a few minutes.",
  },
  "reset.backToLogin": { ar: "العودة لتسجيل الدخول", en: "Back to sign in" },
  "reset.newTitle": { ar: "كلمة مرور جديدة", en: "Set a new password" },
  "reset.newSub": {
    ar: "اختر كلمة مرور جديدة لحسابك",
    en: "Choose a new password for your account",
  },
  "reset.newPassword": { ar: "كلمة المرور الجديدة", en: "New password" },
  "reset.confirmPassword": { ar: "تأكيد كلمة المرور", en: "Confirm password" },
  "reset.update": { ar: "تحديث كلمة المرور", en: "Update password" },
  "reset.updating": { ar: "جارٍ التحديث…", en: "Updating…" },
  "reset.mismatch": {
    ar: "كلمتا المرور غير متطابقتين",
    en: "Passwords don't match",
  },
  "reset.successTitle": {
    ar: "تم تحديث كلمة المرور ✓",
    en: "Password updated ✓",
  },
  "reset.successHint": {
    ar: "يمكنك الآن استخدام كلمة المرور الجديدة لتسجيل الدخول.",
    en: "You can now sign in with your new password.",
  },
  "reset.verifying": {
    ar: "جارٍ التحقّق من الرابط…",
    en: "Verifying your link…",
  },
  "reset.invalidTitle": {
    ar: "الرابط غير صالح",
    en: "Invalid or expired link",
  },
  "reset.invalidHint": {
    ar: "انتهت صلاحية رابط الاستعادة أو تم استخدامه. اطلب رابطاً جديداً.",
    en: "This reset link has expired or was already used. Request a new one.",
  },
  "reset.requestNew": { ar: "اطلب رابطاً جديداً", en: "Request a new link" },
  "reset.goHome": { ar: "الذهاب للمتجر", en: "Go to the store" },

  // Profile
  "profile.title": { ar: "حسابي", en: "My account" },
  "profile.edit": { ar: "تعديل الملف", en: "Edit profile" },
  "profile.save": { ar: "حفظ التغييرات", en: "Save changes" },
  "profile.saving": { ar: "جارٍ الحفظ…", en: "Saving…" },
  "profile.saved": { ar: "تم الحفظ ✓", en: "Saved ✓" },
  "profile.cancel": { ar: "إلغاء", en: "Cancel" },
  "profile.notSet": { ar: "غير محدد", en: "Not set" },
  "profile.myOrders": { ar: "طلباتي", en: "My orders" },
  "profile.myFavorites": { ar: "مفضّلتي", en: "My favorites" },
  "profile.memberBadge": { ar: "عضو رفوف", en: "rofoof member" },
  "profile.contactInfo": { ar: "معلومات التواصل", en: "Contact info" },

  // Dashboard
  "dash.title": { ar: "لوحة التاجر — رفوف", en: "Merchant dashboard — rofoof" },
  "dash.overview": { ar: "نظرة عامة", en: "Overview" },
  "dash.orders": { ar: "إدارة الطلبات", en: "Orders" },
  "dash.inventory": { ar: "إدارة المخزون", en: "Inventory" },
  "dash.customers": { ar: "العملاء", en: "Customers" },
  "dash.inStock": { ar: "متوفر", en: "In stock" },
  "dash.newUsers": { ar: "مستخدمون جدد", en: "New users" },
  "dash.activeOrders": { ar: "طلبات نشطة", en: "Active orders" },
  "dash.revenue": { ar: "إجمالي الإيرادات", en: "Total revenue" },
  "dash.weeklyRevenue": {
    ar: "الإيرادات الأسبوعية (د.ع)",
    en: "Weekly revenue (IQD)",
  },
  "dash.latestOrders": { ar: "آخر الطلبات", en: "Latest orders" },
  "dash.announcement": { ar: "شريط الإعلان", en: "Announcement bar" },
  "dash.updateAnnouncement": { ar: "تحديث الإعلان", en: "Update banner" },
  "dash.announcementPlaceholder": {
    ar: "اكتب نص الإعلان…",
    en: "Write the announcement…",
  },
  "dash.saved": { ar: "تم الحفظ ✓", en: "Saved ✓" },
  "dash.reset": { ar: "استعادة الافتراضي", en: "Reset" },
  "dash.addProduct": { ar: "إضافة منتج", en: "Add product" },
  "dash.product": { ar: "المنتج", en: "Product" },
  "dash.active": { ar: "مفعّل", en: "Active" },
  "dash.inactive": { ar: "موقوف", en: "Hidden" },
  "dash.loadingMore": { ar: "جارٍ التحميل…", en: "Loading more…" },
  "dash.allLoaded": { ar: "تم عرض كل العناصر", en: "All items loaded" },
  "dash.call": { ar: "اتصال", en: "Call" },
  "dash.ordersCount": { ar: "طلب", en: "orders" },
  "dash.acceptOrder": { ar: "قبول", en: "Accept" },
  "dash.rejectOrder": { ar: "رفض", en: "Reject" },
  "dash.advance": { ar: "نقل للمرحلة التالية", en: "Advance" },
  "dash.empty": { ar: "لا عناصر", en: "No items" },

  // Detailed stats
  "dash.totalOrders": { ar: "إجمالي الطلبات", en: "Total orders" },
  "dash.deliveredOrders": { ar: "طلبات مسلّمة", en: "Delivered" },
  "dash.avgOrder": { ar: "متوسط قيمة الطلب", en: "Avg. order value" },
  "dash.revenue30d": { ar: "إيرادات آخر 30 يوماً", en: "Revenue (30 days)" },
  "dash.totalCustomers": { ar: "إجمالي العملاء", en: "Total customers" },
  "dash.lowStock": { ar: "مخزون منخفض", en: "Low stock" },
  "dash.outOfStock": { ar: "نفد المخزون", en: "Out of stock" },
  "dash.onDiscount": { ar: "منتجات مخفّضة", en: "On discount" },
  "dash.topProducts": { ar: "الأكثر مبيعاً", en: "Top sellers" },
  "dash.sold": { ar: "مباع", en: "sold" },

  // Product editor modal
  "dash.newProduct": { ar: "منتج جديد", en: "New product" },
  "dash.editProduct": { ar: "تعديل المنتج", en: "Edit product" },
  "dash.image": { ar: "صور المنتج (اختياري)", en: "Product images (optional)" },
  "dash.uploadImage": { ar: "اختر صورة", en: "Choose image" },
  "dash.cover": { ar: "الغلاف", en: "Cover" },
  "dash.fieldDiscount": { ar: "الخصم %", en: "Discount %" },
  "dash.fieldStock": { ar: "المخزون", en: "Stock" },
  "dash.fieldDescAr": { ar: "الوصف (عربي)", en: "Description (Arabic)" },
  "dash.fieldDescEn": { ar: "الوصف (إنجليزي)", en: "Description (English)" },
  "dash.fieldCategories": { ar: "الفئات", en: "Categories" },
  "dash.categoriesHint": {
    ar: "اختر فئة واحدة على الأقل",
    en: "Pick at least one category",
  },
  "dash.newCategory": { ar: "فئة جديدة", en: "New category" },
  "dash.catNameAr": { ar: "الاسم بالعربي", en: "Arabic name" },
  "dash.catNameEn": { ar: "الاسم بالإنجليزي", en: "English name" },
  "dash.addCategory": { ar: "إضافة الفئة", en: "Add category" },
  "dash.fieldFandoms": { ar: "الاهتمامات (اختياري)", en: "Fandoms (optional)" },
  "dash.newFandom": { ar: "اهتمام جديد", en: "New fandom" },
  "dash.addFandom": { ar: "إضافة", en: "Add" },
  "dash.waterproofOption": { ar: "مقاوم للماء", en: "Waterproof" },
  "dash.waterproofHint": {
    ar: "متاح للستكرات والبوسترات فقط",
    en: "Available for stickers & posters only",
  },
  "dash.deleteProduct": { ar: "حذف المنتج", en: "Delete product" },
  "dash.confirmDelete": { ar: "تأكيد الحذف؟", en: "Confirm delete?" },
  "dash.saveChanges": { ar: "حفظ التعديلات", en: "Save changes" },
  "dash.kind": { ar: "نوع المنتج", en: "Product type" },
  "dash.kind.standard": { ar: "منتج عادي", en: "Standard" },
  "dash.kind.package": {
    ar: "باكج (قطع متعددة)",
    en: "Package (multiple items)",
  },
  "dash.kind.tiered": { ar: "سعر حسب الكمية", en: "Volume pricing" },
  "dash.packageHint": {
    ar: "كل صورة قطعة مستقلة — حدّد سعرها أو اتركه فارغاً ليرث سعر المنتج",
    en: "Each image is a distinct item — set its price or leave empty to inherit",
  },
  "dash.itemPrice": { ar: "السعر", en: "Price" },
  "dash.bulkPrice": { ar: "سعر موحّد لكل الصور", en: "One price for all images" },
  "dash.applyToAll": { ar: "طبّق على الكل", en: "Apply to all" },
  "dash.tiers": { ar: "سلّم أسعار الكمية", en: "Quantity price ladder" },
  "dash.tierMinQty": { ar: "من كمية", en: "From qty" },
  "dash.tierPrice": { ar: "سعر القطعة", en: "Unit price" },
  "dash.addTier": { ar: "إضافة درجة", en: "Add tier" },
  "dash.surcharge": {
    ar: "زيادة سعر المقاوم للماء (د.ع)",
    en: "Waterproof surcharge (IQD)",
  },
  "dash.allowCustom": {
    ar: "السماح بصورة مخصصة من الزبون",
    en: "Allow customer's custom image",
  },

  // Offers manager
  "dash.offersTab": { ar: "العروض", en: "Offers" },
  "offer.new": { ar: "عرض جديد", en: "New offer" },
  "offer.kind.bundle": {
    ar: "اشترِ X واحصل على Y مجاناً",
    en: "Buy X get Y free",
  },
  "offer.kind.cart_percent": {
    ar: "خصم على مجموع السلة",
    en: "Cart total discount",
  },
  "offer.kind.cart_delivery": {
    ar: "توصيل مجاني/مخفّض",
    en: "Free/discounted delivery",
  },
  "offer.kind.flash": { ar: "عرض خاطف (مؤقت)", en: "Flash sale (timed)" },
  "offer.titleAr": { ar: "عنوان العرض (عربي)", en: "Offer title (Arabic)" },
  "offer.titleEn": { ar: "عنوان العرض (إنجليزي)", en: "Offer title (English)" },
  "offer.product": { ar: "المنتج", en: "Product" },
  "offer.buyQty": { ar: "اشترِ", en: "Buy" },
  "offer.freeQty": { ar: "مجاناً", en: "Get free" },
  "offer.minCart": { ar: "الحد الأدنى للسلة (د.ع)", en: "Minimum cart (IQD)" },
  "offer.percent": { ar: "نسبة الخصم %", en: "Discount %" },
  "offer.deliveryFee": {
    ar: "أجرة التوصيل (0 = مجاني)",
    en: "Delivery fee (0 = free)",
  },
  "offer.endsAt": { ar: "ينتهي في", en: "Ends at" },
  "offer.create": { ar: "إنشاء العرض", en: "Create offer" },
  "offer.live": { ar: "فعّال", en: "Live" },
  "offer.off": { ar: "متوقف", en: "Off" },
  "offer.expired": { ar: "انتهى", en: "Expired" },
  "offer.delete": { ar: "حذف", en: "Delete" },
  "offer.empty": {
    ar: "لا عروض بعد — أنشئ أول عرض",
    en: "No offers yet — create your first",
  },

  // Order cards / bulk actions
  "dash.selectAll": { ar: "تحديد الكل", en: "Select all" },
  "dash.selected": { ar: "محدد", en: "selected" },
  "dash.nextStep": { ar: "الخطوة التالية", en: "Next step" },
  "dash.prevStep": { ar: "الخطوة السابقة", en: "Previous step" },
  "dash.itemsLabel": { ar: "القطع", en: "Items" },
  "dash.orderDetails": { ar: "تفاصيل الطلب", en: "Order details" },
  "dash.customerInfo": { ar: "بيانات الزبون", en: "Customer info" },
  "dash.setStatus": { ar: "حالة الطلب", en: "Order status" },
  "dash.viewDetails": { ar: "عرض التفاصيل", en: "View details" },

  // Analytics
  "dash.statusDist": {
    ar: "توزيع حالات الطلبات",
    en: "Order status distribution",
  },
  "dash.salesRatio": { ar: "نسبة المبيعات", en: "Sales ratio" },
  "dash.customOrders": { ar: "الطلبات المخصصة", en: "Custom requests" },
  "dash.customRevenue": {
    ar: "إيراد الطلبات المخصصة",
    en: "Custom requests revenue",
  },

  // Custom design requests
  "custom.title": { ar: "اطلب تصميمك الخاص", en: "Order your custom design" },
  "custom.subtitle": {
    ar: "ارفع صورك ونحوّلها لبروشات أو ستكرات أو بوسترات",
    en: "Upload your images and we turn them into brooches, stickers or posters",
  },
  "custom.cardHint": { ar: "صمّمها على كيفك", en: "Make it yours" },
  "custom.chooseType": {
    ar: "شنو تريد نسوّيلك؟",
    en: "What should we make for you?",
  },
  "custom.type.brooch": { ar: "بروش", en: "Brooch" },
  "custom.type.sticker": { ar: "ستكر", en: "Sticker" },
  "custom.type.poster": { ar: "بوستر", en: "Poster" },
  "custom.images": { ar: "صورك", en: "Your images" },
  "custom.imagesHint": {
    ar: "حتى 20 صورة، 10MB لكل صورة — كل صورة = قطعة",
    en: "Up to 20 images, 10MB each — every image = one piece",
  },
  "custom.addImages": { ar: "أضف صورك", en: "Add your images" },
  "custom.tooBig": {
    ar: "صورة أكبر من 10MB تم تجاهلها",
    en: "An image over 10MB was skipped",
  },
  "custom.description": {
    ar: "وصف طلبك (اختياري)",
    en: "Describe your request (optional)",
  },
  "custom.descPlaceholder": {
    ar: "مقاسات، ألوان، ملاحظات خاصة…",
    en: "Sizes, colors, special notes…",
  },
  "custom.perPiece": { ar: "سعر القطعة", en: "Per piece" },
  "custom.piecesCount": { ar: "عدد القطع", en: "Pieces" },
  "custom.estimated": { ar: "السعر التقديري", en: "Estimated price" },
  "custom.addToCart": { ar: "أضف إلى السلة", en: "Add to cart" },
  "custom.sending": {
    ar: "جارٍ رفع الصور…",
    en: "Uploading images…",
  },
  "custom.badge": { ar: "طلب مخصص", en: "Custom request" },
  "custom.imagesLabel": { ar: "الصور المرفقة", en: "Attached images" },
  "custom.pricingTitle": {
    ar: "أسعار الطلبات المخصصة",
    en: "Custom request pricing",
  },

  // Discounts (buyer-facing)
  "product.off": { ar: "خصم", en: "OFF" },
  "product.from": { ar: "يبدأ من", en: "From" },
  "product.chooseItem": { ar: "اختر التصميم", en: "Pick a design" },
  "product.chooseItems": { ar: "اختر التصاميم", en: "Pick your designs" },
  "product.waterproofOption": {
    ar: "نسخة مقاومة للماء",
    en: "Waterproof version",
  },
  "product.customImage": {
    ar: "اطبع تصميمك الخاص",
    en: "Print your own design",
  },
  "product.customImageHint": {
    ar: "ارفع صورة عالية الجودة وسنطبعها لك",
    en: "Upload a high-quality image and we'll print it",
  },
  "product.uploadCustom": { ar: "ارفع صورتك", en: "Upload your image" },
  "product.customUploaded": { ar: "تم رفع صورتك ✓", en: "Image uploaded ✓" },
  "product.tierTable": { ar: "سعر الكمية", en: "Volume pricing" },
  "product.perUnit": { ar: "للقطعة", en: "each" },
  "offer.endsIn": { ar: "ينتهي خلال", en: "Ends in" },
  "cart.free": { ar: "مجاناً", en: "FREE" },
  "cart.pieces": { ar: "قطعة", en: "pieces" },
  "cart.discount": { ar: "الخصم", en: "Discount" },
  "cart.freeDelivery": { ar: "توصيل مجاني", en: "Free delivery" },
  "dash.changeImage": { ar: "تغيير الصورة", en: "Change image" },
  "dash.uploading": { ar: "جارٍ رفع الصورة…", en: "Uploading…" },
  "dash.fieldNameAr": { ar: "الاسم (عربي)", en: "Name (Arabic)" },
  "dash.fieldNameEn": { ar: "الاسم (إنجليزي)", en: "Name (English)" },
  "dash.fieldPrice": { ar: "السعر (د.ع)", en: "Price (IQD)" },
  "dash.fieldCategory": { ar: "الفئة", en: "Category" },
  "dash.fieldEmoji": { ar: "الرمز", en: "Emoji" },
  "dash.save": { ar: "حفظ المنتج", en: "Save product" },
  "dash.cancel": { ar: "إلغاء", en: "Cancel" },

  // Provinces (bilingual taxonomy — mirrors the `provinces` table)
  "province.baghdad": { ar: "بغداد", en: "Baghdad" },
  "province.basra": { ar: "البصرة", en: "Basra" },
  "province.nineveh": { ar: "نينوى", en: "Nineveh" },
  "province.erbil": { ar: "أربيل", en: "Erbil" },
  "province.najaf": { ar: "النجف", en: "Najaf" },
  "province.karbala": { ar: "كربلاء", en: "Karbala" },
  "province.kirkuk": { ar: "كركوك", en: "Kirkuk" },
  "province.anbar": { ar: "الأنبار", en: "Anbar" },
  "province.diyala": { ar: "ديالى", en: "Diyala" },
  "province.dhiqar": { ar: "ذي قار", en: "Dhi Qar" },
  "province.babil": { ar: "بابل", en: "Babil" },
  "province.wasit": { ar: "واسط", en: "Wasit" },
  "province.maysan": { ar: "ميسان", en: "Maysan" },
  "province.muthanna": { ar: "المثنى", en: "Muthanna" },
  "province.qadisiyah": { ar: "القادسية", en: "Qadisiyah" },
  "province.saladin": { ar: "صلاح الدين", en: "Saladin" },
  "province.sulaymaniyah": { ar: "السليمانية", en: "Sulaymaniyah" },
  "province.duhok": { ar: "دهوك", en: "Duhok" },

  // Checkout
  "checkout.title": { ar: "إتمام الطلب", en: "Checkout" },
  "checkout.name": { ar: "الاسم الكامل", en: "Full name" },
  "checkout.phone": { ar: "رقم الهاتف", en: "Phone number" },
  "checkout.province": { ar: "المحافظة", en: "Province" },
  "checkout.selectProvince": { ar: "اختر المحافظة", en: "Select a province" },
  "checkout.address": { ar: "العنوان (اختياري)", en: "Address (optional)" },
  "checkout.note": { ar: "ملاحظة (اختياري)", en: "Note (optional)" },
  "checkout.confirm": { ar: "تأكيد الطلب", en: "Place order" },
  "checkout.required": {
    ar: "الاسم ورقم الهاتف والمحافظة مطلوبة لإتمام الطلب",
    en: "Name, phone and province are required to place an order",
  },
  "checkout.placing": { ar: "جارٍ الإرسال…", en: "Placing…" },
  "checkout.back": { ar: "رجوع للسلة", en: "Back to cart" },
  "checkout.proceed": { ar: "متابعة الطلب", en: "Proceed to checkout" },
  "checkout.error": {
    ar: "تعذّر إتمام الطلب، حاول مجدداً",
    en: "Couldn't place the order, try again",
  },
  "checkout.successTitle": { ar: "تم استلام طلبك ✓", en: "Order received ✓" },
  "checkout.successHint": {
    ar: "احتفظ بكود الطلب لتتبّعه. سنتواصل معك عبر واتساب للتأكيد.",
    en: "Keep your order code to track it. We'll confirm via WhatsApp.",
  },
  "checkout.sendWhatsapp": { ar: "إرسال عبر واتساب", en: "Send via WhatsApp" },
  "checkout.done": { ar: "تم", en: "Done" },

  // Store pagination
  "store.prev": { ar: "السابق", en: "Previous" },
  "store.next": { ar: "التالي", en: "Next" },
  "store.page": { ar: "صفحة", en: "Page" },
  "store.of": { ar: "من", en: "of" },

  // Misc
  currency: { ar: "د.ع", en: "IQD" },

  // 404 / error pages
  "notFound.title": { ar: "الصفحة غير موجودة", en: "Page not found" },
  "notFound.hint": {
    ar: "الرابط الذي فتحته غير صحيح أو تم نقل الصفحة.",
    en: "The link you followed is broken, or the page has moved.",
  },
  "notFound.home": { ar: "العودة للرئيسية", en: "Back to home" },
  "notFound.store": { ar: "تصفّح المتجر", en: "Browse the store" },
  "error.title": { ar: "حدث خطأ ما", en: "Something went wrong" },
  "error.hint": {
    ar: "واجهنا مشكلة غير متوقعة. حاول مرة أخرى، وإن استمرت المشكلة تواصل معنا.",
    en: "We hit an unexpected snag. Try again, and contact us if it keeps happening.",
  },
  "error.retry": { ar: "إعادة المحاولة", en: "Try again" },
  "error.digest": { ar: "رمز الخطأ", en: "Error reference" },
} as const;

export type DictKey = keyof typeof dict;

export function translate(key: DictKey, lang: Lang): string {
  return dict[key][lang];
}
