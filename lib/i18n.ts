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
  "hero.title": {
    ar: "منتجات صناعة عراقية",
    en: "Iraqi-made products",
  },
  "hero.desc": {
    ar: " ستكرات, ميداليات, بروشات, بوسترات لكل اهتماماتكم ♥",
    en: "Stickers, medals, brooches & posters for all your interests ♥",
  },
  "hero.shop": { ar: "تسوّق الآن", en: "Shop now" },
  "hero.track": { ar: "تتبّع طلبك", en: "Track order" },
  "stat.followers": { ar: "متابع", en: "Followers" },
  "stat.products": { ar: "منتج", en: "Products" },
  "stat.sales": { ar: "المبيعات", en: "Sales" },

  // Sections
  "section.bestsellers": { ar: "الأكثر طلباً", en: "Best sellers" },
  "section.fresh": { ar: "وصل حديثاً", en: "Just landed" },

  // Delivery notice (home page, directly under the hero)
  "delivery.title": {
    ar: "يطبق خصم توصيل",
    en: "A delivery discount applies",
  },
  "delivery.flat": { ar: "بحد ادنى للطلب", en: "Minimum order value" },
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
  // Guest order tracking (no account → look one order up by ID + phone)
  "orders.trackTitle": { ar: "تتبّع طلبك", en: "Track your order" },
  "orders.trackSubtitle": {
    ar: "أدخل رقم الطلب ورقم هاتفك للاطّلاع على آخر حالة لشرائك.",
    en: "Enter your Order ID and phone to check the latest status of your purchase.",
  },
  "orders.trackCodeLabel": { ar: "رقم الطلب", en: "Order ID" },
  "orders.trackCodePlaceholder": {
    ar: "الرقم الظاهر في تأكيد طلبك",
    en: "The code from your order confirmation",
  },
  "orders.trackPhoneLabel": { ar: "رقم الهاتف", en: "Phone number" },
  "orders.trackPhoneHint": {
    ar: "لحمايتك، أدخل رقم الهاتف الذي استخدمته عند الطلب.",
    en: "For your security, enter the phone number you used on the order.",
  },
  "orders.trackButton": { ar: "تتبّع الطلب", en: "Track order" },
  "orders.trackingLoad": { ar: "جارٍ البحث…", en: "Searching…" },
  "orders.trackNotFound": {
    ar: "لم نعثر على طلب بهذا الرقم ورقم الهاتف. تأكّد منهما وحاول مجدداً.",
    en: "No order matches that ID and phone. Double-check both and try again.",
  },
  "orders.trackAnother": { ar: "تتبّع طلب آخر", en: "Track another order" },
  "orders.trackCancelledTitle": {
    ar: "تم إلغاء طلبك",
    en: "Your order was cancelled",
  },
  "orders.trackCancelledHint": {
    ar: "تم إلغاء الطلب بنجاح. يمكنك تقديم طلب جديد في أي وقت.",
    en: "The order was cancelled successfully. You can place a new order anytime.",
  },
  "orders.guestSignInPrompt": {
    ar: "لديك حساب؟ سجّل الدخول لعرض كل طلباتك تلقائياً.",
    en: "Have an account? Sign in to see all your orders automatically.",
  },
  // Guest checkout — account benefits card
  "guest.title": {
    ar: "أنشئ حساباً لتجربة أفضل",
    en: "Create an account for a better experience",
  },
  "guest.subtitle": {
    ar: "يمكنك المتابعة كضيف، لكن إنشاء حساب يمنحك مزايا إضافية.",
    en: "You can continue as a guest, but creating an account unlocks additional features.",
  },
  "guest.benefitWishlist": {
    ar: "احفظ منتجاتك في المفضّلة",
    en: "Save products to your wishlist",
  },
  "guest.benefitAutofill": {
    ar: "تعبئة معلوماتك تلقائياً في طلباتك القادمة",
    en: "Auto-fill your info during future checkouts",
  },
  "guest.benefitOrders": {
    ar: "عرض ومتابعة كل طلباتك تلقائياً",
    en: "Automatically view and track all your orders",
  },
  "guest.benefitProfile": {
    ar: "ملف شخصي وإدارة كاملة لحسابك",
    en: "Personal profile and account management",
  },
  "guest.benefitFaster": {
    ar: "تجربة شراء أسرع",
    en: "Faster checkout experience",
  },
  "guest.continueAsGuest": { ar: "المتابعة كضيف", en: "Continue as guest" },
  "guest.signIn": {
    ar: "تسجيل الدخول / إنشاء حساب",
    en: "Sign in / Create account",
  },
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
  "pwa.iosGuide": { ar: "طريقة التثبيت", en: "How to install" },
  "pwa.iosGuideTitle": {
    ar: "أضِف رفوف إلى شاشتك الرئيسية",
    en: "Add rofoof to your Home Screen",
  },
  "pwa.iosStep1": {
    ar: "اضغط زر المشاركة ⬆︎ في شريط المتصفح بالأسفل",
    en: "Tap the Share button ⬆︎ in the browser bar below",
  },
  "pwa.iosStep2": {
    ar: "مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية»",
    en: "Scroll down and choose “Add to Home Screen”",
  },
  "pwa.iosStep3": {
    ar: "اضغط «إضافة» في الأعلى — وانتهيت!",
    en: "Tap “Add” at the top — and you're done!",
  },
  "pwa.gotIt": { ar: "فهمت", en: "Got it" },

  "orders.cancel": { ar: "إلغاء الطلب", en: "Cancel order" },
  "orders.cancelTitle": { ar: "إلغاء الطلب؟", en: "Cancel this order?" },
  "orders.cancelHint": {
    ar: "لا يمكن التراجع بعد الإلغاء، وسيُحذف الطلب نهائياً. يمكنك الإلغاء فقط قبل قبول الطلب.",
    en: "This can't be undone — the order will be permanently removed. You can only cancel before it's accepted.",
  },
  "orders.cancelYes": { ar: "نعم، ألغِ الطلب", en: "Yes, cancel it" },
  "orders.cancelNo": { ar: "تراجع", en: "Keep order" },
  "orders.cancelling": { ar: "جارٍ الإلغاء…", en: "Cancelling…" },
  "orders.cancelError": {
    ar: "تعذّر إلغاء الطلب، حاول مرة أخرى",
    en: "Couldn't cancel the order, try again",
  },

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
    ar: "جميع الحقوق محفوظة",
    en: "All rights reserved",
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
  "dash.featured": { ar: "المميّزة", en: "Featured" },
  "dash.customers": { ar: "العملاء", en: "Customers" },
  "dash.inStock": { ar: "متوفر", en: "In stock" },
  "dash.newUsers": { ar: "مستخدمون جدد", en: "New users" },
  "dash.activeOrders": { ar: "طلبات نشطة", en: "Active orders" },
  "dash.revenue": { ar: "إجمالي الإيرادات", en: "Total revenue" },
  "dash.periodStats": { ar: "إحصائيات الفترة", en: "Period stats" },
  "dash.daily": { ar: "يومي", en: "Daily" },
  "dash.monthly": { ar: "شهري", en: "Monthly" },
  "dash.yearly": { ar: "سنوي", en: "Yearly" },
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
  "dash.featuredToggle": { ar: "منتج مميّز", en: "Featured product" },
  "dash.featuredToggleHint": {
    ar: "يظهر في قسم «المختارات» على الصفحة الرئيسية",
    en: "Shows in the “Featured picks” section on the home page",
  },
  "dash.featuredTitle": {
    ar: "اسم قسم المختارات",
    en: "Showcase section name",
  },
  "dash.featuredTitleHint": {
    ar: "العنوان الظاهر فوق المنتجات المميّزة في الصفحة الرئيسية",
    en: "The heading shown above the featured products on the home page",
  },
  "dash.featuredTitleAr": { ar: "الاسم بالعربية", en: "Name in Arabic" },
  "dash.featuredTitleEn": { ar: "الاسم بالإنجليزية", en: "Name in English" },
  "dash.featuredRename": { ar: "تعديل اسم القسم", en: "Rename section" },
  "dash.featuredList": { ar: "المنتجات المميّزة", en: "Featured products" },
  "dash.featuredRemove": { ar: "إزالة", en: "Remove" },
  "dash.featuredEmpty": {
    ar: "لا توجد منتجات مميّزة بعد",
    en: "No featured products yet",
  },
  "dash.featuredEmptyHint": {
    ar: "اضغط نجمة ⭐ على أي منتج، أو فعّل «منتج مميّز» في نافذة تعديل المنتج.",
    en: "Tap the ⭐ on any product, or turn on “Featured product” in the product editor.",
  },
  "dash.cancelOrder": { ar: "إلغاء / حذف الطلب", en: "Cancel / delete order" },
  "dash.cancelOrderHint": {
    ar: "يمكنك إلغاء الطلب في أي مرحلة — سيُحذف نهائياً ويصل إشعار للبوت.",
    en: "You can cancel at any stage — the order is permanently removed and the bot is notified.",
  },
  "dash.featuredGroups": { ar: "أقسام المختارات", en: "Showcase sections" },
  "dash.featuredGroupsHint": {
    ar: "كل قسم يظهر كصف مستقل في الصفحة الرئيسية بين «الأكثر طلباً» و«وصل حديثاً».",
    en: "Each section is its own row on the home page, between “Most ordered” and “Just landed”.",
  },
  "dash.newGroup": { ar: "قسم جديد", en: "New section" },
  "dash.createGroup": { ar: "إنشاء القسم", en: "Create section" },
  "dash.deleteGroup": { ar: "حذف القسم", en: "Delete section" },
  "dash.moveUp": { ar: "تحريك للأعلى", en: "Move up" },
  "dash.moveDown": { ar: "تحريك للأسفل", en: "Move down" },
  "dash.groupProducts": { ar: "منتجات القسم", en: "Section products" },
  "dash.noGroups": { ar: "لا توجد أقسام بعد", en: "No sections yet" },
  "dash.noGroupsHint": {
    ar: "أنشئ قسماً أولاً، ثم أضِف إليه المنتجات بنجمة ⭐ على أي بطاقة أو من هنا.",
    en: "Create a section first, then fill it from the ⭐ on any product card or right here.",
  },
  "dash.linkLabel": { ar: "زر «عرض الكل»", en: "“View all” button" },
  "dash.linkHint": {
    ar: "اختر الفلتر الذي ينتقل إليه الزبون في المتجر. اتركه فارغاً لإخفاء الزر.",
    en: "Pick the store filter the button opens. Leave empty to hide the button.",
  },
  "dash.linkNone": { ar: "بدون زر", en: "No button" },
  "dash.linkPickHint": {
    ar: "اختر واحداً أو أكثر — سيعرض المتجر نتائجها كلها معاً.",
    en: "Pick one or more — the store shows all of them together.",
  },
  "dash.linkPickedHint": {
    ar: "اضغط على أي خيار لإضافته أو إزالته.",
    en: "Tap any option to add or remove it.",
  },
  "dash.featuredTargetGroup": { ar: "إلى القسم", en: "Into section" },
  "dash.featuredBulk": {
    ar: "إضافة مجموعة دفعة واحدة",
    en: "Add a whole group at once",
  },
  "dash.featuredBulkHint": {
    ar: "اختر فئة أو تصنيفاً فرعياً أو مجموعة لإضافة كل منتجاتها إلى المختارات.",
    en: "Pick a category, subfilter, or fandom to feature all of its products.",
  },
  "dash.featuredBy": { ar: "حسب", en: "By" },
  "dash.byCategory": { ar: "الفئة", en: "Category" },
  "dash.bySubcategory": { ar: "التصنيف الفرعي", en: "Subfilter" },
  "dash.byFandom": { ar: "المجموعة", en: "Fandom" },
  "dash.featuredPick": { ar: "الاختيار", en: "Selection" },
  "dash.featuredPickValue": { ar: "اختر…", en: "Choose…" },
  "dash.featuredAddAll": { ar: "إضافة الكل", en: "Add all" },
  "dash.featuredAllIn": {
    ar: "كل منتجات هذا الاختيار مُضافة مسبقاً.",
    en: "Every product in this selection is already featured.",
  },
  "dash.featuredAdded": { ar: "أُضيفت إلى المختارات", en: "added to featured" },
  "dash.loadingMore": { ar: "جارٍ التحميل…", en: "Loading more…" },
  "dash.allLoaded": { ar: "تم عرض كل العناصر", en: "All items loaded" },
  "dash.call": { ar: "اتصال", en: "Call" },
  "dash.customerUnnamed": { ar: "بلا اسم", en: "No name" },
  "dash.customerNoOrders": { ar: "لا طلبات بعد", en: "No orders yet" },
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

  // Waterproof master switches (top of the inventory page)
  "dash.waterproofSwitches": { ar: "خدمة المقاوم للماء", en: "Waterproof add-on" },
  "dash.waterproofSwitchesHint": {
    ar: "إيقاف أي منهما يخفي خيار المقاوم للماء عن الزبون — إعدادات كل منتج تبقى كما هي وترجع عند التفعيل.",
    en: "Switching either off hides the waterproof option from shoppers. Each product keeps its own setting and gets it back when you switch it on.",
  },
  "dash.waterproofProducts": { ar: "منتجات المتجر", en: "Store products" },
  "dash.waterproofCustom": { ar: "الطلبات المخصصة", en: "Custom requests" },
  "dash.waterproofMigration": {
    ar: "شغّل docs/waterproof-switches.sql في Supabase أولاً لتفعيل هذين المفتاحين.",
    en: "Run docs/waterproof-switches.sql in Supabase first to enable these two switches.",
  },

  // Restock queue (dashboard)
  "dash.restock": { ar: "إعادة التخزين", en: "Restock" },
  "restock.subtitle": {
    ar: "المنتجات التي بيعت منذ آخر مرة أعدت تعبئتها",
    en: "Products that have sold since you last restocked them",
  },
  "restock.searchPlaceholder": { ar: "ابحث عن منتج…", en: "Search a product…" },
  "restock.sortLabel": { ar: "الترتيب", en: "Sort" },
  "restock.sortDemand": { ar: "الأكثر طلباً للتعبئة", en: "Most needed" },
  "restock.sortDateNew": { ar: "الأحدث إضافة", en: "Newest added" },
  "restock.sortDateOld": { ar: "الأقدم إضافة", en: "Oldest added" },
  "restock.sortOrdersDesc": { ar: "الأكثر طلبات", en: "Most orders" },
  "restock.sortOrdersAsc": { ar: "الأقل طلبات", en: "Fewest orders" },
  "restock.categoryFilter": { ar: "الفئة", en: "Category" },
  "restock.soldSince": { ar: "بيع منذ آخر تعبئة", en: "Sold since restock" },
  "restock.addToStock": { ar: "أضف للمخزون", en: "Add to stock" },
  "restock.customAmount": { ar: "كمية مخصصة", en: "Custom amount" },
  "restock.confirmRestock": { ar: "تأكيد الإضافة", en: "Confirm" },
  "restock.blacklist": { ar: "إيقاف التتبع", en: "Stop tracking" },
  "restock.blacklistConfirm": {
    ar: "سيتوقف هذا المنتج عن الظهور في قائمة إعادة التخزين حتى تُعيد تفعيله.",
    en: "This item will stop appearing in the restock queue until you re-enable it.",
  },
  "restock.unblacklist": { ar: "إعادة التتبع", en: "Track again" },
  "restock.blacklistedSection": { ar: "متوقّفة عن التتبع", en: "Not tracked" },
  "restock.blacklistedEmpty": { ar: "لا عناصر متوقفة عن التتبع", en: "Nothing muted" },
  "restock.lifetimeSold": { ar: "إجمالي المبيعات", en: "Lifetime sold" },
  "restock.lastRestocked": { ar: "آخر تعبئة", en: "Last restocked" },
  "restock.neverRestocked": { ar: "لم تُعبَّأ من قبل", en: "Never restocked" },
  "restock.recentOrders": { ar: "أحدث الطلبات", en: "Recent orders" },
  // `dash.kind` is also "نوع المنتج", which put that exact title on two
  // different boxes side by side. This one names the box that asks HOW a
  // product is sold, so the two read as the different questions they are.
  "restock.kindFilter": { ar: "شكل البيع", en: "Sold as" },
  "restock.loadFailed": { ar: "تعذّر تحميل القائمة", en: "Couldn't load the list" },
  "restock.needsMigration": {
    ar: "شغّل docs/restock-queue.sql في Supabase أولاً.",
    en: "Run docs/restock-queue.sql in Supabase first.",
  },
  "restock.soldUnits": { ar: "مباع", en: "sold" },
  "restock.emptyQueue": { ar: "لا شيء يحتاج تعبئة الآن 🎉", en: "Nothing needs restocking 🎉" },
  "restock.emptyQueueHint": {
    ar: "أي منتج يُباع سيظهر هنا تلقائياً.",
    en: "Anything that sells will show up here automatically.",
  },
  "restock.viewDetails": { ar: "عرض التفاصيل", en: "View details" },

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
  "dash.bulkPrice": {
    ar: "سعر موحّد لكل الصور",
    en: "One price for all images",
  },
  "dash.itemStock": { ar: "المخزون", en: "Stock" },
  "dash.bulkStock": {
    ar: "مخزون موحّد لكل الصور",
    en: "One stock count for all images",
  },
  "dash.applyToAll": { ar: "طبّق على الكل", en: "Apply to all" },
  "dash.fixedAmount": { ar: "مبلغ", en: "Amount" },
  "currency.iqd": { ar: "د.ع", en: "IQD" },
  "dash.discountHint": {
    ar: "اختر نسبة مئوية أو مبلغ ثابت — يُطبَّق الأفضل للزبون",
    en: "Pick a percentage or a flat amount — the better one for the customer wins",
  },
  "auth.lockedOut": {
    ar: "محاولات كثيرة فاشلة — الحساب مقفل مؤقتاً",
    en: "Too many failed attempts — this account is temporarily locked",
  },
  "auth.minutes": { ar: "دقيقة", en: "minutes" },
  "auth.badEmail": {
    ar: "صيغة الإيميل غير صحيحة",
    en: "That email doesn't look valid",
  },
  "auth.badName": { ar: "الاسم قصير جداً", en: "Please enter your full name" },
  "auth.badPhone": {
    ar: "صيغة رقم الهاتف غير صحيحة",
    en: "That phone number doesn't look valid",
  },
  "dash.acceptOutOfStock": {
    ar: "تعذّر قبول الطلب: المخزون المتبقي لا يكفي لأحد المنتجات. حدّث المخزون ثم أعد المحاولة.",
    en: "Couldn't accept the order — there isn't enough stock left for one of its products. Update the stock and try again.",
  },
  "dash.deliveryFees": { ar: "أجور التوصيل", en: "Delivery fees" },
  "dash.deliveryNotice": {
    ar: "إظهار شريط التوصيل في الرئيسية",
    en: "Show the delivery bar on the home page",
  },
  "dash.deliveryNoticeHint": {
    ar: "يظهر تحت القسم الرئيسي مباشرة، ويعرض أجرة التوصيل لبقية المحافظات",
    en: "Sits directly under the hero and shows the all-provinces fee",
  },
  "dash.deliveryFeesHint": {
    ar: "تُحتسب تلقائياً على كل طلب حسب المحافظة",
    en: "Applied automatically to every order based on the province",
  },
  "dash.feeKarbala": { ar: "كربلاء", en: "Karbala" },
  "dash.feeOther": { ar: "باقي المحافظات", en: "Other provinces" },
  "dash.landingStats": {
    ar: "أرقام الصفحة الرئيسية",
    en: "Landing page stats",
  },
  "dash.landingStatsHint": {
    ar: "تظهر في أعلى الصفحة الرئيسية",
    en: "Shown at the top of the home page",
  },
  "dash.coupons": { ar: "أكواد الخصم", en: "Discount codes" },
  "dash.newCoupon": { ar: "كود جديد", en: "New code" },
  "dash.couponValue": { ar: "قيمة الخصم", en: "Discount" },
  "dash.couponMinSubtotal": { ar: "أقل مجموع", en: "Min subtotal" },
  "dash.couponUsageLimit": { ar: "حد الاستخدام", en: "Usage limit" },
  "dash.couponPerUser": { ar: "لكل زبون", en: "Per customer" },
  "dash.couponPerUserShort": { ar: "زبون", en: "customer" },
  "dash.couponUsed": { ar: "استُخدم", en: "used" },
  "dash.couponTargets": { ar: "زبائن محددون", en: "Specific customers" },
  "dash.couponTargetsHint": {
    ar: "إيميلات مفصولة بفواصل — اتركه فارغاً للجميع",
    en: "comma-separated emails — leave empty for everyone",
  },
  "dash.couponTargetsShort": { ar: "زبون", en: "targeted" },
  "dash.couponProducts": { ar: "منتجات محددة", en: "Specific products" },
  "dash.couponProductsHint": {
    ar: "اتركه فارغاً ليطبَّق على كل السلة",
    en: "leave empty to apply to the whole cart",
  },
  "dash.couponProductsShort": { ar: "منتج", en: "products" },
  "dash.couponNoUsers": {
    ar: "لم يُعثر على زبائن بهذه الإيميلات",
    en: "No customers matched those emails",
  },
  "dash.fieldSubcategories": { ar: "التصنيفات الفرعية", en: "Subcategories" },
  "dash.subcategoriesHint": { ar: "اختياري", en: "optional" },
  "dash.newSubcategory": { ar: "تصنيف فرعي جديد", en: "New subcategory" },
  "store.subcategory": { ar: "التصنيف الفرعي", en: "Subcategory" },
  "store.perPage": { ar: "لكل صفحة", en: "Per page" },
  // The store's two category boxes. Group 1 asks what the thing IS, group 2
  // asks what it is ABOUT, and the hint is the only place the AND between them
  // is spelled out — so it carries a worked example rather than a rule.
  "store.groupType": { ar: "نوع المنتج", en: "Product type" },
  "store.groupTypeHint": {
    ar: "شنو تريد: ستكر، بوستر، بروش، ميدالية…",
    en: "What you want: sticker, poster, brooch, medal…",
  },
  "store.groupTheme": { ar: "الاهتمام", en: "Theme" },
  "store.groupThemeHint": {
    ar: "عن شنو: العاب، انمي، كرة قدم…",
    en: "What it's about: games, anime, football…",
  },
  "store.groupsHint": {
    ar: "اختر من الصندوقين معاً لنتيجة أدق — ستكرات + العاب = ستكرات العاب. الصندوق الفارغ يعني «الكل»، وعلامة + على أي فئة تفتح تصنيفاتها الفرعية.",
    en: "Combine the two boxes to narrow things down — stickers + games = game stickers. An empty box means “all”, and the + on a chip opens its subfilters.",
  },
  "store.manageFilters": { ar: "إدارة الفلاتر", en: "Manage filters" },
  "store.manageFiltersHint": {
    ar: "الحذف لا يمسح المنتجات — التصنيف يختفي من الفلاتر فقط",
    en: "Deleting never removes products — the entry just stops appearing in the filters",
  },
  "dash.catGroup": { ar: "صندوق الفلتر", en: "Filter box" },
  "dash.catGroupHint": {
    ar: "اضغط على أي فئة لنقلها بين الصندوقين",
    en: "Tap a category to move it between the two boxes",
  },
  "cart.coupon": { ar: "كود الخصم", en: "Discount code" },
  "cart.couponApply": { ar: "تطبيق", en: "Apply" },
  "cart.couponRemove": { ar: "إزالة", en: "Remove" },
  "cart.couponInvalid": { ar: "الكود غير صالح", en: "Invalid code" },
  "cart.couponExpired": {
    ar: "انتهت صلاحية الكود",
    en: "This code has expired",
  },
  "cart.couponMin": {
    ar: "لم تصل للحد الأدنى للطلب",
    en: "Order total is below the minimum",
  },
  "cart.couponUsed": {
    ar: "تم استهلاك هذا الكود",
    en: "This code has been used up",
  },
  "cart.couponLogin": {
    ar: "سجّل الدخول لاستخدام هذا الكود",
    en: "Sign in to use this code",
  },
  "cart.couponScoped": {
    ar: "يطبَّق على منتجات محددة — يُحتسب النهائي عند الإتمام",
    en: "Applies to selected products — final amount is set at checkout",
  },
  "dash.volumePriced": { ar: "تسعير حسب العدد", en: "Price by count" },
  "dash.volumeLadder": { ar: "سلّم الأعداد", en: "Count ladder" },
  "dash.volumeLadderHint": {
    ar: "سلّم مشترك بين كل المنتجات المسعّرة حسب العدد — أضف أو احذف الدرجات كما تشاء",
    en: "Shared by every count-priced product — add or remove rungs freely",
  },
  "dash.saveLadder": { ar: "حفظ السلّم", en: "Save ladder" },
  "dash.volumePricedHint": {
    ar: "يُحسب سعر القطعة من سلّم الأعداد العام مع بقية المنتجات في نفس الطلب",
    en: "Unit price comes from the global count ladder, shared with other products in the same order",
  },
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
  "dash.downloadAll": { ar: "تحميل كل الصور", en: "Download all images" },
  "dash.downloading": { ar: "جارِ التحميل…", en: "Downloading…" },
  "dash.downloadError": {
    ar: "تعذّر تحميل الصور",
    en: "Couldn't download the images",
  },
  "dash.setStatus": { ar: "حالة الطلب", en: "Order status" },
  "dash.viewDetails": { ar: "عرض التفاصيل", en: "View details" },

  /* Artwork grouped per request, so a basket of stickers + brooches + posters
     is three labelled sets to print rather than one merged grid. */
  "dash.artworkTitle": { ar: "ملفات التنفيذ", en: "Files to print" },
  "dash.artworkHint": {
    ar: "كل طلب في مجموعة منفصلة — نزّل ما تحتاجه الآن فقط.",
    en: "Each request is its own set — download only what you need right now.",
  },
  "dash.downloadGroup": { ar: "تحميل هذه المجموعة", en: "Download this set" },
  "dash.downloadEverything": { ar: "تحميل الكل", en: "Download everything" },
  "dash.productDesigns": { ar: "تصاميم من المتجر", en: "Store designs" },
  /* Shown for orders placed before per-request grouping was recorded. Says the
     grouping is missing for THIS order, not that it is broken. */
  "dash.artworkUngrouped": {
    ar: "طلب قديم: الصور محفوظة مجمّعة دون تقسيم لكل نوع.",
    en: "Older order: its images were saved pooled together, without per-kind grouping.",
  },
  "dash.manualOrders": { ar: "الطلبات اليدوية", en: "Manual orders" },
  "dash.manualRevenue": {
    ar: "إيرادات الطلبات اليدوية",
    en: "Manual order revenue",
  },
  "dash.manualBadge": { ar: "طلب يدوي", en: "Manual" },
  "dash.manualPriced": { ar: "سعر يدوي", en: "Manual price" },

  /* Confirm-by-WhatsApp: the button, plus the labels that make up the message
     body sent to the customer (see lib/order-message.ts). */
  "dash.whatsappConfirm": {
    ar: "تأكيد الطلب عبر واتساب",
    en: "Confirm via WhatsApp",
  },
  "dash.whatsappNoPhone": {
    ar: "رقم الزبون غير صالح للواتساب",
    en: "The customer's number isn't valid for WhatsApp",
  },
  "wa.greeting": {
    ar: "السلام عليكم معكم متجر رفوف, يسرنا أنكم طلبتم من المتجر, معلومات طلبكم كالتالي :",
    en: "Hello, this is rofoof. Thank you for your order — here are its details:",
  },
  "wa.confirmQuestion": {
    ar: "هل تريدون تأكيد الطلب؟",
    en: "Would you like to confirm the order?",
  },
  "wa.orderCode": { ar: "رقم الطلب", en: "Order number" },
  "wa.date": { ar: "التاريخ", en: "Date" },
  "wa.name": { ar: "الاسم", en: "Name" },
  "wa.phone": { ar: "الهاتف", en: "Phone" },
  "wa.province": { ar: "المحافظة", en: "Province" },
  "wa.address": { ar: "العنوان", en: "Address" },
  "wa.note": { ar: "ملاحظة", en: "Note" },
  "wa.items": { ar: "الطلبات", en: "Items" },
  "wa.subtotal": { ar: "المجموع الفرعي", en: "Subtotal" },
  "wa.discount": { ar: "الخصم", en: "Discount" },
  "wa.delivery": { ar: "التوصيل", en: "Delivery" },
  "wa.total": { ar: "الإجمالي", en: "Total" },
  "wa.free": { ar: "مجاناً", en: "free" },
  "wa.waterproof": { ar: "ضد الماء", en: "waterproof" },
  "wa.customImages": { ar: "صورة مرفقة", en: "attached images" },
  "wa.moreItems": { ar: "• و{n} طلبات أخرى", en: "• and {n} more items" },

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
  "dash.productRevenue": { ar: "إيرادات المنتجات", en: "Product revenue" },
  "dash.productRevenueHint": {
    ar: "أسعار المنتجات بعد الخصم — بدون أجور التوصيل",
    en: "Product prices after discount — delivery excluded",
  },
  "dash.deliveryCollected": { ar: "أجور التوصيل", en: "Delivery fees" },
  "dash.grossRevenue": { ar: "الإجمالي مع التوصيل", en: "Total with delivery" },

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
    ar: "حتى 100 صورة، 20MB لكل صورة — كل صورة = قطعة",
    en: "Up to 100 images, 20MB each — every image = one piece",
  },
  "custom.minStickers": { ar: "(الحد الأدنى 10)", en: "(minimum 10)" },
  "cart.stickerMin": {
    ar: "طلب الستكرات المخصص في سلتك أقل من 10 ستكرات — احذفه وأعد إضافته بـ10 على الأقل.",
    en: "A custom sticker request in your cart is under 10 designs — remove it and re-add with at least 10.",
  },
  "custom.needMore": {
    ar: "أضف {n} ستكر آخر على الأقل — الحد الأدنى للطلب 10 ستكرات.",
    en: "Add at least {n} more — sticker orders start at 10 designs.",
  },
  "custom.oneStickerPerImage": {
    ar: "كل صورة = ستكر واحد فقط. لا تضع أكثر من ستكر داخل نفس الصورة — ارفع كل تصميم بصورة منفصلة.",
    en: "Each image is one sticker only. Don't put several stickers in the same image — upload each design as its own image.",
  },
  "custom.oneBroochPerImage": {
    ar: "كل صورة = بروش واحد فقط. لا تضع أكثر من بروش داخل نفس الصورة — ارفع كل تصميم بصورة منفصلة.",
    en: "Each image is one brooch only. Don't put several brooches in the same image — upload each design as its own image.",
  },
  "custom.addImages": { ar: "أضف صورك", en: "Add your images" },
  "custom.tooBig": {
    ar: "صورة أكبر من 20MB تم تجاهلها",
    en: "An image over 20MB was skipped",
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

  /* Admin-only manual price on a custom request. Worded as "instead of", not
     "as well as": the typed number replaces the ladder rather than adjusting
     it, and an admin who reads it the other way would undercharge. */
  "custom.manualPrice": {
    ar: "تحديد السعر يدويًا",
    en: "Set the price manually",
  },
  "custom.manualPriceHint": {
    ar: "سعر ثابت للطلب كامل، يستبدل حساب سعر القطعة × عدد الصور.",
    en: "A fixed price for the whole request, replacing per-piece × image count.",
  },
  "custom.manualPriceLabel": {
    ar: "سعر الطلب كامل",
    en: "Price for the whole request",
  },
  "custom.manualPriceAdmin": { ar: "للإدارة فقط", en: "Admin only" },
  "custom.manualPriceApplied": { ar: "سعر محدد يدويًا", en: "Manually priced" },
  "custom.autoPrice": { ar: "السعر التلقائي", en: "Automatic price" },

  /* Admin-only manual order — a job that isn't in the catalogue at all. */
  "manual.title": { ar: "طلب يدوي", en: "Manual order" },
  "manual.subtitle": {
    ar: "طلب خارج الكتالوك، بسعر تحدده أنت",
    en: "An off-catalogue job, priced by you",
  },
  "manual.cardHint": {
    ar: "أنشئ طلبًا وسعّره بنفسك",
    en: "Create and price it yourself",
  },
  "manual.badge": { ar: "طلب يدوي", en: "Manual" },
  "manual.adminOnly": { ar: "يظهر للإدارة فقط", en: "Visible to admins only" },
  "manual.name": { ar: "اسم العميل", en: "Customer name" },
  "manual.namePlaceholder": { ar: "الاسم الكامل", en: "Full name" },
  "manual.address": { ar: "العنوان", en: "Address" },
  "manual.addressPlaceholder": { ar: "أقرب نقطة دالة", en: "Nearest landmark" },
  "manual.jobTitle": { ar: "عنوان الطلب", en: "Order title" },
  "manual.jobTitlePlaceholder": {
    ar: "مثال: بوستر مقاس خاص",
    en: "e.g. custom-size poster",
  },
  "manual.description": { ar: "الوصف", en: "Description" },
  "manual.descPlaceholder": {
    ar: "اكتب تفاصيل الطلب: المقاسات، الكمية، أي ملاحظة للتنفيذ…",
    en: "Order details: sizes, quantity, any production notes…",
  },
  "manual.price": { ar: "السعر", en: "Price" },
  "manual.pricePlaceholder": { ar: "بالدينار العراقي", en: "In IQD" },
  "manual.addToCart": { ar: "أضف إلى السلة", en: "Add to cart" },
  "manual.required": {
    ar: "العنوان والسعر مطلوبان.",
    en: "A title and a price are required.",
  },
  /* The checkout still collects the phone and province — say so here, so the
     admin isn't surprised by a form they thought they'd already filled. */
  "manual.checkoutNote": {
    ar: "سيُطلب رقم الهاتف والمحافظة عند إتمام الطلب، والاسم والعنوان سيُعبّآن تلقائيًا.",
    en: "Checkout will ask for the phone and province; the name and address are prefilled from here.",
  },
  "manual.prefilled": { ar: "من الطلب اليدوي", en: "From the manual order" },
  /* Admin-facing checkout outcomes for hand-priced lines. Each says what to do,
     not just what failed. */
  "manual.forbidden": {
    ar: "الأسعار اليدوية للإدارة فقط. سجّل الدخول بحساب إداري أو احذف السطر اليدوي من السلة.",
    en: "Manual prices are admin-only. Sign in as an admin, or remove the manual line from the cart.",
  },
  "manual.unsupported": {
    ar: "قاعدة البيانات لم تُحدَّث بعد. شغّل docs/admin-manual-pricing.sql ثم أعد المحاولة.",
    en: "The database hasn't been updated yet. Run docs/admin-manual-pricing.sql, then try again.",
  },
  "manual.ignoredWarning": {
    ar: "تم إنشاء الطلب، لكن السعر اليدوي لم يُطبَّق — احتُسب السعر التلقائي. شغّل docs/admin-manual-pricing.sql وعدّل المجموع من لوحة التحكم.",
    en: "The order was created, but the manual price wasn't applied — it was billed automatically. Run docs/admin-manual-pricing.sql, then correct the total from the dashboard.",
  },

  // Discounts (buyer-facing)
  "product.off": { ar: "خصم", en: "OFF" },
  "product.from": { ar: "يبدأ من", en: "From" },
  "product.feature": { ar: "إضافة إلى المختارات", en: "Add to featured" },
  "product.unfeature": { ar: "إزالة من المختارات", en: "Remove from featured" },
  "product.tapToExpand": {
    ar: "اضغط على الصورة لتكبيرها ورؤيتها كاملة",
    en: "Tap the image to expand and see it fully",
  },
  /* Connection trouble. Worded so a shopper blames their signal, not the shop —
     and always says what to do next, not just what went wrong. */
  "net.offline": {
    ar: "لا يوجد اتصال بالإنترنت",
    en: "No internet connection",
  },
  "net.checkOffline": {
    ar: "جهازك غير متصل بالإنترنت. شغّل الواي فاي أو بيانات الهاتف، ثم أعد تحميل الصفحة.",
    en: "Your device is offline. Turn on Wi-Fi or mobile data, then reload the page.",
  },
  "net.imageFailed": {
    ar: "تعذّر تحميل الصورة",
    en: "Couldn't load the image",
  },
  "net.checkWeak": {
    ar: "يبدو أن اتصالك بالإنترنت ضعيف. تحقّق من الاتصال ثم أعد تحميل الصفحة.",
    en: "Your internet connection looks weak. Check it, then reload the page.",
  },
  "net.retry": { ar: "إعادة المحاولة", en: "Try again" },
  "net.backOnline": { ar: "عاد الاتصال بالإنترنت", en: "You're back online" },
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

  // The by-count price ladder — see components/ui/price-ladder.tsx. The hint is
  // the load-bearing string: without it a row of "+1 +2 +4" boxes says nothing
  // about what makes the price move, and the shopper only finds out in the cart.
  "product.ladderPooled": {
    ar: "سعر القطعة ينزل كلما زاد عدد القطع — والعدد يُجمع من كل المنتجات المسعّرة حسب العدد في سلتك",
    en: "The unit price drops as the piece count rises — counted across every by-count product in your cart",
  },
  "product.ladderOwn": {
    ar: "سعر القطعة ينزل كلما زادت الكمية التي تختارها من هذا المنتج",
    en: "The unit price drops as you pick more of this product",
  },
  "product.ladderNow": { ar: "سعرك الآن", en: "Your price now" },
  "offer.endsIn": { ar: "ينتهي خلال", en: "Ends in" },
  "offer.discount": { ar: "خصم", en: "Save" },
  "offer.youSave": { ar: "توفّر", en: "You save" },
  "cart.free": { ar: "مجاناً", en: "FREE" },
  "cart.pieces": { ar: "قطعة", en: "pieces" },
  "cart.discount": { ar: "الخصم", en: "Discount" },
  "cart.freeDelivery": { ar: "توصيل مجاني", en: "Free delivery" },
  "cart.outOfStock": {
    ar: "نفدت الكمية من أحد التصاميم في سلتك. عدّل الكمية أو احذف التصميم ثم أعد المحاولة.",
    en: "One of the designs in your cart just ran out. Adjust the quantity or remove it, then try again.",
  },
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
  "aria.prev": { ar: "السابق", en: "Previous" },
  "aria.next": { ar: "التالي", en: "Next" },

  // Disclosure for text the layout had to cut short — see components/ui/expandable-note.tsx.
  "text.more": { ar: "عرض المزيد", en: "Show more" },
  "text.less": { ar: "عرض أقل", en: "Show less" },
  "checkout.address": { ar: "العنوان", en: "Address" },
  "checkout.note": { ar: "ملاحظة (اختياري)", en: "Note (optional)" },
  "checkout.confirm": { ar: "تأكيد الطلب", en: "Place order" },
  "checkout.required": {
    ar: "الاسم ورقم الهاتف والمحافظة والعنوان مطلوبة لإتمام الطلب",
    en: "Name, phone, province and address are required to place an order",
  },
  "checkout.placing": { ar: "جارٍ الإرسال…", en: "Placing…" },
  "checkout.invalidPhone": {
    ar: "يجب أن يبدأ الرقم بـ07 ويتكوّن من 11 رقماً (مثال: 07701234567)",
    en: "Must start with 07 and be 11 digits (e.g. 07701234567)",
  },
  "checkout.phone2": {
    ar: "رقم هاتف احتياطي (اختياري)",
    en: "Backup phone (optional)",
  },
  "checkout.phone2Short": { ar: "احتياطي", en: "backup" },
  "checkout.phone2Hint": {
    ar: "رقم بديل نتواصل به إذا تعذّر الوصول إليك على الرقم الأول.",
    en: "An alternative number we'll try if we can't reach you on the first one.",
  },
  "checkout.stale": {
    ar: "انتهت صلاحية هذه الصفحة بعد تحديث الموقع. حدّث الصفحة ثم أعد المحاولة — لم يتم إنشاء الطلب.",
    en: "This page went out of date after a site update. Refresh and try again — no order was created.",
  },
  "checkout.reload": { ar: "تحديث الصفحة", en: "Refresh page" },
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
  "checkout.copyCode": {
    ar: "اضغط لنسخ رقم الطلب",
    en: "Tap to copy your Order ID",
  },
  "checkout.codeCopied": { ar: "تم نسخ الرقم ✓", en: "Copied ✓" },
  "checkout.guestSaveId": {
    ar: "احتفظ برقم الطلب لتتبّعه لاحقاً من صفحة «طلباتي».",
    en: "Save your Order ID to track your order later from the Orders page.",
  },
  "checkout.done": { ar: "تم", en: "Done" },

  // Store pagination
  "store.prev": { ar: "السابق", en: "Previous" },
  "store.next": { ar: "التالي", en: "Next" },
  "store.page": { ar: "صفحة", en: "Page" },
  "store.of": { ar: "من", en: "of" },

  /* ------------------------------ Guided tour ------------------------------
     One string per stop along the shopper's journey — the running order lives
     in lib/tour/steps.ts. Kept short: this runs over a highlighted element on a
     phone, where a paragraph would cover the very thing it is pointing at. */
  "tour.step": { ar: "خطوة", en: "Step" },
  "tour.of": { ar: "من", en: "of" },
  "tour.next": { ar: "التالي", en: "Next" },
  "tour.back": { ar: "السابق", en: "Back" },
  /* The way out, and it says so. This used to be a bare × in the card's corner,
     which on a phone reads as "close this box" rather than "leave the tour" —
     the one thing a visitor who wants out needs to be sure of. Spelling it
     costs three characters and removes the guess. */
  "tour.skip": { ar: "تخطي", en: "Skip" },
  "tour.finish": { ar: "تم", en: "Done" },
  /* Shown over the travel veil while the walkthrough changes page — followed by
     the destination's own name, so it reads "Taking you to … the Store". */
  "tour.moving": { ar: "ننقلك إلى", en: "Taking you to" },
  "tour.replay": { ar: "إعادة الشرح التعريفي", en: "Replay the tour" },
  "tour.aria": { ar: "شرح تعريفي للمتجر", en: "Store walkthrough" },

  "tour.welcome.title": { ar: "أهلاً بك في رفوف", en: "Welcome to rofoof" },
  "tour.welcome.body": {
    ar: "متجر عراقي للستكرات والبروشات والميداليات والبوسترات. هذه الصفحة تعرّفك على المتجر بسرعة — والتوصيل لجميع المحافظات.",
    en: "An Iraqi shop for stickers, brooches, medals and posters. This page is your quick introduction — and we deliver to every province.",
  },
  "tour.start.title": { ar: "من أين تبدأ؟", en: "Where to start" },
  "tour.start.body": {
    ar: "ثلاثة أزرار تختصر كل شيء: «تسوّق الآن» يوديك لكل المنتجات، «تتبّع طلبك» يعرض لك حالة طلباتك، و«اطلب تصميمك الخاص» يحوّل صورك إلى ستكرات أو بروشات أو بوسترات.",
    en: "Three buttons cover almost everything: Shop now opens the full catalogue, Track order shows where your orders have got to, and Order your custom design turns your own images into stickers, brooches or posters.",
  },
  "tour.delivery.title": { ar: "التوصيل والأسعار", en: "Delivery and pricing" },
  "tour.delivery.body": {
    ar: "كلفة التوصيل واضحة من البداية قبل أي سعر، حتى لا تكون مفاجأة عند إتمام الطلب.",
    en: "The delivery cost is shown up front, before any price — so it's never a surprise at checkout.",
  },
  "tour.rails.title": {
    ar: "الأكثر طلباً ووصل حديثاً",
    en: "Most ordered and just landed",
  },
  "tour.rails.body": {
    ar: "هنا أكثر المنتجات طلباً ومجموعات مختارة وآخر ما وصل. اضغط أي منتج لرؤية صوره وتفاصيله.",
    en: "The best sellers, our curated picks, and the newest arrivals. Tap any item to see its photos and details.",
  },
  "tour.catalog.title": { ar: "تصفّح المنتجات", en: "Browse the products" },
  "tour.catalog.body": {
    ar: "كل الستكرات والبروشات والميداليات والبوسترات هنا. فلتر حسب النوع أو الفئة أو السعر، واضغط أي منتج لرؤية صوره وتفاصيله.",
    en: "Every sticker, brooch, medal and poster lives here. Filter by type, fandom or price, and tap any item to see its photos and specs.",
  },
  // Two stops, not one — see the note in lib/tour/steps.ts. Each is kept to
  // roughly two sentences: this is read standing in a shop, on a phone, and a
  // paragraph gets skipped whole.
  "tour.filters.title": { ar: "البحث والترتيب", en: "Search and sort" },
  "tour.filters.body": {
    ar: "تعرف شنو تريد؟ اكتب اسمه بالبحث. وإذا تتصفّح، رتّب حسب الأكثر رواجاً أو الأحدث أو السعر، و«تصفية» تفتح السعر الأقصى والمقاوم للماء.",
    en: "Know what you want? Type its name in the search. Browsing instead? Sort by most popular, newest or price — and Filter opens max price and waterproof-only.",
  },
  "tour.categories.title": { ar: "صندوقا الفلترة", en: "The two filter boxes" },
  "tour.categories.body": {
    ar: "الأحمر يسأل: شنو تريد؟ (ستكر، بوستر، بروش…) والأزرق يسأل: عن شنو؟ (العاب، انمي، كرة قدم…). اختر من الاثنين وتحصل على ستكرات العاب، واترك أي صندوق فارغاً ليشمل الكل.",
    en: "The red box asks what you want (sticker, poster, brooch…), the blue one asks what it's about (games, anime, football…). Pick from both and you get game stickers; leave a box empty and it covers everything in it.",
  },
  "tour.custom.title": { ar: "اطلب تصميمك الخاص", en: "Order your own design" },
  "tour.custom.body": {
    ar: "ارفع صورك وحوّلها إلى ستكرات أو بروشات أو بوسترات — تختار العدد والسعر يظهر لك قبل الإضافة للسلة.",
    en: "Upload your own images and turn them into stickers, brooches or posters — pick the quantity and see the price before it reaches your cart.",
  },
  "tour.cart.title": { ar: "سلتك وإتمام الطلب", en: "Your cart and checkout" },
  "tour.cart.body": {
    ar: "كل ما تضيفه يتجمّع هنا مع تصاميمك المرفقة. راجع الطلب، أضف كود خصم إن كان عندك، ثم أكمل الطلب.",
    en: "Everything you add gathers here, attached designs included. Review it, add a discount code if you have one, then place the order.",
  },
  "tour.order.title": { ar: "كيف تطلب؟", en: "How to order" },
  "tour.order.body": {
    ar: "اضغط على المنتج لرؤية التفاصيل، أيقونة القلب تحفظه في المفضلة.",
    en: "Tap the item for details, The heart saves it to your favourites.",
  },
  "tour.favorites.title": { ar: "المفضلة", en: "Favourites" },
  "tour.favorites.body": {
    ar: "كل ما تحفظه بالقلب يتجمّع هنا، ويبقى محفوظًا في حسابك — تقدر ترجع له وتطلبه وقت ما تحب.",
    en: "Everything you heart gathers here and stays saved to your account — come back and order it whenever you like.",
  },
  "tour.replay.title": { ar: "تقدر تعيد الشرح", en: "You can replay this" },
  "tour.replay.body": {
    ar: "خلصنا! إذا حبيت تعيد هذا الشرح في أي وقت، اضغط هذا الزر في أسفل الصفحة.",
    en: "That's everything. If you'd like to see this walkthrough again, press this button at the bottom of the page.",
  },
  "tour.profile.title": { ar: "أكمل بياناتك", en: "Complete your details" },
  "tour.profile.body": {
    ar: "أضف رقمك ومحافظتك وعنوانك مرة واحدة، وسيُعبّأ تلقائيًا في كل طلب قادم — وتقدر تتابع طلباتك السابقة من هنا.",
    en: "Save your phone, province and address once and every future order fills them in for you — and track your past orders from here too.",
  },

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
