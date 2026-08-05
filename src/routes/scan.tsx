import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Coins, Gift, Lock, Stamp } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { updateWalletPass } from "@/lib/wallet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "شاشة الكاشير | Cashier Terminal — Wallet Loyalty" },
      {
        name: "description",
        content: "PIN-protected cashier terminal to scan customer wallet passes, add stamps, log SAR spend and redeem rewards.",
      },
      { property: "og:title", content: "Cashier Terminal — Wallet Loyalty" },
      { property: "og:description", content: "Scan, stamp and redeem loyalty passes in seconds." },
    ],
  }),
  component: CashierTerminal,
});

function CashierTerminal() {
  const { locale, t, toggle } = useLocale();
  const ar = locale === "ar";
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [serial, setSerial] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  function unlock() {
    const saved = window.localStorage.getItem("cashier_pin") ?? "1234";
    if (pin === saved) {
      setUnlocked(true);
      toast.success(ar ? "تم فتح الشاشة" : "Terminal unlocked");
    } else {
      toast.error(ar ? "رمز غير صحيح" : "Incorrect PIN");
      setPin("");
    }
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
    await supabase
      .from("pass_transactions")
      .insert({
        pass_serial: serial,
        action,
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

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-dark px-4">
        <div className="w-full max-w-xs space-y-6 text-center text-surface-dark-foreground">
          <Lock className="mx-auto size-10 text-primary" />
          <h1 className="text-xl font-bold">{t("enterPin")}</h1>
          <Input
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="border-white/20 bg-white/10 text-center text-3xl tracking-[0.6em] text-surface-dark-foreground"
          />
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "↵"].map((k) => (
              <Button
                key={k}
                variant="secondary"
                className="h-14 text-lg"
                onClick={() => {
                  if (k === "C") setPin("");
                  else if (k === "↵") unlock();
                  else setPin((p) => (p + k).slice(0, 4));
                }}
              >
                {k}
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="text-surface-dark-foreground" onClick={toggle}>
            {t("language")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark text-surface-dark-foreground">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="font-semibold">{t("cashierPortal")}</h1>
        <Button size="sm" variant="secondary" onClick={toggle}>
          {t("language")}
        </Button>
      </header>

      <main className="mx-auto max-w-md space-y-5 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div id="qr-reader" className="overflow-hidden rounded-xl" />
          {!scanning ? (
            <Button className="mt-3 h-14 w-full text-base" onClick={startScan}>
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

        <Button className="h-16 w-full text-lg" onClick={() => act("stamp")}>
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
          <Button className="mt-3 h-14 w-full text-base" variant="secondary" onClick={() => act("points")}>
            <Coins className="me-2 size-5" /> {t("logAmount")}
          </Button>
        </div>

        <Button
          className="h-16 w-full bg-accent text-lg text-accent-foreground hover:bg-accent/90"
          onClick={() => act("redeem")}
        >
          <Gift className="me-2 size-6" /> {t("redeem")}
        </Button>
      </main>
    </div>
  );
}
