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
  business_id: string;
  business_slug: string;
  name_ar: string;
  name_en: string;
  branch_name_ar: string | undefined;
  branch_name_en: string | undefined;
  staff_name_ar: string | undefined;
  staff_name_en: string | undefined;
};

type UnlockResult = BusinessInfo & {
  cashier_session: string;
  session_expires_at: string;
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
  const [branchCode, setBranchCode] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem("cashier_last_branch") ?? ""),
  );
  const [staffCode, setStaffCode] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem("cashier_last_staff") ?? ""),
  );
  const [deviceName, setDeviceName] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem("cashier_device_name") ?? ""),
  );
  const [authenticating, setAuthenticating] = useState(false);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [cashierSession, setCashierSession] = useState<string | null>(null);
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
    if (Boolean(branchCode) !== Boolean(staffCode)) {
      toast.error(ar ? "أدخل رمز الفرع ورمز الموظف معاً" : "Enter both branch code and staff code");
      return;
    }

    setAuthenticating(true);
    try {
      const { data, error } = branchCode
        ? await supabase
            .rpc("cashier_unlock_staff", {
              _slug: cleanSlug,
              _branch_code: branchCode,
              _staff_code: staffCode,
              _pin: pin,
              _device_name: deviceName || null,
            })
            .maybeSingle()
        : await supabase.rpc("cashier_unlock", { _slug: cleanSlug, _pin: pin }).maybeSingle();
      const biz = data as UnlockResult | null;

      if (error || !biz) {
        toast.error(
          ar ? "اسم المنشأة أو رمز PIN غير صحيح" : "Incorrect business slug or cashier PIN",
        );
        setPin("");
        return;
      }

      // Success: Save slug for quick future logins on this device
      localStorage.setItem("cashier_last_slug", cleanSlug);
      if (branchCode) {
        localStorage.setItem("cashier_last_branch", branchCode);
        localStorage.setItem("cashier_last_staff", staffCode);
        localStorage.setItem("cashier_device_name", deviceName);
      }
      setBusiness({
        business_id: biz.business_id,
        business_slug: biz.business_slug,
        name_ar: biz.name_ar,
        name_en: biz.name_en,
        branch_name_ar: biz.branch_name_ar,
        branch_name_en: biz.branch_name_en,
        staff_name_ar: biz.staff_name_ar,
        staff_name_en: biz.staff_name_en,
      });
      setCashierSession(biz.cashier_session);
      setPin("");
      toast.success(
        ar ? `تم فتح الشاشة لـ ${biz.name_ar}` : `Terminal unlocked for ${biz.name_en}`,
      );
    } catch {
      toast.error(ar ? "خطأ في الاتصال بالخادم" : "Connection error");
    } finally {
      setAuthenticating(false);
    }
  }

  function lockTerminal(showToast = true) {
    setBusiness(null);
    setCashierSession(null);
    setPin("");
    setSerial(null);
    scannerRef.current?.stop().catch(() => {});
    setScanning(false);
    if (showToast) toast.info(ar ? "تم إغلاق الشاشة" : "Terminal locked");
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
    if (!business || !cashierSession) {
      toast.error(
        ar ? "انتهت جلسة الكاشير. افتح الشاشة مجدداً" : "Cashier session expired. Unlock again",
      );
      lockTerminal(false);
      return;
    }

    const amountSar = Number(amount);
    if (action === "points" && (!Number.isFinite(amountSar) || amountSar <= 0)) {
      toast.error(ar ? "أدخل مبلغاً صحيحاً أكبر من صفر" : "Enter a valid amount above zero");
      return;
    }

    const actionInput = {
      slug: business.business_slug,
      cashierSession,
      serial,
      action,
      ...(action === "points" ? { amountSar } : {}),
    };

    const res = await updateWalletPass({
      data: {
        ...actionInput,
      },
    });
    if (res.ok) {
      toast.success(ar ? "تم تسجيل العملية وتحديث المحفظة" : "Action recorded and wallet updated");
    } else if (res.recorded) {
      toast.warning(
        ar
          ? "تم تسجيل العملية، لكن مزامنة المحفظة غير متاحة"
          : "Action recorded, but wallet sync is unavailable",
      );
    } else if (res.sessionExpired) {
      toast.error(
        ar ? "انتهت جلسة الكاشير. افتح الشاشة مجدداً" : "Cashier session expired. Unlock again",
      );
      lockTerminal(false);
    } else {
      toast.error(res.error ?? (ar ? "تعذر تسجيل العملية" : "Could not record action"));
    }
    if (action === "points") setAmount("");
  }

  // Locked Screen: Requires Restaurant Slug & Cashier PIN
  if (!business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-dark px-4">
        <form
          onSubmit={unlockTerminal}
          className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-surface-dark-foreground shadow-2xl"
        >
          <div className="space-y-2">
            <Lock className="mx-auto size-10 text-primary" />
            <h1 className="text-xl font-bold">
              {ar ? "تسجيل دخول الكاشير" : "Cashier POS Terminal"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "أدخل المنشأة ورمز PIN. أضف الفرع والموظف للجلسات المعرّفة."
                : "Enter the business and PIN. Add branch and staff for identified sessions."}
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="branch-code" className="text-xs text-muted-foreground">
                  {ar ? "رمز الفرع" : "Branch code"}
                </Label>
                <Input
                  id="branch-code"
                  value={branchCode}
                  onChange={(e) =>
                    setBranchCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  dir="ltr"
                  className="mt-1 border-white/20 bg-white/10 text-surface-dark-foreground"
                />
              </div>
              <div>
                <Label htmlFor="staff-code" className="text-xs text-muted-foreground">
                  {ar ? "رمز الموظف" : "Staff code"}
                </Label>
                <Input
                  id="staff-code"
                  value={staffCode}
                  onChange={(e) =>
                    setStaffCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  dir="ltr"
                  className="mt-1 border-white/20 bg-white/10 text-surface-dark-foreground"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="device-name" className="text-xs text-muted-foreground">
                {ar ? "اسم الجهاز (اختياري)" : "Device name (optional)"}
              </Label>
              <Input
                id="device-name"
                maxLength={120}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder={ar ? "كاشير ١" : "Register 1"}
                className="mt-1 border-white/20 bg-white/10 text-surface-dark-foreground"
              />
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

          <Button
            type="submit"
            className="w-full h-12 text-base font-bold"
            disabled={authenticating}
          >
            {authenticating
              ? ar
                ? "جاري التحقق..."
                : "Verifying..."
              : ar
                ? "دخول الشاشة"
                : "Unlock Terminal"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="text-xs text-surface-dark-foreground opacity-70"
            onClick={toggle}
          >
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
            <p className="text-[10px] text-muted-foreground dir-ltr">@{business.business_slug}</p>
            {business.staff_name_en ? (
              <p className="text-[10px] text-muted-foreground">
                {ar ? business.staff_name_ar : business.staff_name_en} ·{" "}
                {ar ? business.branch_name_ar : business.branch_name_en}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggle}>
            {t("language")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => lockTerminal()}>
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
          <p className="mt-3 text-center text-xs opacity-70" aria-live="polite">
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
          <Button
            className="mt-3 h-14 w-full text-base font-bold"
            variant="secondary"
            onClick={() => act("points")}
          >
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
