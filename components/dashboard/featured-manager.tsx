"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Star, Check, Package, Plus, Trash, ChevronEnd } from "@/components/icons";
import { StoreFilterPicker } from "@/components/ui/store-filter-picker";
import {
  addProductsToGroupAction,
  createFeaturedGroupAction,
  deleteFeaturedGroupAction,
  moveFeaturedGroupAction,
  renameFeaturedGroupAction,
  setFeaturedGroupLinkAction,
  toggleProductInGroupAction,
} from "@/lib/actions/featured";
import { formatPrice } from "@/lib/format";
import {
  lowestPrice,
  type FeaturedGroup,
  type FeaturedLinkScope,
  type Product,
} from "@/lib/products";

type Scope = "category" | "subcategory" | "fandom";

/**
 * Dashboard control room for the home-page showcase rails: create as many
 * sections as wanted, rename/reorder/delete them, fill one from a whole
 * category / subfilter / fandom in a single tap, and drop individual products.
 * Everything updates live — no page refresh.
 */
export function FeaturedManager({
  initialGroups,
  products,
}: {
  initialGroups: FeaturedGroup[];
  products: Product[];
}) {
  const { t } = useStore();
  const router = useRouter();

  const [groups, setGroups] = useState(initialGroups);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // New-section form
  const [newAr, setNewAr] = useState("");
  const [newEn, setNewEn] = useState("");

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function fail(message?: string) {
    setError(message ?? t("checkout.error"));
    router.refresh();
  }

  function createGroup() {
    if (!newAr.trim() || !newEn.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createFeaturedGroupAction({
        nameAr: newAr.trim(),
        nameEn: newEn.trim(),
      });
      if (!res.ok) {
        fail(res.error);
        return;
      }
      setGroups((prev) => [...prev, res.group]); // live
      setNewAr("");
      setNewEn("");
    });
  }

  function rename(id: string, nameAr: string, nameEn: string) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, nameAr, nameEn } : g)));
    startTransition(async () => {
      const res = await renameFeaturedGroupAction(id, { nameAr, nameEn });
      if (!res.ok) fail(res.error);
    });
  }

  function remove(id: string) {
    const before = groups;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    startTransition(async () => {
      const res = await deleteFeaturedGroupAction(id);
      if (!res.ok) {
        setGroups(before);
        fail(res.error);
      }
    });
  }

  function move(id: string, dir: -1 | 1) {
    const index = groups.findIndex((g) => g.id === id);
    const target = index + dir;
    if (index === -1 || target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    setGroups(next);
    startTransition(async () => {
      const res = await moveFeaturedGroupAction(id, dir);
      if (!res.ok) fail(res.error);
    });
  }

  function setLink(
    id: string,
    next: { scope: FeaturedLinkScope | null; values: string[] },
  ) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, linkScope: next.scope, linkValues: next.values } : g,
      ),
    );
    startTransition(async () => {
      const res = await setFeaturedGroupLinkAction(id, next);
      if (!res.ok) fail(res.error);
    });
  }

  function removeProduct(groupId: string, productId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, productIds: g.productIds.filter((p) => p !== productId) } : g,
      ),
    );
    startTransition(async () => {
      const res = await toggleProductInGroupAction(groupId, productId, false);
      if (!res.ok) fail(res.error);
    });
  }

  function bulkAdd(groupId: string, ids: string[]) {
    if (ids.length === 0) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, productIds: Array.from(new Set([...g.productIds, ...ids])) }
          : g,
      ),
    );
    startTransition(async () => {
      const res = await addProductsToGroupAction(groupId, ids);
      if (!res.ok) fail(res.error);
    });
  }

  return (
    <div className="space-y-5">
      {/* Create a section */}
      <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <Star size={16} filled className="text-amber-500" />
          {t("dash.featuredGroups")}
        </h2>
        <p className="mt-1 text-[11px] text-ink-3">{t("dash.featuredGroupsHint")}</p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.featuredTitleAr")}
            </span>
            <input
              value={newAr}
              onChange={(e) => setNewAr(e.target.value)}
              maxLength={60}
              className="dash-input"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.featuredTitleEn")}
            </span>
            <input
              value={newEn}
              onChange={(e) => setNewEn(e.target.value)}
              maxLength={60}
              dir="ltr"
              className="dash-input text-start"
            />
          </label>
          <button
            type="button"
            onClick={createGroup}
            disabled={pending || !newAr.trim() || !newEn.trim()}
            className="tap inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={14} />
            {t("dash.createGroup")}
          </button>
        </div>

        {error && (
          <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
            {error}
          </p>
        )}
      </section>

      {groups.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
            <Star size={22} />
          </div>
          <p className="mt-3 text-sm font-bold text-ink">{t("dash.noGroups")}</p>
          <p className="mt-1 max-w-xs text-[12px] text-ink-3">{t("dash.noGroupsHint")}</p>
        </div>
      ) : (
        groups.map((group, index) => (
          <GroupCard
            key={group.id}
            group={group}
            index={index}
            total={groups.length}
            products={products}
            productById={productById}
            pending={pending}
            onRename={rename}
            onSetLink={setLink}
            onRemove={remove}
            onMove={move}
            onRemoveProduct={removeProduct}
            onBulkAdd={bulkAdd}
          />
        ))
      )}
    </div>
  );
}

/* ------------------------------- one section ---------------------------- */

function GroupCard({
  group,
  index,
  total,
  products,
  productById,
  pending,
  onRename,
  onSetLink,
  onRemove,
  onMove,
  onRemoveProduct,
  onBulkAdd,
}: {
  group: FeaturedGroup;
  index: number;
  total: number;
  products: Product[];
  productById: Map<string, Product>;
  pending: boolean;
  onRename: (id: string, ar: string, en: string) => void;
  onSetLink: (
    id: string,
    next: { scope: FeaturedLinkScope | null; values: string[] },
  ) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemoveProduct: (groupId: string, productId: string) => void;
  onBulkAdd: (groupId: string, ids: string[]) => void;
}) {
  const { t: tr, lang, categoryLabel, categories, subcategories, fandoms } = useStore();
  const [ar, setAr] = useState(group.nameAr);
  const [en, setEn] = useState(group.nameEn);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scope, setScope] = useState<Scope>("category");
  const [scopeValue, setScopeValue] = useState("");

  const items = group.productIds
    .map((id) => productById.get(id))
    .filter((p): p is Product => p !== undefined);

  const scopeOptions = useMemo(() => {
    if (scope === "category")
      return categories.map((c) => ({ code: c.code, label: lang === "ar" ? c.nameAr : c.nameEn }));
    if (scope === "subcategory")
      return subcategories.map((s) => ({
        code: s.code,
        label: `${lang === "ar" ? s.nameAr : s.nameEn} · ${categoryLabel(s.categoryCode)}`,
      }));
    return fandoms.map((f) => ({ code: f.code, label: lang === "ar" ? f.nameAr : f.nameEn }));
  }, [scope, categories, subcategories, fandoms, lang, categoryLabel]);

  const matches = useMemo(() => {
    if (!scopeValue) return [];
    return products.filter((p) => {
      if (group.productIds.includes(p.id)) return false;
      if (scope === "category")
        return p.categories.includes(scopeValue) || p.category === scopeValue;
      if (scope === "subcategory") return p.subcategories.includes(scopeValue);
      return p.fandoms.includes(scopeValue);
    });
  }, [products, scope, scopeValue, group.productIds]);

  return (
    <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
      {/* Title + order + delete */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1.5 block text-xs font-bold text-ink-2">
            {tr("dash.featuredTitleAr")}
          </span>
          <input
            value={ar}
            onChange={(e) => setAr(e.target.value)}
            maxLength={60}
            className="dash-input h-9"
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1.5 block text-xs font-bold text-ink-2">
            {tr("dash.featuredTitleEn")}
          </span>
          <input
            value={en}
            onChange={(e) => setEn(e.target.value)}
            maxLength={60}
            dir="ltr"
            className="dash-input h-9 text-start"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (!ar.trim() || !en.trim()) return;
            onRename(group.id, ar.trim(), en.trim());
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
          disabled={pending || !ar.trim() || !en.trim()}
          className="tap inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saved ? <Check size={14} /> : null}
          {saved ? tr("profile.saved") : tr("profile.save")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-bold text-brand">
          {items.length}
        </span>
        <button
          type="button"
          onClick={() => onMove(group.id, -1)}
          disabled={index === 0}
          aria-label={tr("dash.moveUp")}
          className="tap grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-30"
        >
          <span className="-rotate-90">
            <ChevronEnd size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => onMove(group.id, 1)}
          disabled={index === total - 1}
          aria-label={tr("dash.moveDown")}
          className="tap grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-30"
        >
          <span className="rotate-90">
            <ChevronEnd size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => (confirming ? onRemove(group.id) : setConfirming(true))}
          className={`tap ms-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition ${
            confirming
              ? "bg-red-500 text-white hover:opacity-90"
              : "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
          }`}
        >
          <Trash size={13} />
          {confirming ? tr("dash.confirmDelete") : tr("dash.deleteGroup")}
        </button>
      </div>

      {/* Where this rail's "show all" button sends the shopper */}
      <div className="mt-4 rounded-xl border border-line-2 bg-surface-2/40 p-3">
        <p className="text-xs font-bold text-ink-2">{tr("dash.linkLabel")}</p>
        <p className="mb-2 mt-0.5 text-[11px] leading-snug text-ink-3">{tr("dash.linkHint")}</p>
        <StoreFilterPicker
          scope={group.linkScope}
          values={group.linkValues}
          onChange={(next) => onSetLink(group.id, next)}
        />
      </div>

      {/* Bulk add into THIS section */}
      <div className="mt-4 rounded-xl border border-line-2 bg-surface-2/40 p-3">
        <p className="text-xs font-bold text-ink-2">{tr("dash.featuredBulk")}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setScopeValue("");
            }}
            aria-label={tr("dash.featuredBy")}
            className="dash-input h-9 cursor-pointer sm:w-40"
          >
            <option value="category">{tr("dash.byCategory")}</option>
            <option value="subcategory">{tr("dash.bySubcategory")}</option>
            <option value="fandom">{tr("dash.byFandom")}</option>
          </select>
          <select
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            aria-label={tr("dash.featuredPick")}
            className="dash-input h-9 flex-1 cursor-pointer"
          >
            <option value="">{tr("dash.featuredPickValue")}</option>
            {scopeOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              onBulkAdd(
                group.id,
                matches.map((p) => p.id),
              );
              setScopeValue("");
            }}
            disabled={pending || matches.length === 0}
            className="tap inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Star size={13} filled />
            {tr("dash.featuredAddAll")}
            {scopeValue && matches.length > 0 ? ` (${matches.length})` : ""}
          </button>
        </div>
        {scopeValue && matches.length === 0 && (
          <p className="mt-2 text-[11px] font-semibold text-ink-3">{tr("dash.featuredAllIn")}</p>
        )}
      </div>

      {/* Products in this section */}
      <p className="mb-2 mt-4 text-[11px] font-black uppercase tracking-wide text-ink-3">
        {tr("dash.groupProducts")}
      </p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-[12px] text-ink-3">
          {tr("dash.featuredEmptyHint")}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-line-2 bg-surface-2/40 p-2.5"
            >
              <span
                className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg text-lg"
                style={{ background: `color-mix(in srgb, ${p.color} 14%, var(--surface))` }}
              >
                {p.image ? (
                  <Image src={p.image} alt="" fill sizes="44px" className="object-cover" />
                ) : (
                  p.emoji || <Package size={16} className="text-ink-3" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-ink">
                  {lang === "ar" ? p.nameAr : p.nameEn}
                </span>
                <span className="text-[11px] font-semibold text-ink-3">
                  {formatPrice(lowestPrice(p), lang)}
                  {!p.isActive && ` · ${tr("dash.inactive")}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveProduct(group.id, p.id)}
                aria-label={tr("product.unfeature")}
                className="tap inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-ink-2 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500"
              >
                <Star size={14} filled className="text-amber-500" />
                {tr("dash.featuredRemove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
