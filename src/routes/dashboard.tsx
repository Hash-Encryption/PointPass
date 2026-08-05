import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PortalNav } from "@/components/PortalNav";
import { PassPreview, type PassDesign } from "@/components/PassPreview";
import { useLocale } from "@/lib/i18n";
import { PASS_TEMPLATES, autoContrast, type ProgramType } from "@/constants/defaultTemplates";
import { sendWalletPush } from "@/lib/wallet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التاجر | Merchant Dashboard — Wallet Loyalty" },
      {
        name: "description",
        content:
          "Design wallet passes, run loyalty programs, manage cashier PINs, geofence alerts and push campaigns.",
      },
      { property: "og:title", content: "Merchant Dashboard — Wallet Loyalty" },
      {
        property: "og:description",
        content: "Pass designer with live Apple & Google Wallet previews plus analytics.",
      },
    ],
  }),
  component: MerchantDashboard,
});

const INSTALLS = [
  { d: "Sun", installs: 42, redemptions: 18 },
  { d: "Mon", installs: 61, redemptions: 27 },
  { d: "Tue", installs: 55, redemptions: 31 },
  { d: "Wed", installs: 78, redemptions: 44 },
  { d: "Thu", installs: 96, redemptions: 58 },
  { d: "Fri", installs: 134, redemptions: 87 },
  { d: "Sat", installs: 112, redemptions: 66 },
];

const PEAK = [
  { h: "10", v: 12 },
  { h: "12", v: 28 },
  { h: "14", v: 41 },
  { h: "16", v: 33 },
  { h: "18", v: 62 },
  { h: "20", v: 88 },
  { h: "22", v: 51 },
];

function MerchantDashboard() {
  const { locale, t } = useLocale();
  const ar = locale === "ar";

  const [program, setProgram] = useState<ProgramType>("stamp");
  const tpl = PASS_TEMPLATES[program];

  const [design, setDesign] = useState<PassDesign>({
    businessName: "مقهى النخبة",
    businessNameEn: "Elite Coffee",
    logoUrl: null,
    background: "#059669",
    accent: "#F59E0B",
    headline: "اشترِ ٩ واحصل على واحدة مجاناً",
    headlineEn: "Buy 9, get 1 free",
    subline: "شكراً لولائك",
    sublineEn: "Thanks for your loyalty",
    program: "stamp",
    targetStamps: 9,
    sarPerPoint: 10,
    progress: 4,
  });

  const [pin, setPin] = useState("1234");
  const [lat, setLat] = useState("24.7136");
  const [lng, setLng] = useState("46.6753");
  const [geoAr, setGeoAr] = useState("أنت قريب من المقهى! تفضل بزيارتنا اليوم");
  const [geoEn, setGeoEn] = useState("You're near the café! Come visit us today");
  const [pushAr, setPushAr] = useState("عرض اليوم: قهوة مجانية مع كل ختمين ☕");
  const [pushEn, setPushEn] = useState("Today only: free coffee with every 2 stamps ☕");
  const [reminders, setReminders] = useState({ d14: true, d30: true, d60: false });
  const [sending, setSending] = useState(false);

  const fg = useMemo(() => autoContrast(design.background), [design.background]);

  function applyProgram(next: ProgramType) {
    setProgram(next);
    const template = PASS_TEMPLATES[next];
    setDesign((d) => ({
      ...d,
      program: next,
      background: template.colors.background,
      accent: template.colors.accent,
      headline: template.program.reward.ar,
      headlineEn: template.program.reward.en,
      targetStamps: template.program.targetStamps ?? d.targetStamps,
      sarPerPoint: template.program.sarPerPoint ?? d.sarPerPoint,
    }));
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDesign((d) => ({ ...d, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function broadcast(segment: "all" | "inactive_14" | "inactive_30" | "inactive_60") {
    setSending(true);
    try {
      const res = await sendWalletPush({
        data: {
          slug: "elite-coffee",
          titleAr: design.businessName,
          titleEn: design.businessNameEn,
          bodyAr: pushAr,
          bodyEn: pushEn,
          segment,
        },
      });
      if (res.ok) toast.success(ar ? "تم إرسال الحملة" : "Campaign sent");
      else
        toast.error(
          ar ? "تعذر الإرسال — تحقق من مفتاح WalletWallet" : "Send failed — check WalletWallet key",
        );
    } catch {
      toast.error(ar ? "خطأ في الشبكة" : "Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PortalNav title={t("merchantPortal")} subtitle={ar ? design.businessName : design.businessNameEn} />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Tabs defaultValue="designer">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="designer">{t("passDesigner")}</TabsTrigger>
            <TabsTrigger value="pin">{t("pinManager")}</TabsTrigger>
            <TabsTrigger value="geo">{t("geofence")}</TabsTrigger>
            <TabsTrigger value="push">{t("campaigns")}</TabsTrigger>
            <TabsTrigger value="analytics">{t("analytics")}</TabsTrigger>
          </TabsList>

          {/* Pass designer */}
          <TabsContent value="designer" className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="panel space-y-5 p-6">
              <div>
                <Label className="mb-2 block">{t("programs")}</Label>
                <div className="flex flex-wrap gap-2">
                  {(["stamp", "points", "coupon_morph"] as ProgramType[]).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={program === p ? "default" : "outline"}
                      onClick={() => applyProgram(p)}
                    >
                      {ar ? PASS_TEMPLATES[p].name.ar : PASS_TEMPLATES[p].name.en}
                    </Button>
                  ))}
                </div>
                {program === "coupon_morph" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ar
                      ? "تبدأ كقسيمة خصم ثم تتحول تلقائياً إلى بطاقة ولاء دائمة بعد أول مسح."
                      : "Starts as a discount voucher and morphs into a permanent loyalty card on first scan."}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nameAr">{ar ? "اسم المنشأة (عربي)" : "Business name (AR)"}</Label>
                  <Input
                    id="nameAr"
                    value={design.businessName}
                    onChange={(e) => setDesign({ ...design, businessName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="nameEn">{ar ? "اسم المنشأة (إنجليزي)" : "Business name (EN)"}</Label>
                  <Input
                    id="nameEn"
                    value={design.businessNameEn}
                    onChange={(e) => setDesign({ ...design, businessNameEn: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="headAr">{ar ? "نص البطاقة (عربي)" : "Pass text (AR)"}</Label>
                  <Input
                    id="headAr"
                    value={design.headline}
                    onChange={(e) => setDesign({ ...design, headline: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="headEn">{ar ? "نص البطاقة (إنجليزي)" : "Pass text (EN)"}</Label>
                  <Input
                    id="headEn"
                    value={design.headlineEn}
                    onChange={(e) => setDesign({ ...design, headlineEn: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="bg">{ar ? "لون الخلفية" : "Background color"}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bg"
                      type="color"
                      className="h-10 w-16 p-1"
                      value={design.background}
                      onChange={(e) => setDesign({ ...design, background: e.target.value })}
                    />
                    <Badge variant="secondary">
                      {ar ? "تباين تلقائي:" : "Auto contrast:"} {fg}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label htmlFor="ac">{ar ? "لون التمييز" : "Accent color"}</Label>
                  <Input
                    id="ac"
                    type="color"
                    className="h-10 w-16 p-1"
                    value={design.accent}
                    onChange={(e) => setDesign({ ...design, accent: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="logo">{ar ? "شعار المنشأة" : "Brand logo"}</Label>
                <Input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onLogo(e.target.files?.[0])}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {ar ? "يتم تحجيم الشعار تلقائياً إلى 40×40" : "Logo auto-resized to 40×40"}
                </p>
              </div>

              {program === "points" ? (
                <div>
                  <Label>
                    {ar
                      ? `ريال لكل نقطة: ${design.sarPerPoint}`
                      : `SAR per point: ${design.sarPerPoint}`}
                  </Label>
                  <Slider
                    min={1}
                    max={50}
                    step={1}
                    value={[design.sarPerPoint]}
                    onValueChange={([v]) => setDesign({ ...design, sarPerPoint: v ?? 10 })}
                  />
                </div>
              ) : (
                <div>
                  <Label>
                    {ar
                      ? `عدد الأختام المطلوبة: ${design.targetStamps}`
                      : `Target stamps: ${design.targetStamps}`}
                  </Label>
                  <Slider
                    min={3}
                    max={12}
                    step={1}
                    value={[design.targetStamps]}
                    onValueChange={([v]) => setDesign({ ...design, targetStamps: v ?? 9 })}
                  />
                </div>
              )}

              <Button onClick={() => toast.success(ar ? "تم حفظ تصميم البطاقة" : "Pass design saved")}>
                {t("save")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {ar ? "قالب مرجعي:" : "Template:"} <code>{tpl.id}</code>
              </p>
            </div>

            <div className="panel p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {ar ? "معاينة حية مزدوجة" : "Live dual preview"}
              </h2>
              <PassPreview design={design} locale={locale} />
            </div>
          </TabsContent>

          {/* PIN */}
          <TabsContent value="pin" className="panel mt-4 max-w-md space-y-4 p-6">
            <Label htmlFor="pin">{ar ? "رمز الكاشير المكون من ٤ أرقام" : "4-digit cashier PIN"}</Label>
            <Input
              id="pin"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-32 text-center text-2xl tracking-[0.5em]"
            />
            <Button
              disabled={pin.length !== 4}
              onClick={() => {
                window.localStorage.setItem("cashier_pin", pin);
                toast.success(ar ? "تم تحديث الرمز" : "PIN updated");
              }}
            >
              {t("save")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {ar
                ? "يستخدم موظفو الفرع هذا الرمز لفتح شاشة الماسح /scan"
                : "Store staff use this PIN to unlock the /scan terminal"}
            </p>
          </TabsContent>

          {/* Geofence */}
          <TabsContent value="geo" className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="panel space-y-4 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="lat">{ar ? "خط العرض" : "Latitude"}</Label>
                  <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="lng">{ar ? "خط الطول" : "Longitude"}</Label>
                  <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="gAr">{ar ? "نص التنبيه (عربي)" : "Proximity text (AR)"}</Label>
                <Textarea id="gAr" value={geoAr} onChange={(e) => setGeoAr(e.target.value)} dir="rtl" />
              </div>
              <div>
                <Label htmlFor="gEn">{ar ? "نص التنبيه (إنجليزي)" : "Proximity text (EN)"}</Label>
                <Textarea id="gEn" value={geoEn} onChange={(e) => setGeoEn(e.target.value)} dir="ltr" />
              </div>
              <Button onClick={() => toast.success(ar ? "تم حفظ الموقع" : "Location saved")}>
                {t("save")}
              </Button>
            </div>
            <div className="panel overflow-hidden">
              <iframe
                title="map"
                className="h-full min-h-80 w-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.01}%2C${Number(lat) - 0.01}%2C${Number(lng) + 0.01}%2C${Number(lat) + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`}
              />
            </div>
          </TabsContent>

          {/* Push */}
          <TabsContent value="push" className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="panel space-y-4 p-6">
              <h2 className="text-lg font-semibold">{ar ? "حملة فورية" : "Instant broadcast"}</h2>
              <div>
                <Label htmlFor="pAr">{ar ? "نص الإشعار (عربي)" : "Message (AR)"}</Label>
                <Textarea id="pAr" value={pushAr} onChange={(e) => setPushAr(e.target.value)} dir="rtl" />
              </div>
              <div>
                <Label htmlFor="pEn">{ar ? "نص الإشعار (إنجليزي)" : "Message (EN)"}</Label>
                <Textarea id="pEn" value={pushEn} onChange={(e) => setPushEn(e.target.value)} dir="ltr" />
              </div>
              <Button disabled={sending} onClick={() => broadcast("all")}>
                {sending ? "…" : t("send")}
              </Button>
            </div>

            <div className="panel space-y-4 p-6">
              <h2 className="text-lg font-semibold">
                {ar ? "تذكيرات الخمول التلقائية" : "Automated inactivity reminders"}
              </h2>
              {(
                [
                  ["d14", 14, "inactive_14"],
                  ["d30", 30, "inactive_30"],
                  ["d60", 60, "inactive_60"],
                ] as const
              ).map(([key, days, segment]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="font-medium">
                      {ar ? `بعد ${days} يوماً من الخمول` : `After ${days} days inactive`}
                    </p>
                    <button
                      className="text-xs text-primary underline"
                      onClick={() => broadcast(segment)}
                    >
                      {ar ? "إرسال تجريبي الآن" : "Send test now"}
                    </button>
                  </div>
                  <Switch
                    checked={reminders[key]}
                    onCheckedChange={(v) => {
                      setReminders({ ...reminders, [key]: v });
                      toast.success(ar ? "تم تحديث الأتمتة" : "Automation updated");
                    }}
                  />
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="panel p-6">
              <h2 className="mb-4 text-lg font-semibold">
                {ar ? "التثبيت مقابل الاستبدال" : "Installs vs redemptions"}
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={INSTALLS}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="installs" stroke="var(--primary)" strokeWidth={2} />
                  <Line type="monotone" dataKey="redemptions" stroke="var(--accent)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="panel p-6">
              <h2 className="mb-4 text-lg font-semibold">{ar ? "ساعات الذروة" : "Peak visit hours"}</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={PEAK}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="h" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="v" fill="var(--accent)" radius={6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
              {[
                [t("installs"), "578"],
                [t("redemptions"), "331"],
                [t("retention"), "64%"],
              ].map(([label, value]) => (
                <div key={label} className="panel p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-3xl font-extrabold">{value}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
