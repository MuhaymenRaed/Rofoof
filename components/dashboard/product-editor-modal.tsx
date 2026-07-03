"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { X, Plus, Trash, Droplet } from "@/components/icons";
import { canBeWaterproof, type CategoryInfo, type FandomInfo, type Product } from "@/lib/products";
import {
  upsertProductAction,
  deleteProductAction,
  createCategoryAction,
  createFandomAction,
} from "@/lib/actions/products";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PALETTE = ["#e8321a", "#4caf50", "#00897b", "#e91e8c", "#7e57c2", "#f9a825"];
const MAX_IMAGES = 8;

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
 * Multi-image, multi-category (+ create new categories inline), discount %.
 */
export function ProductEditorModal({
  open,
  onClose,
  onSaved,
  product,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** pass a product to edit; omit to create */
  product?: Product | null;
}) {
  const { t, lang, categories: storeCategories, fandoms: storeFandoms } = useStore();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const isEdit = !!product;

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [stock, setStock] = useState("25");
  const [descAr, setDescAr] = useState("");
  const [descEn, setDescEn] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [extraCats, setExtraCats] = useState<CategoryInfo[]>([]);
  const [selectedFandoms, setSelectedFandoms] = useState<string[]>([]);
  const [extraFandoms, setExtraFandoms] = useState<FandomInfo[]>([]);
  const [waterproof, setWaterproof] = useState(false);
  const [existing, setExisting] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
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
    setNameAr(product?.nameAr ?? "");
    setNameEn(product?.nameEn ?? "");
    setPrice(product ? String(product.price) : "");
    setDiscount(String(product?.discountPercent ?? 0));
    setStock(String(product?.stock ?? 25));
    setDescAr(product?.descAr ?? "");
    setDescEn(product?.descEn ?? "");
    setSelectedCats(product?.categories?.length ? product.categories : []);
    setSelectedFandoms(product?.fandoms ?? []);
    setWaterproof(product?.waterproof ?? false);
    setExisting(product?.images ?? []);
    setNewFiles([]);
    setNewPreviews([]);
    setExtraCats([]);
    setExtraFandoms([]);
    setCatFormOpen(false);
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
  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    previewsRef.current = newPreviews;
  }, [newPreviews]);
  useEffect(() => () => previewsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (!open) return null;

  const allCats = [...storeCategories, ...extraCats];
  const allFandoms = [...storeFandoms, ...extraFandoms];
  const totalImages = existing.length + newFiles.length;
  const waterproofEligible = canBeWaterproof(selectedCats);

  function pickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = Math.max(0, MAX_IMAGES - totalImages);
    const accepted = picked.slice(0, room);
    setNewFiles((prev) => [...prev, ...accepted]);
    setNewPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
  }

  function removeExisting(i: number) {
    setExisting((prev) => prev.filter((_, idx) => idx !== i));
  }
  function removeNew(i: number) {
    setNewPreviews((prev) => {
      const url = prev[i];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, idx) => idx !== i);
    });
    setNewFiles((prev) => prev.filter((_, idx) => idx !== i));
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameAr.trim() || !price || selectedCats.length === 0) {
      if (selectedCats.length === 0) setError(t("dash.categoriesHint"));
      return;
    }
    setError(null);
    const id = product?.id ?? slugify(nameEn || nameAr, performance.now() | 0);

    startTransition(async () => {
      const urls = [...existing];

      if (newFiles.length > 0) {
        setUploading(true);
        for (let i = 0; i < newFiles.length; i++) {
          const f = newFiles[i];
          const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${id}/${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("product-images")
            .upload(path, f, { upsert: true, contentType: f.type });
          if (upErr) {
            setUploading(false);
            setError(upErr.message);
            return;
          }
          urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
        }
        setUploading(false);
      }

      const res = await upsertProductAction({
        id,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || nameAr.trim(),
        price: Number(price),
        discountPercent: Math.min(90, Math.max(0, Number(discount) || 0)),
        stock: Math.max(0, Number(stock) || 0),
        descAr: descAr.trim(),
        descEn: descEn.trim(),
        images: urls,
        color: product?.color ?? PALETTE[Math.abs((nameAr.length + nameEn.length) % PALETTE.length)],
        categories: selectedCats,
        fandoms: selectedFandoms,
        waterproof: waterproofEligible && waterproof,
        isUpdate: isEdit,
      });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      onSaved?.();
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

        {/* Body (scrolls) */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Images */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("dash.image")}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={pickImages}
              className="hidden"
            />
            <div className="grid grid-cols-4 gap-2">
              {existing.map((src, i) => (
                <ImageTile
                  key={src}
                  src={src}
                  isCover={i === 0}
                  coverLabel={t("dash.cover")}
                  onRemove={() => removeExisting(i)}
                />
              ))}
              {newPreviews.map((src, i) => (
                <ImageTile
                  key={src}
                  src={src}
                  unoptimized
                  isCover={existing.length === 0 && i === 0}
                  coverLabel={t("dash.cover")}
                  onRemove={() => removeNew(i)}
                />
              ))}
              {totalImages < MAX_IMAGES && (
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
              <input
                type="number"
                min={0}
                max={90}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="dash-input"
              />
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

          {/* Fandoms (optional, multi) */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.fieldFandoms")}
            </span>
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
                  {fanPending ? "…" : t("dash.addFandom")}
                </button>
              </div>
            )}
          </div>

          {/* Waterproof — only offered for stickers / posters */}
          {waterproofEligible && (
            <div className="flex items-center justify-between rounded-xl border border-line-2 bg-surface-2/50 px-4 py-3">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Droplet size={16} className="text-brand" />
                {t("dash.waterproofOption")}
                <span className="text-[10px] font-medium text-ink-3">{t("dash.waterproofHint")}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={waterproof}
                onClick={() => setWaterproof((v) => !v)}
                className={`tap relative h-6 w-11 shrink-0 rounded-full transition ${
                  waterproof ? "bg-brand" : "bg-surface-3"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    waterproof ? "start-[22px]" : "start-0.5"
                  }`}
                />
              </button>
            </div>
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

function ImageTile({
  src,
  isCover,
  coverLabel,
  onRemove,
  unoptimized,
}: {
  src: string;
  isCover: boolean;
  coverLabel: string;
  onRemove: () => void;
  unoptimized?: boolean;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-line-2">
      <Image src={src} alt="" fill sizes="96px" unoptimized={unoptimized} className="object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="remove"
        className="tap absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500"
      >
        <X size={12} />
      </button>
      {isCover && (
        <span className="absolute bottom-1 start-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
          {coverLabel}
        </span>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-2">{label}</span>
      {children}
    </label>
  );
}
