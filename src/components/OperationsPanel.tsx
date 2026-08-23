import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type Branch = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  address_ar: string | null;
  address_en: string | null;
  status: "active" | "inactive";
};

type Staff = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  email: string | null;
  role: "owner" | "admin" | "manager" | "staff" | "cashier";
  status: "active" | "inactive";
  auth_user_id: string | null;
};

type Assignment = { staff_id: string; branch_id: string };
type CashierSession = {
  id: string;
  staff_id: string | null;
  branch_id: string | null;
  device_name: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
};

const emptyBranch: {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  addressAr: string;
  addressEn: string;
  status: Branch["status"];
} = {
  id: "",
  code: "",
  nameAr: "",
  nameEn: "",
  addressAr: "",
  addressEn: "",
  status: "active",
};

const emptyStaff: {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  email: string;
  role: Staff["role"];
  status: Staff["status"];
  pin: string;
} = {
  id: "",
  code: "",
  nameAr: "",
  nameEn: "",
  email: "",
  role: "cashier",
  status: "active",
  pin: "",
};

export function OperationsPanel({ businessId, ar }: { businessId: string; ar: boolean }) {
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [assignment, setAssignment] = useState({ staffId: "", branchId: "" });
  const [saving, setSaving] = useState(false);

  const accessQuery = useQuery({
    queryKey: ["operations-access", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("operations_access", { _business_id: businessId })
        .single();
      if (error) throw error;
      return data as { operational_role: string; can_manage: boolean };
    },
  });

  const operationsQuery = useQuery({
    queryKey: ["business-operations", businessId],
    enabled: accessQuery.isSuccess,
    queryFn: async () => {
      const [branches, staff, assignments, sessions] = await Promise.all([
        supabase
          .from("branches")
          .select("id,code,name_ar,name_en,address_ar,address_en,status")
          .eq("business_id", businessId)
          .order("created_at"),
        supabase
          .from("staff_members")
          .select("id,code,name_ar,name_en,email,role,status,auth_user_id")
          .eq("business_id", businessId)
          .order("created_at"),
        supabase
          .from("staff_branch_assignments")
          .select("staff_id,branch_id")
          .eq("business_id", businessId),
        supabase
          .from("cashier_sessions")
          .select("id,staff_id,branch_id,device_name,created_at,last_used_at,expires_at,revoked_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const error = branches.error ?? staff.error ?? assignments.error ?? sessions.error;
      if (error) throw error;
      return {
        branches: branches.data as Branch[],
        staff: staff.data as Staff[],
        assignments: assignments.data as Assignment[],
        sessions: sessions.data as CashierSession[],
      };
    },
  });

  const canManage = accessQuery.data?.can_manage ?? false;
  const data = operationsQuery.data ?? {
    branches: [],
    staff: [],
    assignments: [],
    sessions: [],
  };
  const branchById = new Map(data.branches.map((branch) => [branch.id, branch]));
  const staffById = new Map(data.staff.map((member) => [member.id, member]));

  async function saveBranch(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc("operations_upsert_branch", {
      _business_id: businessId,
      _branch_id: branchForm.id || null,
      _code: branchForm.code,
      _name_ar: branchForm.nameAr,
      _name_en: branchForm.nameEn,
      _address_ar: branchForm.addressAr || null,
      _address_en: branchForm.addressEn || null,
      _status: branchForm.status,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBranchForm(emptyBranch);
    await operationsQuery.refetch();
    toast.success(ar ? "تم حفظ الفرع" : "Branch saved");
  }

  async function saveStaff(event: React.FormEvent) {
    event.preventDefault();
    if (staffForm.pin && !/^\d{4}$/.test(staffForm.pin)) {
      toast.error(ar ? "يجب أن يتكون PIN من ٤ أرقام" : "PIN must contain 4 digits");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("operations_upsert_staff", {
      _business_id: businessId,
      _staff_id: staffForm.id || null,
      _code: staffForm.code,
      _name_ar: staffForm.nameAr,
      _name_en: staffForm.nameEn,
      _email: staffForm.email || null,
      _role: staffForm.role,
      _status: staffForm.status,
      _pin: staffForm.pin || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStaffForm(emptyStaff);
    await operationsQuery.refetch();
    toast.success(ar ? "تم حفظ الموظف" : "Staff member saved");
  }

  async function setAssigned(staffId: string, branchId: string, assigned: boolean) {
    setSaving(true);
    const { error } = await supabase.rpc("operations_assign_staff", {
      _business_id: businessId,
      _staff_id: staffId,
      _branch_id: branchId,
      _assigned: assigned,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAssignment({ staffId: "", branchId: "" });
    await operationsQuery.refetch();
    toast.success(ar ? "تم تحديث التكليف" : "Assignment updated");
  }

  async function revokeSession(sessionId: string) {
    setSaving(true);
    const { error } = await supabase.rpc("operations_revoke_session", {
      _business_id: businessId,
      _session_id: sessionId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await operationsQuery.refetch();
    toast.success(ar ? "تم إلغاء الجلسة" : "Session revoked");
  }

  if (accessQuery.isLoading || operationsQuery.isLoading) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground">
        {ar ? "جارٍ التحميل…" : "Loading…"}
      </div>
    );
  }
  if (accessQuery.isError || operationsQuery.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive" role="alert">
        {accessQuery.error?.message ?? operationsQuery.error?.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{ar ? "عمليات المنشأة" : "Business operations"}</h2>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "الفروع والموظفون والتكليفات وجلسات أجهزة الكاشير"
              : "Branches, staff, assignments, and cashier device sessions"}
          </p>
        </div>
        <Badge variant={canManage ? "default" : "outline"}>
          {accessQuery.data?.operational_role}
        </Badge>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        {canManage ? (
          <form className="panel space-y-3 p-5" onSubmit={saveBranch}>
            <h3 className="font-semibold">{ar ? "إضافة / تعديل فرع" : "Add / edit branch"}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={ar ? "رمز الفرع" : "Branch code"}>
                <Input
                  required
                  dir="ltr"
                  value={branchForm.code}
                  onChange={(e) =>
                    setBranchForm({ ...branchForm, code: cleanCode(e.target.value) })
                  }
                />
              </Field>
              <Field label={ar ? "الحالة" : "Status"}>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={branchForm.status}
                  onChange={(e) =>
                    setBranchForm({ ...branchForm, status: e.target.value as Branch["status"] })
                  }
                >
                  <option value="active">{ar ? "نشط" : "Active"}</option>
                  <option value="inactive">{ar ? "غير نشط" : "Inactive"}</option>
                </select>
              </Field>
              <Field label={ar ? "الاسم بالعربية" : "Arabic name"}>
                <Input
                  required
                  value={branchForm.nameAr}
                  onChange={(e) => setBranchForm({ ...branchForm, nameAr: e.target.value })}
                />
              </Field>
              <Field label={ar ? "الاسم بالإنجليزية" : "English name"}>
                <Input
                  required
                  value={branchForm.nameEn}
                  onChange={(e) => setBranchForm({ ...branchForm, nameEn: e.target.value })}
                />
              </Field>
              <Field label={ar ? "العنوان بالعربية" : "Arabic address"}>
                <Input
                  value={branchForm.addressAr}
                  onChange={(e) => setBranchForm({ ...branchForm, addressAr: e.target.value })}
                />
              </Field>
              <Field label={ar ? "العنوان بالإنجليزية" : "English address"}>
                <Input
                  value={branchForm.addressEn}
                  onChange={(e) => setBranchForm({ ...branchForm, addressEn: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {ar ? "حفظ الفرع" : "Save branch"}
              </Button>
              {branchForm.id ? (
                <Button type="button" variant="outline" onClick={() => setBranchForm(emptyBranch)}>
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        <div className="panel p-5">
          <h3 className="font-semibold">{ar ? "الفروع" : "Branches"}</h3>
          <div className="mt-3 space-y-2">
            {data.branches.length ? (
              data.branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  disabled={!canManage}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-start disabled:cursor-default"
                  onClick={() =>
                    setBranchForm({
                      id: branch.id,
                      code: branch.code,
                      nameAr: branch.name_ar,
                      nameEn: branch.name_en,
                      addressAr: branch.address_ar ?? "",
                      addressEn: branch.address_en ?? "",
                      status: branch.status,
                    })
                  }
                >
                  <span>
                    <span className="block font-medium">
                      {ar ? branch.name_ar : branch.name_en}
                    </span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {branch.code}
                    </span>
                  </span>
                  <Badge variant={branch.status === "active" ? "default" : "outline"}>
                    {branch.status}
                  </Badge>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {ar
                  ? "لا توجد فروع بعد. يبقى مسار الكاشير القديم متاحاً."
                  : "No branches yet. The legacy cashier path remains available."}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {canManage ? (
          <form className="panel space-y-3 p-5" onSubmit={saveStaff}>
            <h3 className="font-semibold">{ar ? "إضافة / تعديل موظف" : "Add / edit staff"}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={ar ? "رمز الموظف" : "Staff code"}>
                <Input
                  required
                  dir="ltr"
                  value={staffForm.code}
                  onChange={(e) => setStaffForm({ ...staffForm, code: cleanCode(e.target.value) })}
                />
              </Field>
              <Field label={ar ? "الدور" : "Role"}>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={staffForm.role}
                  onChange={(e) =>
                    setStaffForm({ ...staffForm, role: e.target.value as Staff["role"] })
                  }
                >
                  {(["owner", "admin", "manager", "staff", "cashier"] as const).map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={ar ? "الاسم بالعربية" : "Arabic name"}>
                <Input
                  required
                  value={staffForm.nameAr}
                  onChange={(e) => setStaffForm({ ...staffForm, nameAr: e.target.value })}
                />
              </Field>
              <Field label={ar ? "الاسم بالإنجليزية" : "English name"}>
                <Input
                  required
                  value={staffForm.nameEn}
                  onChange={(e) => setStaffForm({ ...staffForm, nameEn: e.target.value })}
                />
              </Field>
              <Field label={ar ? "البريد للحساب" : "Account email"}>
                <Input
                  type="email"
                  dir="ltr"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                />
              </Field>
              <Field label={ar ? "الحالة" : "Status"}>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={staffForm.status}
                  onChange={(e) =>
                    setStaffForm({ ...staffForm, status: e.target.value as Staff["status"] })
                  }
                >
                  <option value="active">{ar ? "نشط" : "Active"}</option>
                  <option value="inactive">{ar ? "غير نشط" : "Inactive"}</option>
                </select>
              </Field>
              <Field label={ar ? "PIN جديد (٤ أرقام)" : "New PIN (4 digits)"}>
                <Input
                  type="password"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={4}
                  value={staffForm.pin}
                  onChange={(e) =>
                    setStaffForm({
                      ...staffForm,
                      pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                    })
                  }
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "اترك PIN فارغاً للإبقاء عليه. تغييره يلغي جلسات الموظف."
                : "Leave PIN blank to keep it. Changing it revokes the staff member’s sessions."}
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {ar ? "حفظ الموظف" : "Save staff"}
              </Button>
              {staffForm.id ? (
                <Button type="button" variant="outline" onClick={() => setStaffForm(emptyStaff)}>
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        <div className="panel p-5">
          <h3 className="font-semibold">{ar ? "الموظفون" : "Staff"}</h3>
          <div className="mt-3 space-y-2">
            {data.staff.length ? (
              data.staff.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  disabled={!canManage}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-start disabled:cursor-default"
                  onClick={() =>
                    setStaffForm({
                      id: member.id,
                      code: member.code,
                      nameAr: member.name_ar,
                      nameEn: member.name_en,
                      email: member.email ?? "",
                      role: member.role,
                      status: member.status,
                      pin: "",
                    })
                  }
                >
                  <span>
                    <span className="block font-medium">
                      {ar ? member.name_ar : member.name_en}
                    </span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {member.code} · {member.email ?? (ar ? "دون حساب" : "no account")}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Badge variant="outline">{member.role}</Badge>
                    <Badge variant={member.status === "active" ? "default" : "outline"}>
                      {member.status}
                    </Badge>
                  </span>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {ar ? "لا يوجد موظفون بعد" : "No staff yet"}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="font-semibold">{ar ? "تكليفات الفروع" : "Branch assignments"}</h3>
        {canManage ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm"
              value={assignment.staffId}
              onChange={(e) => setAssignment({ ...assignment, staffId: e.target.value })}
            >
              <option value="">{ar ? "اختر موظفاً" : "Choose staff"}</option>
              {data.staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {ar ? member.name_ar : member.name_en}
                </option>
              ))}
            </select>
            <select
              className="h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm"
              value={assignment.branchId}
              onChange={(e) => setAssignment({ ...assignment, branchId: e.target.value })}
            >
              <option value="">{ar ? "اختر فرعاً" : "Choose branch"}</option>
              {data.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {ar ? branch.name_ar : branch.name_en}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={saving || !assignment.staffId || !assignment.branchId}
              onClick={() => setAssigned(assignment.staffId, assignment.branchId, true)}
            >
              {ar ? "تكليف" : "Assign"}
            </Button>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {data.assignments.map((item) => (
            <div
              key={`${item.staff_id}-${item.branch_id}`}
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
            >
              <span>
                {ar ? staffById.get(item.staff_id)?.name_ar : staffById.get(item.staff_id)?.name_en}{" "}
                →{" "}
                {ar
                  ? branchById.get(item.branch_id)?.name_ar
                  : branchById.get(item.branch_id)?.name_en}
              </span>
              {canManage ? (
                <button
                  type="button"
                  className="text-destructive"
                  aria-label={ar ? "إلغاء التكليف" : "Remove assignment"}
                  onClick={() => setAssigned(item.staff_id, item.branch_id, false)}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="font-semibold">
          {ar ? "جلسات وأجهزة الكاشير" : "Cashier sessions and devices"}
        </h3>
        <div className="mt-3 space-y-2">
          {data.sessions.length ? (
            data.sessions.map((session) => {
              const active = !session.revoked_at && new Date(session.expires_at) > new Date();
              return (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {staffById.get(session.staff_id ?? "")?.[ar ? "name_ar" : "name_en"] ??
                        (ar ? "جلسة قديمة" : "Legacy session")}
                    </span>
                    <span className="ms-2 text-muted-foreground">
                      {branchById.get(session.branch_id ?? "")?.[ar ? "name_ar" : "name_en"] ?? "—"}{" "}
                      · {session.device_name ?? (ar ? "جهاز غير مسمى" : "Unnamed device")}
                    </span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      {new Date(session.last_used_at).toLocaleString()}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={active ? "default" : "outline"}>
                      {active
                        ? ar
                          ? "نشطة"
                          : "active"
                        : ar
                          ? "منتهية / ملغاة"
                          : "expired / revoked"}
                    </Badge>
                    {canManage && active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={saving}
                        onClick={() => revokeSession(session.id)}
                      >
                        {ar ? "إلغاء" : "Revoke"}
                      </Button>
                    ) : null}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">{ar ? "لا توجد جلسات" : "No sessions"}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function cleanCode(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}
