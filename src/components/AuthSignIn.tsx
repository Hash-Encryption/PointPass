import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthSignIn({
  title,
  description,
  redirectPath,
  ar,
}: {
  title: string;
  description: string;
  redirectPath: string;
  ar: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setPassword("");
      toast.error(error.message);
    }
  }

  async function sendMagicLink() {
    if (!email) return;
    setSendingLink(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
      },
    });
    setSendingLink(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      ar
        ? "تم إرسال رابط تسجيل الدخول إلى بريدك الإلكتروني."
        : "A sign-in link was sent to your email.",
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={signIn} className="panel w-full max-w-sm space-y-5 p-6">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-email">{ar ? "البريد الإلكتروني" : "Email"}</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-password">{ar ? "كلمة المرور" : "Password"}</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            dir="ltr"
          />
        </div>
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : ar ? "دخول" : "Sign in"}
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>{ar ? "أو" : "or"}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          className="w-full"
          type="button"
          variant="outline"
          disabled={!email || sendingLink}
          onClick={sendMagicLink}
        >
          {sendingLink ? (
            <Loader2 className="size-4 animate-spin" />
          ) : ar ? (
            "إرسال رابط دخول بالبريد"
          ) : (
            "Email me a sign-in link"
          )}
        </Button>
      </form>
    </div>
  );
}
