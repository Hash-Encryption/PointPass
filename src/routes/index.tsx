import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLocale } from "@/lib/i18n";
import { PortalNav } from "@/components/PortalNav";
import { PhoneMockupHero } from "@/components/landing/PhoneMockupHero";
import {
  Sparkles,
  Zap,
  Smartphone,
  ScanLine,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Coffee,
  QrCode,
  Clock,
  Radio,
  Store,
  Flame,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PointPass | حوّل زوار متجرك إلى عملاء دائمين مع Apple Wallet" },
      {
        name: "description",
        content:
          "PointPass: بطاقات ولاء رقمية مدمجة في Apple Wallet و Google Wallet للمقاهي والمطاعم في السعودية بدون تحميل تطبيقات. مسح في ثانيتين وإشعارات جغرافية ذكية.",
      },
      { property: "og:title", content: "PointPass — Native Wallet Loyalty" },
      {
        property: "og:description",
        content:
          "Apple & Google Wallet loyalty passes, 2-second cashier scanner, and geofence lock-screen alerts for restaurants & cafes.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoStamped, setDemoStamped] = useState(false);

  const ArrowIcon = ar ? ArrowLeft : ArrowRight;

  const trustBadges = [
    {
      icon: Zap,
      label: ar ? "مسح ضوئي في ثانيتين" : "2-second POS scan",
    },
    {
      icon: Smartphone,
      label: ar ? "بدون تحميل أي تطبيق" : "Zero app downloads",
    },
    {
      icon: ShieldCheck,
      label: ar ? "متوافق مع المقاهي السعودية" : "Saudi hospitality ready",
    },
  ];

  const oldWayItems = [
    {
      title: ar ? "تُنسى أو تضيع دائماً" : "Lost or Forgotten",
      desc: ar
        ? "85% من العملاء ينسون البطاقة الورقية في المنزل أو يفقدونها، مما يضيع تجربة ولائهم."
        : "85% of customers leave paper stamp cards at home or lose them permanently.",
    },
    {
      title: ar ? "حاجز تحميل التطبيقات" : "App Download Friction",
      desc: ar
        ? "إجبار العميل على تحميل تطبيق جديد بحجم 100MB والتسجيل في الطابور يفقدك 90% من الزوار."
        : "Forcing customers to download a 100MB store app and sign up at the counter drives away 90% of shoppers.",
    },
    {
      title: ar ? "انعدام التواصل بدون SMS باهظة" : "No Re-engagement Without SMS",
      desc: ar
        ? "لا تملك وسيلة مجانية لتذكير العميل بالعودة دون دفع آلاف الريالات شهرياً على رسائل SMS."
        : "No free channel to bring customers back without spending thousands on costly SMS gateways.",
    },
    {
      title: ar ? "أختام وهمية وبدون إحصائيات" : "No Data & Fake Stamps",
      desc: ar
        ? "الأختام الورقية عرضة للتلاعب ولا توفر أي بيانات تحليلية عن تكرار زيارات العملاء ومعدل الإنفاق."
        : "Zero visit frequency metrics, paper stamping fraud, and no visibility into customer lifetime value.",
    },
  ];

  const pointPassItems = [
    {
      title: ar ? "محفوظة في Apple & Google Wallet" : "Saved in Native Apple & Google Wallet",
      desc: ar
        ? "تعيش البطاقة في المحفظة الرسمية المثبتة مسبقاً بهاتف العميل، لا تُنسى ولا تضيع أبداً."
        : "Passes reside in the pre-installed Apple Wallet & Google Wallet app. Always accessible, zero loss.",
    },
    {
      title: ar ? "إضافة فورية بنقرة واحدة" : "Instant 3-Second Add",
      desc: ar
        ? "يمسح العميل رمز الكاونتر بكاميرا جواله ويضيف بطاقته بلمسة واحدة دون تحميل أي تطبيق."
        : "Customers point their camera at the counter QR and tap 'Add to Apple Wallet' in 3 seconds.",
    },
    {
      title: ar ? "إشعارات جغرافية ذكية على شاشة القفل" : "Geofence Lock-Screen Triggers",
      desc: ar
        ? "تضيء البطاقة تلقائياً على شاشة قفل العميل فور اقترابه بمسافة 100م من فرعك لتذكيره بزيارتك."
        : "The pass automatically illuminates on customer lock screens within 100m of your location.",
    },
    {
      title: ar ? "مسح في ثانيتين وإشعارات مجانية" : "2-Second Scans & Free Push Campaigns",
      desc: ar
        ? "الكاشير يختم البطاقة في ثانيتين من أي جهاز، مع إمكانية إرسال حملات إشعارات مباشرة مجاناً."
        : "Cashiers stamp in 2 seconds from any browser, with unlimited zero-cost lock-screen push campaigns.",
    },
  ];

  const steps = [
    {
      step: "01",
      title: ar ? "صمم هويتك في دقيقتين" : "Design Your Pass in 2 Minutes",
      desc: ar
        ? "اختر ألوان علامتك، شعارك، ونوع برنامج الولاء (أختام قهوة، نقاط، أو قسيمة ترحيبية) في لوحة تحكم ذكية وسلسة."
        : "Pick your brand colors, upload your logo, and set your reward milestones in our live card designer.",
      tag: ar ? "إعداد سريع" : "2-min setup",
    },
    {
      step: "02",
      title: ar ? "ضع الرمز على الكاونتر" : "Place the QR on Counter",
      desc: ar
        ? "اطبع رمز QR المخصص لمنشأتك وضعه على كاونتر الطلب. يمسحه العميل بكاميرا جواله ويحفظ البطاقة فوراً في محفظة Apple."
        : "Display your branded QR code stand at checkout. Customers scan and save their card in Apple Wallet with one tap.",
      tag: ar ? "بدون تطبيقات" : "Zero app installs",
    },
    {
      step: "03",
      title: ar ? "اختم في ثانيتين عند الكاشير" : "Stamp in 2 Seconds at POS",
      desc: ar
        ? "يفتح الكاشير شاشة المسح من أي هاتف أو شاشة كاشير، يمسح بطاقة العميل ويمنحه الختم فوراً مع نغمة تأكيد في محفظته."
        : "Cashier opens the PIN-locked terminal from any tablet or phone, scans the pass, and adds stamps instantly.",
      tag: ar ? "مسح فوري" : "Instant chime",
    },
  ];

  const faqs = [
    {
      q: ar
        ? "هل يحتاج العميل لتحميل تطبيق من App Store أو Google Play؟"
        : "Do customers need to download an app from App Store or Google Play?",
      a: ar
        ? "إطلاقاً! بطاقات PointPass تعتمد كلياً على تطبيق Apple Wallet (المثبت مسبقاً على جميع أجهزة iPhone) و Google Wallet على أجهزة Android. كل ما يحتاجه العميل هو توجيه كاميرا جواله نحو رمز الكاونتر وتظهر البطاقة فوراً بنقرة واحدة."
        : "Not at all! PointPass passes live in the pre-installed Apple Wallet app on iPhone and Google Wallet on Android. Customers just scan a counter QR code and tap 'Add'. Zero apps to download, zero waiting.",
    },
    {
      q: ar
        ? "هل أحتاج لشراء أجهزة أو هاردوير خاص بنقاط البيع؟"
        : "Do I need special POS hardware or devices for the cashier?",
      a: ar
        ? "لا تحتاج لأي أجهزة جديدة. شاشة الكاشير السريعة (/scan) تعمل مباشرة من متصفح أي هاتف ذكي، جهاز آيباد، أو شاشة الكاشير المتوفرة لديك حالياً. الدخول محمي برمز PIN سري وسريع ومخصص لكل فرع أو كاشير."
        : "No additional hardware is needed. The cashier terminal (/scan) runs directly in any web browser on smartphones, tablets, or your existing POS screen, locked with a fast 4-digit PIN.",
    },
    {
      q: ar
        ? "هل يمكنني تجربة المنصة مجاناً وبدون بطاقة ائتمانية؟"
        : "Is there a free trial and does it require a credit card?",
      a: ar
        ? "نعم، يمكنك البدء وتصميم بطاقتك وتجربة المسح فوراً وبشكل مجاني بالكامل دون إدخال أي بطاقة بنكية ودون أي التزامات مسبقة."
        : "Yes! You can design your pass, test the cashier scanner, and issue your first passes completely free without entering a credit card or signing contracts.",
    },
    {
      q: ar
        ? "كيف تُحدّث الأختام والمكافآت في محفظة هاتف العميل؟"
        : "How do stamps and rewards update in the customer's phone wallet?",
      a: ar
        ? "بمجرد مسح الكاشير لرمز البطاقة واختيار (+1 ختم) أو استبدال المكافأة، تتحدث البطاقة تلقائياً في ثوانٍ داخل محفظة العميل ويصل إشعار فوري لشاشة قفل هاتفه يؤكد رصيده الجديد."
        : "The moment the cashier taps (+1 Stamp) or redeems a reward, the card updates in real time inside the customer's Apple Wallet, accompanied by a lock-screen notification and chime.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-emerald-500 selection:text-zinc-950 overflow-x-hidden">
      {/* 1. HEADER */}
      <PortalNav isLanding />

      <main>
        {/* ================= 2. HERO SECTION ================= */}
        <section className="relative pt-10 pb-16 sm:pt-16 sm:pb-24 border-b border-zinc-800/60 overflow-hidden">
          {/* Subtle Ambient Radial Glow */}
          <div
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] bg-[radial-gradient(ellipse_75%_60%_at_50%_-10%,rgba(16,185,129,0.22),rgba(9,9,11,0))] -z-10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:28px_28px] -z-10"
            aria-hidden="true"
          />

          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <div
              className="grid md:grid-cols-12 items-center gap-10 lg:gap-14"
              dir={ar ? "rtl" : "ltr"}
            >
              {/* Hero Left: Tag, Headline, Subtitle, CTAs, Trust */}
              <div className="md:col-span-7 flex flex-col items-start text-start">
                {/* Tag Badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-6 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {ar
                      ? "جديد: متوافق مع Apple Wallet و Google Wallet"
                      : "New: Compatible with Apple Wallet & Google Wallet"}
                  </span>
                </div>

                {/* Primary Headline */}
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
                  {ar ? (
                    <>
                      حوّل زوار متجرك إلى{" "}
                      <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
                        عملاء دائمين
                      </span>
                    </>
                  ) : (
                    <>
                      Turn Store Visitors into{" "}
                      <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
                        Lifelong Regulars
                      </span>
                    </>
                  )}
                </h1>

                {/* Subheadline */}
                <p className="mt-5 text-base sm:text-lg text-zinc-300 leading-relaxed max-w-2xl font-normal">
                  {ar
                    ? "بدون تحميل أي تطبيق. بطاقات ولاء رقمية تعيش مباشرة في محفظة أجهزة عملائك، مع إشعارات الموقع الجغرافي التلقائية ومسح ضوئي في ثانيتين عند الكاشير."
                    : "No apps to install. Digital loyalty passes living directly in your customers' native phone wallet, with automated geofence lock-screen alerts and 2-second cashier scans."}
                </p>

                {/* Action CTAs */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto">
                  <Link
                    to="/onboarding"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-sm sm:text-base font-bold text-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] hover:scale-[1.02] active:scale-[0.98] text-center"
                  >
                    <span>
                      {ar ? "صمم بطاقتك وابدأ مجاناً ⚡" : "Design Your Pass & Start Free ⚡"}
                    </span>
                    <ArrowIcon className="size-4 shrink-0" />
                  </Link>

                  <Link
                    to="/scan"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/60 px-6 py-3.5 text-sm sm:text-base font-semibold text-zinc-200 backdrop-blur-md transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-600 text-center"
                  >
                    <ScanLine className="size-4.5 text-emerald-400 shrink-0" />
                    <span>{ar ? "تجربة مسح الكاشير →" : "Try Cashier Scanner →"}</span>
                  </Link>
                </div>

                {/* Trust Proof Badges */}
                <div className="mt-10 pt-6 border-t border-zinc-800/80 w-full flex flex-wrap items-center gap-x-6 gap-y-3">
                  {trustBadges.map((badge, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400"
                    >
                      <badge.icon className="size-4 text-emerald-400 shrink-0" />
                      <span>{badge.label}</span>
                    </div>
                  ))}
                </div>

                {/* Social Proof Counter */}
                <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="flex size-2 rounded-full bg-emerald-500" />
                  <span>
                    {ar
                      ? "انضم إلى أكثر من 500+ مقهى ومطعم يضاعفون ولاء عملائهم في السعودية"
                      : "Trusted by 500+ modern cafes and dining brands in Saudi Arabia"}
                  </span>
                </div>
              </div>

              {/* Hero Right: CSS Titanium Phone Frame with Interactive Apple Wallet Pass */}
              <div className="md:col-span-5 flex flex-col items-center justify-center relative mt-6 md:mt-0">
                <div className="relative w-full max-w-[340px] mx-auto">
                  <PhoneMockupHero isRtl={ar} />

                  {/* Tactile interaction hint */}
                  <div className="mt-4 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 px-3.5 py-1 text-[11px] text-zinc-400 backdrop-blur-sm shadow-xs">
                      <Sparkles className="size-3 text-emerald-400" />
                      {ar
                        ? "جرب بنفسك: اضغط على الختم رقم 7 لتجربة البطاقة"
                        : "Interactive: Tap stamp #7 on the phone to test"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 3. SECTION 1: THE OLD WAY VS POINTPASS ================= */}
        <section id="comparison" className="py-20 border-b border-zinc-800/60 bg-zinc-950/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-8" dir={ar ? "rtl" : "ltr"}>
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Sparkles className="size-3.5" />
                {ar ? "المقارنة الحقيقية" : "The Comparison"}
              </span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-white">
                {ar ? "الطريقة التقليدية مقابل PointPass" : "The Old Way vs PointPass"}
              </h2>
              <p className="mt-3 text-zinc-400 text-sm sm:text-base">
                {ar
                  ? "لماذا تفشل بطاقات الأختام الورقية والتطبيقات المعقدة، وكيف تضمن محفظة الهاتف عودة العميل بنسبة تفوق 40%."
                  : "Why paper cards and heavy apps fail, and how native wallet passes drive 40%+ repeat customer visits."}
              </p>
            </div>

            {/* Side-by-Side Comparison Cards */}
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Card 1: The Old Way (Negative) */}
              <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-5 border-b border-zinc-800/80 mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-9 place-items-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                        <XCircle className="size-5" />
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        {ar ? "الكروت الورقية وتطبيقات المتاجر" : "Paper Cards & Heavy Store Apps"}
                      </h3>
                    </div>
                    <span className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                      {ar ? "الطريقة القديمة" : "The Old Way"}
                    </span>
                  </div>

                  <div className="space-y-5">
                    {oldWayItems.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-start">
                        <div className="size-5 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                          ✕
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200">{item.title}</h4>
                          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-5 border-t border-zinc-800/80 text-xs text-zinc-400 text-center">
                  {ar
                    ? "النتيجة: فقدان 80% من عملاء الولاء المحتملين"
                    : "Result: 80% of loyalty customers lost"}
                </div>
              </div>

              {/* Card 2: PointPass (Positive, Emerald Highlight) */}
              <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-zinc-900/90 via-zinc-900/80 to-emerald-950/20 p-6 sm:p-8 backdrop-blur-sm ring-1 ring-emerald-500/20 shadow-[0_0_35px_rgba(16,185,129,0.12)] flex flex-col justify-between relative">
                <div className="absolute top-4 end-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                    <Sparkles className="size-3" />
                    {ar ? "مع PointPass" : "The PointPass Way"}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2.5 pb-5 border-b border-emerald-500/20 mb-6">
                    <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      {ar ? "بطاقات المحفظة الرقمية الذكية" : "Native Mobile Wallet Passes"}
                    </h3>
                  </div>

                  <div className="space-y-5">
                    {pointPassItems.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-start">
                        <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                          ✓
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{item.title}</h4>
                          <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-5 border-t border-emerald-500/20 text-xs font-semibold text-emerald-400 text-center flex items-center justify-center gap-1.5">
                  <Flame className="size-4" />
                  <span>
                    {ar
                      ? "النتيجة: زيادة تكرار زيارات العملاء بنسبة +42%"
                      : "Result: +42% repeat customer visits"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 4. SECTION 2: HOW IT WORKS IN 3 STEPS ================= */}
        <section id="how-it-works" className="py-20 border-b border-zinc-800/60">
          <div className="mx-auto max-w-7xl px-4 sm:px-8" dir={ar ? "rtl" : "ltr"}>
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {ar ? "بساطة وسرعة فائقة" : "Ultra Simple 3 Steps"}
              </span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
                {ar ? "كيف يعمل PointPass في 3 خطوات بسيطة؟" : "How It Works in 3 Steps"}
              </h2>
              <p className="mt-3 text-zinc-400 text-sm sm:text-base">
                {ar
                  ? "جهّز برنامج ولائك وابدأ باستقبال العملاء في متجرك خلال دقائق معدودة."
                  : "Launch your branded digital pass and start stamping customer visits in minutes."}
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
              {steps.map((s, idx) => (
                <div
                  key={idx}
                  className="relative rounded-3xl border border-zinc-800 bg-zinc-900/40 p-7 flex flex-col justify-between transition-all hover:border-emerald-500/40 hover:bg-zinc-900/70"
                >
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-3xl font-black font-mono text-emerald-400/90">
                        {s.step}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300 border border-zinc-700">
                        {s.tag}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-zinc-800/60 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="size-4" />
                    <span>{ar ? "جاهز للتطبيق فوراً" : "Instant rollout"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 5. SECTION 3: CASHIER SPEED DEMO ================= */}
        <section className="py-20 border-b border-zinc-800/60 bg-zinc-950/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-8" dir={ar ? "rtl" : "ltr"}>
            <div className="text-center max-w-3xl mx-auto mb-14">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Clock className="size-3.5" />
                {ar ? "سرعة الكاشير الفائقة" : "Cashier Speed Demo"}
              </span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white">
                {ar
                  ? "اختم لعميلك في ثانيتين.. بدون تعطيل الطابور"
                  : "Stamp in 2 Seconds — Zero Queue Delay"}
              </h2>
              <p className="mt-3 text-zinc-400 text-sm sm:text-base">
                {ar
                  ? "شاشة ويب فائقة الخفة تعمل من أي جوال أو آيباد أو جهاز كاشير حالي عبر متصفح الويب وبرمز PIN محمي."
                  : "Ultra-lightweight web terminal running on any phone, iPad, or existing POS browser with PIN protection."}
              </p>
            </div>

            {/* Visual Counter & POS Simulation Component */}
            <div className="max-w-4xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-10 shadow-2xl backdrop-blur-md">
              <div className="grid md:grid-cols-12 gap-8 items-center">
                {/* Left: Terminal Specs & Highlights */}
                <div className="md:col-span-6 space-y-4 text-start">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-800/80 px-3 py-1 text-xs font-mono text-zinc-300 border border-zinc-700">
                    <Radio className="size-3 text-emerald-400 animate-pulse" />
                    <span>POS Terminal • /scan</span>
                  </div>

                  <h3 className="text-2xl font-bold text-white">
                    {ar ? "لا تحتاج شراء أي أجهزة جديدة" : "Zero Hardware Lock-In"}
                  </h3>

                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {ar
                      ? "افتح الرابط المخصص لمطعمك، ادخل رمز PIN المكون من 4 أرقام، واستخدم كاميرا الجهاز لمسح البطاقة فوراً."
                      : "Open your store's scanner link, enter your 4-digit PIN, and use the device camera to scan and stamp immediately."}
                  </p>

                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                      <span>
                        {ar ? "مسح ضوئي لحظي خلال 1.4 ثانية" : "Sub-2-second camera QR detection"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                      <span>
                        {ar
                          ? "يعمل على أي جوال، آيباد، أو شاشة لمس"
                          : "Runs on any phone, iPad, or Android POS"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                      <span>
                        {ar
                          ? "إشعار فوري ونغمة چايم على هاتف العميل"
                          : "Instant chime notification on customer's lock screen"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Link
                      to="/scan"
                      className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-400 hover:text-emerald-300"
                    >
                      <span>
                        {ar ? "فتح شاشة الكاشير التجريبية" : "Open Live Cashier Terminal"}
                      </span>
                      <ArrowIcon className="size-4" />
                    </Link>
                  </div>
                </div>

                {/* Right: Interactive Terminal UI Simulation */}
                <div className="md:col-span-6">
                  <div className="rounded-2xl border border-zinc-700/80 bg-zinc-950 p-5 shadow-inner">
                    {/* Terminal Header */}
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3 text-xs text-zinc-400">
                      <div className="flex items-center gap-2">
                        <Store className="size-4 text-emerald-400" />
                        <span className="font-semibold text-zinc-200">
                          {ar ? "أوربان كافيه — الفرع الرئيسي" : "Urban Cafe — Main Branch"}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-400">PIN: ****</span>
                    </div>

                    {/* Customer Scan Card Card */}
                    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] text-zinc-400">
                            {ar ? "تم التعرف على بطاقة العميل:" : "Customer Pass Detected:"}
                          </p>
                          <p className="text-sm font-bold text-white mt-0.5">
                            {ar ? "سلطان العتيبي" : "Sultan Al-Otaibi"}
                          </p>
                        </div>
                        <div className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-bold text-emerald-400">
                          {demoStamped
                            ? ar
                              ? "7 / 8 أختام"
                              : "7 / 8 Stamps"
                            : ar
                              ? "6 / 8 أختام"
                              : "6 / 8 Stamps"}
                        </div>
                      </div>

                      {/* Cashier Speed Action Buttons */}
                      <div className="mt-4 grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setDemoStamped(!demoStamped)}
                          className={`rounded-xl py-3 px-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            demoStamped
                              ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
                              : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                          }`}
                        >
                          <Zap className="size-3.5" />
                          <span>
                            {demoStamped
                              ? ar
                                ? "إلغاء الختم"
                                : "Reset Demo"
                              : ar
                                ? "+1 ختم فوري ⚡"
                                : "+1 Stamp ⚡"}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled
                          className="rounded-xl border border-zinc-800 bg-zinc-900 py-3 px-3 text-xs font-semibold text-zinc-400 opacity-60 flex items-center justify-center gap-1"
                        >
                          <Coffee className="size-3.5" />
                          <span>{ar ? "صرف المكافأة" : "Redeem"}</span>
                        </button>
                      </div>

                      {/* Visual Flash Feedback */}
                      {demoStamped && (
                        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-center text-xs font-semibold text-emerald-300 animate-in fade-in zoom-in-95">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                            {ar
                              ? "تم الختم في 1.4 ثانية! إشعار أُرسل لمحفظة العميل 🔔"
                              : "Stamped in 1.4s! Notification pushed to customer's wallet 🔔"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 6. SECTION 4: FAQ ACCORDION ================= */}
        <section id="faq" className="py-20 border-b border-zinc-800/60">
          <div className="mx-auto max-w-4xl px-4 sm:px-8" dir={ar ? "rtl" : "ltr"}>
            <div className="text-center mb-12">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {ar ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
              </span>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-white">
                {ar ? "إجابات على أهم تساؤلاتك" : "Got Questions? We Have Answers"}
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden transition-colors hover:border-zinc-700"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-start font-semibold text-sm sm:text-base text-white focus:outline-hidden cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`size-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                          isOpen ? "rotate-180 text-emerald-400" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-5 sm:px-5 sm:pb-5 text-xs sm:text-sm text-zinc-300 leading-relaxed border-t border-zinc-800/60 pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= 7. FINAL CTA BANNER ================= */}
        <section className="py-20 relative overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_70%)]"
            aria-hidden="true"
          />
          <div
            className="relative mx-auto max-w-4xl px-4 sm:px-8 text-center"
            dir={ar ? "rtl" : "ltr"}
          >
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              {ar ? "جاهز لمضاعفة زوار متجرك؟" : "Ready to Double Your Store Regulars?"}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto">
              {ar
                ? "صمم بطاقتك الآن في دقيقتين وابدأ باستقبال عملائك في مقهاك أو مطعمك بدون تكاليف إعداد مسبقة."
                : "Create your first pass in 2 minutes. No credit card required, zero setup friction."}
            </p>
            <div className="mt-8 flex flex-wrap justify-center items-center gap-4">
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-8 py-3.5 text-sm sm:text-base font-bold text-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all hover:bg-emerald-400 hover:scale-105 active:scale-95"
              >
                <span>{ar ? "ابدأ الآن مجاناً ⚡" : "Start Free Now ⚡"}</span>
                <ArrowIcon className="size-4" />
              </Link>
              <Link
                to="/scan"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3.5 text-sm sm:text-base font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <ScanLine className="size-4 text-emerald-400" />
                <span>{ar ? "تجربة شاشة الكاشير →" : "Try Cashier Scanner →"}</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ================= 8. MINIMAL DARK FOOTER ================= */}
      <footer className="border-t border-zinc-800/60 bg-zinc-950 py-12 text-zinc-400 text-xs">
        <div
          className="mx-auto max-w-7xl px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-6"
          dir={ar ? "rtl" : "ltr"}
        >
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-zinc-200 text-sm">
              PointPass<span className="text-emerald-400">.</span>
            </span>
            <span>—</span>
            <span>{ar ? "منصة ولاء المحافظ الرقمية" : "Digital Wallet Loyalty SaaS"}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <a href="#comparison" className="hover:text-zinc-200 transition-colors">
              {ar ? "المميزات" : "Features"}
            </a>
            <a href="#how-it-works" className="hover:text-zinc-200 transition-colors">
              {ar ? "كيف يعمل" : "How it Works"}
            </a>
            <a href="#faq" className="hover:text-zinc-200 transition-colors">
              {ar ? "الأسئلة الشائعة" : "FAQ"}
            </a>
            <Link to="/scan" className="hover:text-emerald-400 transition-colors">
              {ar ? "للكاشير" : "Cashier"}
            </Link>
            <Link to="/onboarding" className="hover:text-zinc-200 transition-colors">
              {ar ? "تسجيل الدخول" : "Sign In"}
            </Link>
          </div>

          <div>© {new Date().getFullYear()} PointPass. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
