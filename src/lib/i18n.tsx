import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "ar" | "en";

type Dict = Record<string, { ar: string; en: string }>;

export const strings = {
  brand: { ar: "ولاء واليت", en: "Wallet Loyalty" },
  tagline: {
    ar: "منصة بطاقات الولاء الرقمية للمطاعم والمقاهي في السعودية",
    en: "Digital wallet loyalty platform for Saudi restaurants & cafés",
  },
  heroCta: { ar: "ابدأ الآن", en: "Get started" },
  adminPortal: { ar: "لوحة المشرف العام", en: "Super Admin" },
  merchantPortal: { ar: "لوحة التاجر", en: "Merchant Dashboard" },
  cashierPortal: { ar: "شاشة الكاشير", en: "Cashier Terminal" },
  claimPage: { ar: "صفحة العميل", en: "Customer Claim" },
  language: { ar: "English", en: "العربية" },
  overview: { ar: "نظرة عامة", en: "Overview" },
  accounts: { ar: "حسابات العملاء", en: "Client Accounts" },
  hardware: { ar: "شحنات الأجهزة", en: "Hardware Dispatch" },
  domains: { ar: "النطاقات والعلامة البيضاء", en: "White-Label & Domains" },
  passDesigner: { ar: "مصمم البطاقة", en: "Pass Designer" },
  programs: { ar: "برامج الولاء", en: "Loyalty Programs" },
  pinManager: { ar: "رمز الكاشير", en: "Cashier PIN" },
  geofence: { ar: "الموقع والتنبيهات", en: "Geofence & Alerts" },
  campaigns: { ar: "الحملات والإشعارات", en: "Push Campaigns" },
  analytics: { ar: "التحليلات", en: "Analytics" },
  activePasses: { ar: "البطاقات النشطة", en: "Active passes" },
  redemptions: { ar: "عمليات الاستبدال", en: "Redemptions" },
  installs: { ar: "عمليات التثبيت", en: "Installs" },
  retention: { ar: "معدل العودة", en: "Retention" },
  systemHealth: { ar: "صحة النظام", en: "System health" },
  save: { ar: "حفظ", en: "Save" },
  send: { ar: "إرسال", en: "Send" },
  phone: { ar: "رقم الجوال", en: "Phone number" },
  join: { ar: "احصل على بطاقتك", en: "Get your card" },
  appleWallet: { ar: "أضف إلى Apple Wallet", en: "Add to Apple Wallet" },
  googleWallet: { ar: "احفظ في Google Wallet", en: "Save to Google Wallet" },
  stamp: { ar: "ختم +1", en: "+1 Stamp" },
  logAmount: { ar: "تسجيل مبلغ", en: "Log SAR Amount" },
  redeem: { ar: "استبدال المكافأة", en: "Redeem Reward" },
  enterPin: { ar: "أدخل رمز الكاشير", en: "Enter cashier PIN" },
  scanNow: { ar: "امسح بطاقة العميل", en: "Scan customer pass" },
  locationsAndTeam: { ar: "الفروع والفريق", en: "Locations & Team" },
  locations: { ar: "الفروع", en: "Locations" },
  team: { ar: "الفريق", en: "Team" },
  devices: { ar: "الأجهزة", en: "Devices" },
  manager: { ar: "مدير", en: "Manager" },
  cashier: { ar: "كاشير", en: "Cashier" },
  assignedLocations: { ar: "الفروع المعيّنة", en: "Assigned Locations" },
  addLocation: { ar: "إضافة فرع", en: "Add Location" },
  addTeamMember: { ar: "إضافة عضو للفريق", en: "Add Team Member" },
  mainLocation: { ar: "الفرع الرئيسي", en: "Main Location" },
  active: { ar: "نشط", en: "Active" },
  inactive: { ar: "غير نشط", en: "Inactive" },
  customers: { ar: "العملاء", en: "Customers" },
  customerDetails: { ar: "تفاصيل العميل", en: "Customer Details" },
  guest: { ar: "زائر", en: "Guest" },
  identified: { ar: "معرّف", en: "Identified" },
  searchCustomer: { ar: "البحث برقم الجوال...", en: "Search by phone number..." },
  joinDate: { ar: "تاريخ الانضمام", en: "Join Date" },
  lastActivity: { ar: "آخر نشاط", en: "Last Activity" },
  transactions: { ar: "العمليات", en: "Transactions" },
  loyaltyBalance: { ar: "رصيد الولاء", en: "Loyalty Balance" },
  downloadQr: { ar: "تحميل رمز QR", en: "Download QR" },
  copyLink: { ar: "نسخ الرابط", en: "Copy Link" },
  joinQr: { ar: "رمز ورابط الانضمام", en: "Join Link & QR" },
  myLocations: { ar: "فروعي", en: "My Locations" },
  allAssigned: { ar: "جميع الفروع المعينة", en: "All Assigned Branches" },
  alreadyEnrolled: {
    ar: "أنت مسجل بالفعل في البرنامج!",
    en: "You're already enrolled in the program!",
  },
  welcomeBack: {
    ar: "مرحباً بعودتك! تم العثور على بطاقتك السابقة",
    en: "Welcome back! Existing pass found",
  },
  existingPassFound: {
    ar: "تم العثور على بطاقتك السابقة ورصيدك محفوظ.",
    en: "Your existing pass was found and your balance is intact.",
  },
  openInWallet: { ar: "فتح البطاقة في المحفظة", en: "Open pass in Wallet" },
  stampsIssued: { ar: "الأختام الممنوحة", en: "Stamps Issued" },
  pointsIssued: { ar: "النقاط الممنوحة", en: "Points Issued" },
  totalCustomers: { ar: "إجمالي العملاء", en: "Total Customers" },
  newCustomers: { ar: "عملاء جدد (٣٠ يوم)", en: "New Customers (30d)" },
  customerTimeline: { ar: "سجل العمليات", en: "Activity Timeline" },
  noCustomers: { ar: "لا يوجد عملاء مطابقين للبحث", en: "No customers match this filter" },
  noActivity: { ar: "لا توجد عمليات مسجلة حتى الآن", en: "No activity recorded yet" },
  planAndBilling: { ar: "الباقة والاشتراك", en: "Plan & Billing" },
  businessSettings: { ar: "إعدادات المنشأة", en: "Business Settings" },
  currentPlan: { ar: "الباقة الحالية", en: "Current Plan" },
  subscriptionStatus: { ar: "حالة الاشتراك", en: "Subscription Status" },
  locationUsage: { ar: "استخدام الفروع", en: "Location Usage" },
  activeLocationsCount: { ar: "الفروع النشطة", en: "Active Locations" },
  maxLocationsAllowed: { ar: "الحد الأقصى المسموح", en: "Max Locations Allowed" },
  billingUnconfigured: {
    ar: "الدفع الإلكتروني غير مفعّل بعد — تم تسجيل اختيارك",
    en: "Online billing is not configured yet — your request has been logged",
  },
  billingLegacyStatus: {
    ar: "اشتراك تشغيلي معتمد (بدون فوترة إلكترونية)",
    en: "Operational business entitlement (unmanaged billing)",
  },
  billingPendingStatus: { ar: "بانتظار تفعيل الفوترة", en: "Pending billing activation" },
  requestedPlan: { ar: "الباقة المطلوبة", en: "Requested Plan" },
  changePlan: { ar: "تغيير الباقة", en: "Change Plan" },
  requestPlanChange: { ar: "طلب تعديل الباقة", en: "Request Plan Change" },
  downgradeLocationWarning: {
    ar: "فروعك النشطة تتجاوز حد هذه الباقة. يرجى تعطيل الفروع الإضافية أولاً.",
    en: "Your active locations exceed this plan's limit. Deactivate extra locations first.",
  },
  singleLocationAllowance: { ar: "فرع رئيسي واحد (١)", en: "1 Active Main Location" },
  multiLocationAllowance: { ar: "حتى ١٠ فروع نشطة", en: "Up to 10 Active Locations" },
  onboardingTitle: { ar: "إعداد منشأتك في ولاء واليت", en: "Set Up Your Business" },
  onboardingSubtitle: {
    ar: "خطوات بسيطة لتجهيز برنامج الولاء وإطلاق بطاقتك الرقمية للعملاء",
    en: "Simple steps to launch your digital loyalty program and pass",
  },
  stepBusiness: { ar: "بيانات المنشأة", en: "Business Info" },
  stepPlan: { ar: "اختيار الباقة", en: "Select Plan" },
  stepLoyalty: { ar: "نوع البرنامج", en: "Loyalty Type" },
  stepReward: { ar: "إعداد المكافأة", en: "Reward Rules" },
  stepLocation: { ar: "الفرع الرئيسي", en: "Main Location" },
  stepLaunch: { ar: "جاهز للإطلاق", en: "Launch" },
  businessNameAr: { ar: "اسم المنشأة (بالعربية)", en: "Business Name (Arabic)" },
  businessNameEn: { ar: "اسم المنشأة (بالإنجليزية)", en: "Business Name (English)" },
  businessSlug: { ar: "معرّف الرابط (Slug)", en: "Business URL Slug" },
  slugHelp: {
    ar: "يُستخدم في رابط انضمام العملاء، حروف إنجليزية وأرقام وشرطات فقط",
    en: "Used in customer join URL, lowercase letters, numbers and hyphens only",
  },
  createBusinessBtn: { ar: "إنشاء المنشأة ومتابعة الإعداد", en: "Create Business & Continue" },
  nextStep: { ar: "التالي", en: "Next" },
  prevStep: { ar: "السابق", en: "Previous" },
  confirmAndComplete: {
    ar: "إكمال الإعداد والدخول للوحة التحكم",
    en: "Complete Setup & Open Dashboard",
  },
  onboardingCompleted: {
    ar: "تم إكمال الإعداد بنجاح! مرحباً بك في ولاء واليت.",
    en: "Setup complete! Welcome to Wallet Loyalty.",
  },
  settingsTab: { ar: "الإعدادات", en: "Settings" },
  growthTab: { ar: "البرنامج والنمو", en: "Program & Growth" },
  operationsTab: { ar: "العمليات", en: "Operations" },
} satisfies Dict;

type Ctx = {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: keyof typeof strings) => string;
  toggle: () => void;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("ar");

  useEffect(() => {
    const saved = window.localStorage.getItem("locale") as Locale | null;
    if (saved === "ar" || saved === "en") setLocale(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset["locale"] = locale;
    window.localStorage.setItem("locale", locale);
  }, [locale]);

  const t = useCallback((key: keyof typeof strings) => strings[key][locale], [locale]);
  const toggle = useCallback(() => setLocale((l) => (l === "ar" ? "en" : "ar")), []);

  return (
    <LocaleContext.Provider value={{ locale, dir: locale === "ar" ? "rtl" : "ltr", t, toggle }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}

/** Pick the right side of a bilingual value. */
export function bi(locale: Locale, ar: string | null | undefined, en: string | null | undefined) {
  return (locale === "ar" ? ar || en : en || ar) ?? "";
}
