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
