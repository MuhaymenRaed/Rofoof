"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { X, Plus, Trash, Droplet, Photo, Cube } from "@/components/icons";
import {
  canBeWaterproof,
  type CategoryInfo,
  type FandomInfo,
  type Product,
  type ProductKind,
  type SubcategoryInfo,
} from "@/lib/products";
import {
  upsertProductAction,
  deleteProductAction,
  createCategoryAction,
  createFandomAction,
  createSubcategoryAction,
  deleteSubcategoryAction,
} from "@/lib/actions/products";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toWebp } from "@/lib/webp";
import type { DictKey } from "@/lib/i18n";

const PALETTE = ["#e8321a", "#4caf50", "#00897b", "#e91e8c", "#7e57c2", "#f9a825"];

/** Per-category image caps — sticker packs carry many designs, posters fewer. */
function imageCapFor(categoryCodes: string[]): number {
  if (categoryCodes.includes("stickers")) return 120;
  if (categoryCodes.includes("posters")) return 50;
  return 100;
}

const KINDS: { id: ProductKind; key: DictKey }[] = [
  { id: "standard", key: "dash.kind.standard" },
  { id: "package", key: "dash.kind.package" },
  { id: "tiered", key: "dash.kind.tiered" },
];

const DEFAULT_TIERS = [
  { minQty: "1", unitPrice: "4000" },
  { minQty: "2", unitPrice: "3500" },
  { minQty: "3", unitPrice: "3250" },
  { minQty: "4", unitPrice: "3000" },
];

/**
 * One image slot in the editor. For package products each slot IS a
 * selectable item with its own optional price; for other kinds it's just a
 * gallery image. Existing slots carry `id` (item) / `url`; new ones carry
 * `file` + `preview`.
 */
interface ImageRow {
  itemId?: string;
  url?: string;
  file?: File;
  preview?: string;
  price: string;
}

function slugify(input: string, seed: number) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const suffix = seed.toString(36).slice(-4);
  return `${base || "product"}-${suffix}`;
}

/**
 * Admin product editor — create or edit (full CRUD incl. soft delete).
 * Kind-aware: package (per-item prices), tiered (volume ladder), standard.
 */
export function ProductEditorModal({
  open,
  onClose,
  onSaved,
  product,
}: {
  open: boolean;
  onClose: () => void;
  /** called after a successful save; on CREATE it receives the new product so
   *  the caller can show it optimistically. */
  onSaved?: (created?: Product) => void;
  /** pass a product to edit; omit to create */
  product?: Product | null;
}) {
  const {
    t,
    lang,
    categories: storeCategories,
    subcategories: storeSubcategories,
    fandoms: storeFandoms,
  } = useStore();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const isEdit = !!product;

  const [kind, setKind] = useState<ProductKind>("standard");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discountFixed, setDiscountFixed] = useState("0");
  /** percent vs a flat IQD amount off — the admin picks one */
  const [discountMode, setDiscountMode] = useState<"percent" | "fixed">("percent");
  const [volumePriced, setVolumePriced] = useState(false);
  const [stock, setStock] = useState("25");
  const [descAr, setDescAr] = useState("");
  const [descEn, setDescEn] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [extraCats, setExtraCats] = useState<CategoryInfo[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [extraSubs, setExtraSubs] = useState<SubcategoryInfo[]>([]);
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [subParent, setSubParent] = useState("");
  const [subNameAr, setSubNameAr] = useState("");
  const [subNameEn, setSubNameEn] = useState("");
  const [subPending, setSubPending] = useState(false);
  const [selectedFandoms, setSelectedFandoms] = useState<string[]>([]);
  const [extraFandoms, setExtraFandoms] = useState<FandomInfo[]>([]);
  const [waterproof, setWaterproof] = useState(false);
  const [surcharge, setSurcharge] = useState("0");
  const [allowCustom, setAllowCustom] = useState(false);
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catNameAr, setCatNameAr] = useState("");
  const [catNameEn, setCatNameEn] = useState("");
  const [catPending, setCatPending] = useState(false);
  const [fanFormOpen, setFanFormOpen] = useState(false);
  const [fanNameAr, setFanNameAr] = useState("");
  const [fanNameEn, setFanNameEn] = useState("");
  const [fanPending, setFanPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Seed the form from the product (or reset for create) each time it opens.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setKind(product?.kind ?? "standard");
    setNameAr(product?.nameAr ?? "");
    setNameEn(product?.nameEn ?? "");
    setPrice(product ? String(product.price) : "");
    setDiscount(String(product?.discountPercent ?? 0));
    setDiscountFixed(String(product?.discountFixed ?? 0));
    setDiscountMode((product?.discountFixed ?? 0) > 0 ? "fixed" : "percent");
    setVolumePriced(product?.volumePriced ?? false);
    setStock(String(product?.stock ?? 25));
    setDescAr(product?.descAr ?? "");
    setDescEn(product?.descEn ?? "");
    setSelectedCats(product?.categories?.length ? product.categories : []);
    setSelectedSubs(product?.subcategories ?? []);
    setSelectedFandoms(product?.fandoms ?? []);
    setWaterproof(product?.waterproof ?? false);
    setSurcharge(String(product?.waterproofSurcharge ?? 0));
    setAllowCustom(product?.allowCustomImage ?? false);
    // Package products: slots come from their items (each has its own price);
    // others: from the plain image gallery.
    if (product?.kind === "package" && product.items.length > 0) {
      setRows(
        product.items.map((it) => ({
          itemId: it.id,
          url: it.imageUrl,
          price: it.price === null ? "" : String(it.price),
        })),
      );
    } else {
      setRows((product?.images ?? []).map((url) => ({ url, price: "" })));
    }
    setTiers(
      product?.tiers?.length
        ? product.tiers.map((tr) => ({ minQty: String(tr.minQty), unitPrice: String(tr.unitPrice) }))
        : DEFAULT_TIERS,
    );
    setBulkPrice("");
    setExtraCats([]);
    setExtraSubs([]);
    setExtraFandoms([]);
    setCatFormOpen(false);
    setSubFormOpen(false);
    setFanFormOpen(false);
    setConfirmingDelete(false);
    setError(null);
  }, [open, product]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // revoke object URLs on unmount
  const rowsRef = useRef<ImageRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(
    () => () =>
      rowsRef.current.forEach((r) => {
        if (r.preview) URL.revokeObjectURL(r.preview);
      }),
    [],
  );

  if (!open) return null;

  const allCats = [...storeCategories, ...extraCats];
  const allFandoms = [...storeFandoms, ...extraFandoms];
  // Only subcategories belonging to the categories this product is in.
  const allSubs = [...storeSubcategories, ...extraSubs];
  const visibleSubs = allSubs.filter((s) => selectedCats.includes(s.categoryCode));
  const waterproofEligible = canBeWaterproof(selectedCats);
  const customEligible = selectedCats.includes("posters");
  const isPackage = kind === "package";
  const isTiered = kind === "tiered";
  const maxImages = imageCapFor(selectedCats);

  function pickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = Math.max(0, maxImages - rows.length);
    const accepted = picked.slice(0, room);
    setRows((prev) => [
      ...prev,
      ...accepted.map((f) => ({ file: f, preview: URL.createObjectURL(f), price: "" })),
    ]);
    e.target.value = "";
  }

  function removeRow(i: number) {
    setRows((prev) => {
      const r = prev[i];
      if (r?.preview) URL.revokeObjectURL(r.preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function setRowPrice(i: number, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, price: value } : r)));
  }

  /** Bulk-apply one price to every image/item slot at once. */
  function applyBulkPrice() {
    const v = bulkPrice.trim();
    if (v === "") return;
    setRows((prev) => prev.map((r) => ({ ...r, price: v })));
  }

  function toggleCat(code: string) {
    setSelectedCats((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function toggleFandom(code: string) {
    setSelectedFandoms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function toggleSub(code: string) {
    setSelectedSubs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function addSubcategory() {
    const parent = subParent || selectedCats[0];
    if (!parent || !subNameAr.trim() || !subNameEn.trim()) return;
    setSubPending(true);
    const res = await createSubcategoryAction({
      categoryCode: parent,
      nameAr: subNameAr.trim(),
      nameEn: subNameEn.trim(),
    });
    setSubPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setExtraSubs((prev) =>
      prev.some((s) => s.code === res.subcategory.code) ? prev : [...prev, res.subcategory],
    );
    setSelectedSubs((prev) =>
      prev.includes(res.subcategory.code) ? prev : [...prev, res.subcategory.code],
    );
    setSubNameAr("");
    setSubNameEn("");
    setSubFormOpen(false);
  }

  async function removeSubcategory(code: string) {
    setExtraSubs((prev) => prev.filter((s) => s.code !== code));
    setSelectedSubs((prev) => prev.filter((c) => c !== code));
    const res = await deleteSubcategoryAction(code);
    if (!res.ok) setError(res.error ?? t("checkout.error"));
    else router.refresh();
  }

  async function addFandom() {
    if (!fanNameAr.trim() || !fanNameEn.trim()) return;
    setFanPending(true);
    const res = await createFandomAction({ nameAr: fanNameAr.trim(), nameEn: fanNameEn.trim() });
    setFanPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setExtraFandoms((prev) =>
      prev.some((f) => f.code === res.fandom.code) ? prev : [...prev, res.fandom],
    );
    setSelectedFandoms((prev) =>
      prev.includes(res.fandom.code) ? prev : [...prev, res.fandom.code],
    );
    setFanNameAr("");
    setFanNameEn("");
    setFanFormOpen(false);
  }

  async function addCategory() {
    if (!catNameAr.trim() || !catNameEn.trim()) return;
    setCatPending(true);
    const res = await createCategoryAction({ nameAr: catNameAr.trim(), nameEn: catNameEn.trim() });
    setCatPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setExtraCats((prev) =>
      prev.some((c) => c.code === res.category.code) ? prev : [...prev, res.category],
    );
    setSelectedCats((prev) =>
      prev.includes(res.category.code) ? prev : [...prev, res.category.code],
    );
    setCatNameAr("");
    setCatNameEn("");
    setCatFormOpen(false);
  }

  function setTier(i: number, field: "minQty" | "unitPrice", value: string) {
    setTiers((prev) => prev.map((tr, idx) => (idx === i ? { ...tr, [field]: value } : tr)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameAr.trim() || !price || selectedCats.length === 0) {
      if (selectedCats.length === 0) setError(t("dash.categoriesHint"));
      return;
    }
    setError(null);
    const id = product?.id ?? slugify(nameEn || nameAr, performance.now() | 0);

    startTransition(async () => {
      // upload new files to product-images/<id>/…
      const finalRows: { itemId?: string; url: string; price: string }[] = [];
      const toUpload = rows.filter((r) => r.file);
      if (toUpload.length > 0) setUploading(true);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.url) {
          finalRows.push({ itemId: r.itemId, url: r.url, price: r.price });
          continue;
        }
        if (!r.file) continue;
        // Re-encode to WebP in the browser (handles PNG/JPEG and iPhone
        // HEIC/HEIF) so the bucket only ever stores compact files.
        const webp = await toWebp(r.file);
        const path = `${id}/${Date.now()}-${i}.${webp.ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, webp.blob, { upsert: true, contentType: webp.contentType });
        if (upErr) {
          setUploading(false);
          setError(upErr.message);
          return;
        }
        finalRows.push({
          url: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl,
          price: r.price,
        });
      }
      setUploading(false);

      const priceNum = Number(price);
      // Only one discount mode is stored; the other is zeroed out.
      const discountNum =
        discountMode === "percent" ? Math.min(90, Math.max(0, Number(discount) || 0)) : 0;
      const discountFixedNum =
        discountMode === "fixed" ? Math.max(0, Number(discountFixed) || 0) : 0;
      const stockNum = Math.max(0, Number(stock) || 0);
      const surchargeNum = waterproofEligible ? Math.max(0, Number(surcharge) || 0) : 0;
      const isWaterproof = waterproofEligible ? waterproof : false;
      const allowsCustom = customEligible ? allowCustom : false;
      const color =
        product?.color ?? PALETTE[Math.abs((nameAr.length + nameEn.length) % PALETTE.length)];
      const itemsPayload = isPackage
        ? finalRows.map((r) => ({
            id: r.itemId,
            imageUrl: r.url,
            price: r.price.trim() === "" ? null : Math.max(0, Number(r.price) || 0),
          }))
        : [];
      const tiersPayload = isTiered
        ? tiers
            .map((tr) => ({
              minQty: Math.max(1, Number(tr.minQty) || 1),
              unitPrice: Math.max(0, Number(tr.unitPrice) || 0),
            }))
            .filter((tr, idx, arr) => arr.findIndex((x) => x.minQty === tr.minQty) === idx)
        : [];

      const res = await upsertProductAction({
        id,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || nameAr.trim(),
        price: priceNum,
        discountPercent: discountNum,
        discountFixed: discountFixedNum,
        volumePriced,
        stock: stockNum,
        descAr: descAr.trim(),
        descEn: descEn.trim(),
        images: finalRows.map((r) => r.url),
        color,
        categories: selectedCats,
        // drop any subcategory whose parent category was unselected
        subcategories: selectedSubs.filter((c) =>
          visibleSubs.some((s) => s.code === c),
        ),
        fandoms: selectedFandoms,
        waterproof: isWaterproof,
        waterproofSurcharge: surchargeNum,
        allowCustomImage: allowsCustom,
        kind,
        items: itemsPayload,
        tiers: tiersPayload,
        isUpdate: isEdit,
      });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }

      // Optimistic create: hand back a fully-built product so the list can show
      // it instantly; router.refresh() then reconciles with the DB.
      if (!isEdit) {
        const created: Product = {
          id,
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || nameAr.trim(),
          subAr: "",
          subEn: "",
          price: priceNum,
          emoji: "🛍️",
          image: finalRows[0]?.url,
          images: finalRows.map((r) => r.url),
          color,
          category: selectedCats[0] ?? "",
          categories: selectedCats,
          subcategories: selectedSubs.filter((c) => visibleSubs.some((s) => s.code === c)),
          fandoms: selectedFandoms,
          waterproof: isWaterproof,
          waterproofSurcharge: surchargeNum,
          allowCustomImage: allowsCustom,
          kind,
          items: itemsPayload.map((it) => ({
            id: it.id ?? crypto.randomUUID(),
            imageUrl: it.imageUrl,
            nameAr: "",
            nameEn: "",
            price: it.price,
          })),
          tiers: tiersPayload,
          soldOut: false,
          isActive: true,
          stock: stockNum,
          discountPercent: discountNum,
          discountFixed: discountFixedNum,
          volumePriced,
          order: Date.now(),
          descAr: descAr.trim(),
          descEn: descEn.trim(),
          tags: [],
        };
        onSaved?.(created);
      } else {
        onSaved?.();
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!product) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteProductAction(product.id);
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      onSaved?.();
      router.refresh();
      onClose();
    });
  }

  const content = (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <form
        onSubmit={submit}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line-2 px-6 py-4">
          <h2 className="text-lg font-black text-ink">
            {isEdit ? t("dash.editProduct") : t("dash.newProduct")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("aria.close")}
            className="tap grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Kind — drives the rest of the form */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("dash.kind")}</span>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className={`tap rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                    kind === k.id
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                  }`}
                >
                  {t(k.key)}
                </button>
              ))}
            </div>
          </div>

          {/* Global by-count pricing (shared ladder across packages/categories) */}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line-2 bg-surface-2/40 p-3">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Cube size={16} className="text-brand" />
                {t("dash.volumePriced")}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">
                {t("dash.volumePricedHint")}
              </span>
            </span>
            <input
              type="checkbox"
              checked={volumePriced}
              onChange={(e) => setVolumePriced(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-brand"
            />
          </label>

          {/* Images / package items */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.image")}
              <span className="ms-2 font-semibold text-ink-3">
                {rows.length}/{maxImages}
              </span>
            </span>
            {isPackage && <p className="mb-2 text-[11px] text-ink-3">{t("dash.packageHint")}</p>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={pickImages}
              className="hidden"
            />
            <div className={`grid gap-2 ${isPackage ? "grid-cols-3" : "grid-cols-4"}`}>
              {rows.map((r, i) => (
                <div key={r.itemId ?? r.url ?? r.preview ?? i} className="space-y-1">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-line-2">
                    <Image
                      src={r.url ?? r.preview ?? ""}
                      alt=""
                      fill
                      sizes="96px"
                      unoptimized={!!r.preview}
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label={t("dash.cancel")}
                      className="tap absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500"
                    >
                      <X size={12} />
                    </button>
                    {i === 0 && !isPackage && (
                      <span className="absolute bottom-1 start-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {t("dash.cover")}
                      </span>
                    )}
                  </div>
                  {isPackage && (
                    <input
                      type="number"
                      min={0}
                      value={r.price}
                      onChange={(e) => setRowPrice(i, e.target.value)}
                      placeholder={price || t("dash.itemPrice")}
                      aria-label={t("dash.itemPrice")}
                      className="dash-input h-8 px-2 text-center text-xs"
                    />
                  )}
                </div>
              ))}
              {rows.length < maxImages && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label={t("dash.uploadImage")}
                  className="tap grid aspect-square place-items-center rounded-xl border border-dashed border-line bg-surface-2 text-ink-3 transition hover:border-brand hover:text-brand"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
            {/* Bulk price: type once, apply to every image/item at once */}
            {isPackage && rows.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  placeholder={t("dash.bulkPrice")}
                  aria-label={t("dash.bulkPrice")}
                  className="dash-input h-9 flex-1"
                />
                <button
                  type="button"
                  onClick={applyBulkPrice}
                  disabled={bulkPrice.trim() === ""}
                  className="tap shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {t("dash.applyToAll")}
                </button>
              </div>
            )}
          </div>

          {/* Names */}
          <Field label={t("dash.fieldNameAr")}>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="dash-input" required />
          </Field>
          <Field label={t("dash.fieldNameEn")}>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              dir="ltr"
              className="dash-input text-start"
            />
          </Field>

          {/* Price / discount / stock */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("dash.fieldPrice")}>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="dash-input"
                required
              />
            </Field>
            <Field label={t("dash.fieldDiscount")}>
              {/* percent OR a flat IQD amount off */}
              <div className="mb-1 flex gap-1">
                {(["percent", "fixed"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDiscountMode(m)}
                    aria-pressed={discountMode === m}
                    className={`tap flex-1 rounded-lg border py-1 text-[10px] font-bold transition ${
                      discountMode === m
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                    }`}
                  >
                    {m === "percent" ? "%" : t("dash.fixedAmount")}
                  </button>
                ))}
              </div>
              {discountMode === "percent" ? (
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="dash-input"
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  value={discountFixed}
                  onChange={(e) => setDiscountFixed(e.target.value)}
                  className="dash-input"
                />
              )}
            </Field>
            <Field label={t("dash.fieldStock")}>
              <input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="dash-input"
              />
            </Field>
          </div>

          {/* Tiered: volume price ladder */}
          {isTiered && (
            <div>
              <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("dash.tiers")}</span>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-[10px] font-bold text-ink-3">
                  <span>{t("dash.tierMinQty")}</span>
                  <span>{t("dash.tierPrice")}</span>
                  <span />
                </div>
                {tiers.map((tr, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={tr.minQty}
                      onChange={(e) => setTier(i, "minQty", e.target.value)}
                      aria-label={t("dash.tierMinQty")}
                      className="dash-input h-9"
                    />
                    <input
                      type="number"
                      min={0}
                      value={tr.unitPrice}
                      onChange={(e) => setTier(i, "unitPrice", e.target.value)}
                      aria-label={t("dash.tierPrice")}
                      className="dash-input h-9"
                    />
                    <button
                      type="button"
                      onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={t("offer.delete")}
                      className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
                {tiers.length < 10 && (
                  <button
                    type="button"
                    onClick={() =>
                      setTiers((prev) => [...prev, { minQty: String(prev.length + 1), unitPrice: "" }])
                    }
                    className="tap inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-1.5 text-xs font-bold text-ink-3 transition hover:border-brand hover:text-brand"
                  >
                    <Plus size={13} />
                    {t("dash.addTier")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Descriptions */}
          <Field label={t("dash.fieldDescAr")}>
            <textarea
              value={descAr}
              onChange={(e) => setDescAr(e.target.value)}
              rows={2}
              className="dash-input h-auto resize-none py-2.5"
            />
          </Field>
          <Field label={t("dash.fieldDescEn")}>
            <textarea
              value={descEn}
              onChange={(e) => setDescEn(e.target.value)}
              rows={2}
              dir="ltr"
              className="dash-input h-auto resize-none py-2.5 text-start"
            />
          </Field>

          {/* Categories (multi) */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.fieldCategories")}
              <span className="ms-2 font-semibold text-ink-3">{t("dash.categoriesHint")}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {allCats.map((c) => {
                const on = selectedCats.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCat(c.code)}
                    aria-pressed={on}
                    className={`tap rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                    }`}
                  >
                    {lang === "ar" ? c.nameAr : c.nameEn}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCatFormOpen((v) => !v)}
                className="tap inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-1.5 text-xs font-bold text-ink-3 transition hover:border-brand hover:text-brand"
              >
                <Plus size={13} />
                {t("dash.newCategory")}
              </button>
            </div>
            {catFormOpen && (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line-2 bg-surface-2/50 p-3 sm:flex-row">
                <input
                  value={catNameAr}
                  onChange={(e) => setCatNameAr(e.target.value)}
                  placeholder={t("dash.catNameAr")}
                  className="dash-input h-9 flex-1"
                />
                <input
                  value={catNameEn}
                  onChange={(e) => setCatNameEn(e.target.value)}
                  placeholder={t("dash.catNameEn")}
                  dir="ltr"
                  className="dash-input h-9 flex-1 text-start"
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={catPending || !catNameAr.trim() || !catNameEn.trim()}
                  className="tap shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {catPending ? "…" : t("dash.addCategory")}
                </button>
              </div>
            )}
          </div>

          {/* Subcategories — second level, nested under the chosen categories */}
          {selectedCats.length > 0 && (
            <div>
              <span className="mb-1.5 block text-xs font-bold text-ink-2">
                {t("dash.fieldSubcategories")}
                <span className="ms-2 font-semibold text-ink-3">
                  {t("dash.subcategoriesHint")}
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                {visibleSubs.map((s) => {
                  const on = selectedSubs.includes(s.code);
                  return (
                    <span
                      key={s.code}
                      className={`inline-flex items-center gap-1 rounded-xl border py-1.5 pe-1 ps-3 text-xs font-bold transition ${
                        on
                          ? "border-brand bg-brand text-white"
                          : "border-line bg-surface text-ink-2"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSub(s.code)}
                        aria-pressed={on}
                        className="tap"
                      >
                        {lang === "ar" ? s.nameAr : s.nameEn}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubcategory(s.code)}
                        aria-label={t("offer.delete")}
                        className="tap grid h-5 w-5 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setSubParent((v) => v || selectedCats[0]);
                    setSubFormOpen((v) => !v);
                  }}
                  className="tap inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-1.5 text-xs font-bold text-ink-3 transition hover:border-brand hover:text-brand"
                >
                  <Plus size={13} />
                  {t("dash.newSubcategory")}
                </button>
              </div>
              {subFormOpen && (
                <div className="mt-2 space-y-2 rounded-xl border border-line-2 bg-surface-2/50 p-3">
                  <select
                    value={subParent}
                    onChange={(e) => setSubParent(e.target.value)}
                    aria-label={t("dash.fieldCategories")}
                    className="dash-input h-9 cursor-pointer"
                  >
                    {selectedCats.map((code) => {
                      const c = allCats.find((x) => x.code === code);
                      return (
                        <option key={code} value={code}>
                          {c ? (lang === "ar" ? c.nameAr : c.nameEn) : code}
                        </option>
                      );
                    })}
                  </select>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={subNameAr}
                      onChange={(e) => setSubNameAr(e.target.value)}
                      placeholder={t("dash.catNameAr")}
                      className="dash-input h-9 flex-1"
                    />
                    <input
                      value={subNameEn}
                      onChange={(e) => setSubNameEn(e.target.value)}
                      placeholder={t("dash.catNameEn")}
                      dir="ltr"
                      className="dash-input h-9 flex-1 text-start"
                    />
                    <button
                      type="button"
                      onClick={addSubcategory}
                      disabled={subPending || !subNameAr.trim() || !subNameEn.trim()}
                      className="tap shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {subPending ? "…" : t("dash.addCategory")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fandoms (multi, optional) */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("fandom.label")}</span>
            <div className="flex flex-wrap gap-2">
              {allFandoms.map((f) => {
                const on = selectedFandoms.includes(f.code);
                return (
                  <button
                    key={f.code}
                    type="button"
                    onClick={() => toggleFandom(f.code)}
                    aria-pressed={on}
                    className={`tap rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                    }`}
                  >
                    {lang === "ar" ? f.nameAr : f.nameEn}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setFanFormOpen((v) => !v)}
                className="tap inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-1.5 text-xs font-bold text-ink-3 transition hover:border-brand hover:text-brand"
              >
                <Plus size={13} />
                {t("dash.newFandom")}
              </button>
            </div>
            {fanFormOpen && (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line-2 bg-surface-2/50 p-3 sm:flex-row">
                <input
                  value={fanNameAr}
                  onChange={(e) => setFanNameAr(e.target.value)}
                  placeholder={t("dash.catNameAr")}
                  className="dash-input h-9 flex-1"
                />
                <input
                  value={fanNameEn}
                  onChange={(e) => setFanNameEn(e.target.value)}
                  placeholder={t("dash.catNameEn")}
                  dir="ltr"
                  className="dash-input h-9 flex-1 text-start"
                />
                <button
                  type="button"
                  onClick={addFandom}
                  disabled={fanPending || !fanNameAr.trim() || !fanNameEn.trim()}
                  className="tap shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {fanPending ? "…" : t("dash.addCategory")}
                </button>
              </div>
            )}
          </div>

          {/* Waterproof variant (stickers/posters) */}
          {waterproofEligible && (
            <div className="space-y-2 rounded-xl border border-line-2 bg-surface-2/40 p-3">
              <label className="flex cursor-pointer items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <Droplet size={16} className="text-brand" />
                  {t("badge.waterproof")}
                </span>
                <input
                  type="checkbox"
                  checked={waterproof}
                  onChange={(e) => setWaterproof(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
              </label>
              {waterproof && (
                <Field label={t("dash.surcharge")}>
                  <input
                    type="number"
                    min={0}
                    value={surcharge}
                    onChange={(e) => setSurcharge(e.target.value)}
                    className="dash-input h-9"
                  />
                </Field>
              )}
            </div>
          )}

          {/* Custom artwork (posters) */}
          {customEligible && (
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line-2 bg-surface-2/40 p-3">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Photo size={16} className="text-brand" />
                {t("dash.allowCustom")}
              </span>
              <input
                type="checkbox"
                checked={allowCustom}
                onChange={(e) => setAllowCustom(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
            </label>
          )}

          {error && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line-2 px-6 py-4">
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className={`tap inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                confirmingDelete
                  ? "bg-red-500 text-white hover:opacity-90"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
              }`}
            >
              <Trash size={15} />
              {confirmingDelete ? t("dash.confirmDelete") : t("dash.deleteProduct")}
            </button>
          )}
          <div className="ms-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="tap rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-ink-2 transition hover:bg-surface-2"
            >
              {t("dash.cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="tap rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {uploading
                ? t("dash.uploading")
                : pending
                  ? t("checkout.placing")
                  : isEdit
                    ? t("dash.saveChanges")
                    : t("dash.save")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  if (typeof document === "undefined") return null;
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
