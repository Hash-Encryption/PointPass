import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Coins, Gift, Lock, LogOut, Stamp, Store } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { updateWalletPass } from "@/lib/wallet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "شاشة الكاشير | Cashier Terminal — Wallet Loyalty" },
      {
        name: "description",
        content:
          "PIN-protected cashier terminal to scan customer wallet passes, add stamps, log SAR spend and redeem rewards.",
      },
      { property: "og:title", content: "Cashier Terminal — Wallet Loyalty" },
      { property: "og:description", content: "Scan, stamp and redeem loyalty passes in seconds." },
    ],
  }),
  component: CashierTerminal,
});

type BusinessInfo = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  cashier_pin: string;
};

function CashierTerminal() {
  const { locale, t, toggle } = useLocale();
  const ar = locale === "ar";

  const [slug, setSlug] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cashier_last_slug") ?? "";
    }
    return "";
  });

  const [pin, setPin] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [serial, setSerial] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  async function unlockTerminal(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();

    if (!cleanSlug) {
      toast.error(ar ? "يرجى كتابة اسم/معرّف المطعم (Slug)" : "Please enter restaurant slug");
      return;
    }
    if (pin.length !== 4) {
      toast.error(ar ? "أدخل رمز PIN المكون من 4 أرقام" : "Enter 4-digit PIN");
      return;
    }

    setAuthenticating(true);
    try {
      const { data: biz, error } = await supabase
        .from("businesses")
        .select("id, slug, name_ar, name_en, cashier_pin, status")
        .eq("slug", cleanSlug)
        .eq("status", "active")
        .maybeSingle();

      if (error || !biz) {
        toast.error(ar ? "المطعم/المنشأة غير موجودة" : "Restaurant / Business not found");
        return;
      }

      const expectedPin = biz.cashier_pin || "1234";
      if (pin !== expectedPin) {
        toast.error(ar ? "رمز PIN غير صحيح لهذا المطعم" : "Incorrect PIN for this restaurant");
        setPin("");
        return;
      }

      // Success: Save slug for quick future logins on this device
      localStorage.setItem("cashier_last_slug", cleanSlug);
      setBusiness(biz as BusinessInfo);
      toast.success(
        ar
          ? `تم فتح الشاشة لـ ${biz.name_ar}`
          : `Terminal unlocked for ${biz.name_en}`,
      );
    } catch {
      toast.error(ar ? "خطأ في الاتصال بالخادم" : "Connection error");
    } finally {
      setAuthenticating(false);
    }
  }

  function lockTerminal() {
    setBusiness(null);
    setPin("");
    setSerial(null);
    scannerRef.current?.stop().catch(() => {});
    setScanning(false);
    toast.info(ar ? "تم إغلاق الشاشة" : "Terminal locked");
  }

  async function startScan() {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        async (text) => {
          setSerial(text);
          await scanner.stop();
          setScanning(false);
          toast.success(ar ? "تم مسح البطاقة" : "Pass scanned");
        },
        () => {},
      );
    } catch {
      setScanning(false);
      toast.error(ar ? "تعذر فتح الكاميرا" : "Camera unavailable");
    }
  }

  async function act(action: "stamp" | "points" | "redeem") {
    if (!serial) {
      toast.error(ar ? "امسح بطاقة أولاً" : "Scan a pass first");
      return;
    }
    if (!business) return;

    await supabase
      .from("pass_transactions")
      .insert({
        pass_serial: serial,
        action,
        business_id: business.id,
        amount_sar: action === "points" ? Number(amount || 0) : null,
      })
      .then(() => undefined, () => undefined);

    const res = await updateWalletPass({
      data: {
        serial,
        action,
        ...(action === "points" ? { amountSar: Number(amount || 0) } : {}),
      },
    });
    if (res.ok) toast.success(ar ? "تم تحديث محفظة العميل 🔔" : "Customer wallet updated 🔔");
    else toast.error(ar ? "فشل التحديث — تحقق من مفتاح API" : "Update failed — check API key");
    if (action === "points") setAmount("");
  }

  // Locked Screen: Requires Restaurant Slug & Cashier PIN
  if (!business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-dark px-4">
        <form onSubmit={unlockTerminal} className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-surface-dark-foreground shadow-2xl">
          <div className="space-y-2">
            <Lock className="mx-auto size-10 text-primary" />
            <h1 className="text-xl font-bold">{ar ? "تسجيل دخول الكاشير" : "Cashier POS Terminal"}</h1>
            <p className="text-xs text-muted-foreground">
              {ar ? "أدخل اسم المطعم ورمز PIN لبدء المسح" : "Enter restaurant slug & 4-digit PIN"}
            </p>
          </div>

          <div className="space-y-3 text-start">
            <div>
              <Label htmlFor="restaurant-slug" className="text-xs text-muted-foreground">
                {ar ? "اسم المطعم/المنشأة (Slug)" : "Restaurant Slug"}
              </Label>
              <div className="relative mt-1">
                <Store className="absolute start-3 top-3 size-4 text-muted-foreground" />
                <Input
                  id="restaurant-slug"
                  placeholder="my-coffee-shop"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  required
                  dir="ltr"
                  className="ps-9 border-white/20 bg-white/10 text-surface-dark-foreground"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cashier-pin" className="text-xs text-muted-foreground">
                {ar ? "رمز PIN (٤ أرقام)" : "Cashier PIN (4 digits)"}
              </Label>
              <Input
                id="cashier-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                required
                dir="ltr"
                className="mt-1 border-white/20 bg-white/10 text-center text-2xl tracking-[0.5em] text-surface-dark-foreground"
              />
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "↵"].map((k) => (
              <Button
                key={k}
                type="button"
                variant="secondary"
                className="h-12 text-lg font-bold"
                onClick={() => {
                  if (k === "C") setPin("");
                  else if (k === "↵") void unlockTerminal();
                  else setPin((p) => (p + k).slice(0, 4));
                }}
              >
                {k}
              </Button>
            ))}
          </div>

          <Button type="submit" className="w-full h-12 text-base font-bold" disabled={authenticating}>
            {authenticating ? (
              ar ? "جاري التحقق..." : "Verifying..."
            ) : (
              ar ? "دخول الشاشة" : "Unlock Terminal"
            )}
          </Button>

          <Button type="button" variant="ghost" className="text-xs text-surface-dark-foreground opacity-70" onClick={toggle}>
            {t("language")}
          </Button>
        </form>
      </div>
    );
  }

  // Unlocked POS Screen: Scoped to logged-in Business
  return (
    <div className="min-h-screen bg-surface-dark text-surface-dark-foreground">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Store className="size-5 text-primary" />
          <div>
            <h1 className="font-bold text-sm">{ar ? business.name_ar : business.name_en}</h1>
            <p className="text-[10px] text-muted-foreground dir-ltr">@{business.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggle}>
            {t("language")}
          </Button>
          <Button size="sm" variant="destructive" onClick={lockTerminal}>
            <LogOut className="size-3.5 me-1" />
            {ar ? "خروج" : "Lock"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div id="qr-reader" className="overflow-hidden rounded-xl" />
          {!scanning ? (
            <Button className="mt-3 h-14 w-full text-base font-bold" onClick={startScan}>
              <Camera className="me-2 size-5" /> {t("scanNow")}
            </Button>
          ) : (
            <p className="mt-3 text-center text-sm opacity-80">
              {ar ? "جارٍ المسح…" : "Scanning…"}
            </p>
          )}
          <p className="mt-3 text-center text-xs opacity-70">
            {serial
              ? `${ar ? "البطاقة" : "Pass"}: ${serial}`
              : ar
                ? "لم يتم مسح بطاقة بعد"
                : "No pass scanned yet"}
          </p>
        </div>

        <Button className="h-16 w-full text-lg font-bold" onClick={() => act("stamp")}>
          <Stamp className="me-2 size-6" /> {t("stamp")}
        </Button>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <Input
            inputMode="decimal"
            placeholder={ar ? "المبلغ بالريال" : "Amount in SAR"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-14 border-white/20 bg-white/10 text-center text-xl text-surface-dark-foreground"
          />
          <Button className="mt-3 h-14 w-full text-base font-bold" variant="secondary" onClick={() => act("points")}>
            <Coins className="me-2 size-5" /> {t("logAmount")}
          </Button>
        </div>

        <Button
          className="h-16 w-full bg-accent text-lg font-bold text-accent-foreground hover:bg-accent/90"
          onClick={() => act("redeem")}
        >
          <Gift className="me-2 size-6" /> {t("redeem")}
        </Button>
      </main>
    </div>
  );
}
