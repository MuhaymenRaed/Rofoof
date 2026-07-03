"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Bag, Heart, Grid, X, Phone } from "@/components/icons";
import { provinceCodes, provinceLabelKey } from "@/lib/provinces";
import { updateProfileAction } from "@/lib/actions/profile";

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useStore();
  const { user, isAdmin, signOut, refresh } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // seed edit fields whenever the modal opens
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !user) return;
    setEditing(false);
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setProvince(user.provinceCode ?? "");
  }, [open, user]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const initial = (user.name?.[0] ?? "؟").toUpperCase();
  const provinceLabel = user.provinceCode ? t(provinceLabelKey(user.provinceCode)) : t("profile.notSet");

  function save() {
    startTransition(async () => {
      const res = await updateProfileAction({
        fullName: name.trim(),
        phone: phone.trim() || null,
        provinceCode: province || null,
      });
      if (res.ok) {
        await refresh();
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  }

  async function doSignOut() {
    await signOut();
    onClose();
    router.push("/");
    router.refresh();
  }

  if (typeof document === "undefined") return null;

  const content = (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl">
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden bg-brand-soft px-6 pb-6 pt-7">
          <div className="pointer-events-none absolute -end-10 -top-16 h-40 w-40 rounded-full bg-brand/20 blur-2xl" />
          <div className="pointer-events-none absolute -start-12 top-6 h-32 w-32 rounded-full bg-brand/10 blur-2xl" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("aria.close")}
            className="tap absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface/60 hover:text-ink"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand text-2xl font-black text-white shadow-lg ring-4 ring-surface">
              {initial}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-ink">{user.name}</h2>
              <p dir="ltr" className="truncate text-start text-xs text-ink-2">
                {user.email}
              </p>
              <span className="mt-1.5 inline-block rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold text-white">
                {isAdmin ? t("auth.role.admin") : t("profile.memberBadge")}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {editing ? (
            <div className="space-y-3">
              <Field label={t("auth.name")}>
                <input value={name} onChange={(e) => setName(e.target.value)} className="dash-input" />
              </Field>
              <Field label={t("checkout.phone")}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  inputMode="tel"
                  className="dash-input text-start"
                />
              </Field>
              <Field label={t("checkout.province")}>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="dash-input cursor-pointer"
                >
                  <option value="">{t("checkout.selectProvince")}</option>
                  {provinceCodes.map((code) => (
                    <option key={code} value={code}>
                      {t(provinceLabelKey(code))}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="tap flex-1 rounded-xl border border-line py-2.5 text-sm font-bold text-ink-2 transition hover:bg-surface-2"
                >
                  {t("profile.cancel")}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="tap flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? t("profile.saving") : t("profile.save")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">
                {t("profile.contactInfo")}
              </p>
              <div className="space-y-2">
                <InfoRow icon={<Phone size={15} />} value={user.phone || t("profile.notSet")} ltr />
                <InfoRow icon={<Pin />} value={provinceLabel} />
              </div>

              {/* Quick links */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <QuickLink href="/orders" icon={<Bag size={17} />} label={t("profile.myOrders")} onNavigate={onClose} />
                <QuickLink href="/favorites" icon={<Heart size={17} />} label={t("profile.myFavorites")} onNavigate={onClose} />
                {isAdmin && (
                  <QuickLink href="/dashboard" icon={<Grid size={17} />} label={t("nav.dashboard")} onNavigate={onClose} />
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="tap flex-1 rounded-xl border border-line py-2.5 text-sm font-bold text-ink-2 transition hover:border-brand hover:text-brand"
                >
                  {saved ? t("profile.saved") : t("profile.edit")}
                </button>
                <button
                  type="button"
                  onClick={doSignOut}
                  className="tap flex-1 rounded-xl bg-surface-2 py-2.5 text-sm font-bold text-ink-2 transition hover:bg-red-500/10 hover:text-red-500"
                >
                  {t("auth.logout")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function InfoRow({ icon, value, ltr }: { icon: React.ReactNode; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line-2 bg-surface-2/50 px-3.5 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        {icon}
      </span>
      <span dir={ltr ? "ltr" : undefined} className="truncate text-sm font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="tap flex flex-col items-center gap-1.5 rounded-xl border border-line-2 bg-surface py-3 text-center text-[11px] font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </Link>
  );
}

function Pin() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}
