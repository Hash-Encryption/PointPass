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
    <LocaleContext.Provider
      value={{ locale, dir: locale === "ar" ? "rtl" : "ltr", t, toggle }}
    >
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
