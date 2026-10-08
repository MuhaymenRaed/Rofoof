"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { RetryImage } from "@/components/ui/retry-image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import {
  X,
  Plus,
  Trash,
  Droplet,
  Photo,
  Cube,
  Star,
  Package,
  Printer,
  Download,
} from "@/components/icons";
import {
  canBeWaterproof,
  isSpecialCardImage,
  printImageFor,
  splitCategoryGroups,
  PRINT_FILE_COLOR,
  type CategoryGroup,
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
  getProductPrintImagesAction,
} from "@/lib/actions/products";
import { setProductGroupsAction } from "@/lib/actions/featured";
import { updateVolumeTiersAction } from "@/lib/actions/offers";
import { toWebpVariants, DISPLAY_MAX_DIMENSION, MAX_DIMENSION } from "@/lib/webp";
import { uploadImagePair } from "@/lib/upload-image";
import { downloadImagesAsZip } from "@/lib/zip";
import type { DictKey } from "@/lib/i18n";

const PALETTE = ["#e8321a", "#4caf50", "#00897b", "#e91e8c", "#7e57c2", "#f9a825"];

/** Per-category image caps — sticker packs carry many designs, posters fewer. */
function imageCapFor(categoryCodes: string[]): number {
  if (categoryCodes.includes("stickers")) return 120;
  if (categoryCodes.includes("posters")) return 50;
  return 100;
}

// Two product shapes. "By-count" pricing is NOT a third type — it's the
// inline `volume_priced` option below, available on both of these.
const KINDS: { id: ProductKind; key: DictKey }[] = [
  { id: "standard", key: "dash.kind.standard" },
  { id: "package", key: "dash.kind.package" },
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
 *
 * A slot is a PAIR: the photo the shopper sees, and the print master that photo
 * is produced from (`print*`). They are uploaded, removed and reordered
 * together, which is what keeps the two stored arrays index-aligned — see
 * Product.printImages.
 */
interface ImageRow {
  /**
   * Stable local identity, assigned when the slot appears and never reused.
   *
   * The chosen cover is remembered by this and not by index or URL: indices
   * shift the moment a slot is removed, and a slot that is still an unuploaded
   * File has no URL to be remembered by.
   */
  key: string;
  itemId?: string;
  url?: string;
  file?: File;
  preview?: string;
  /** the stored print master for this photo, when it has one */
  printUrl?: string;
  /** a print master picked in this session, not yet uploaded */
  printFile?: File;
  printPreview?: string;
  price: string;
  /** units left of this design (package products only); "" → inherits 0 */
  stock: string;
  /**
   * `stock` as it was when the editor opened — undefined for a design that
   * doesn't exist yet. A row whose stock still equals this is NOT written on
   * save: stock is a live number the orders board moves underneath this form,
   * and writing back whatever was loaded quietly undid every acceptance since.
   * See upsertProductAction.
   */
  initialStock?: string;
}

/** A fresh slot identity. `crypto.randomUUID` is available in every browser
 *  this dashboard runs in, and these never leave the component. */
function rowKey(): string {
  return crypto.randomUUID();
}

/** The URL to render for a slot's photo, or its print master. */
function rowSrc(r: ImageRow): string {
  return r.url ?? r.preview ?? "";
}

function printSrc(r: ImageRow): string {
  return r.printUrl ?? r.printPreview ?? "";
}

function hasPrint(r: ImageRow): boolean {
  return !!(r.printUrl || r.printPreview);
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
  onDeleted,
  product,
}: {
  open: boolean;
  onClose: () => void;
  /** called after a successful save; on CREATE it receives the new product so
   *  the caller can show it optimistically. */
  onSaved?: (created?: Product) => void;
  /** called with the product id when it's deleted — remove it optimistically */
  onDeleted?: (id: string) => void;
  /** pass a product to edit; omit to create */
  product?: Product | null;
}) {
  const {
    t,
    lang,
    categories: storeCategories,
    subcategories: storeSubcategories,
    fandoms: storeFandoms,
    volumeTiers: storeVolumeTiers,
    featuredGroups: storeFeaturedGroups,
  } = useStore();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const printFileRef = useRef<HTMLInputElement>(null);
  const cardFileRef = useRef<HTMLInputElement>(null);

  const isEdit = !!product;
  /**
   * The id of a product this modal CREATED, once it exists in the database.
   *
   * Set the moment the insert succeeds, and it turns every later save in the
   * same sitting into an update. Without it, a save that got as far as creating
   * the row and then stopped — a failed showcase-group write, a print-files
   * column that is not there yet — left the admin looking at a filled-in form
   * whose Save button would insert a SECOND product, under a second generated
   * id, every time they pressed it.
   */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [kind, setKind] = useState<ProductKind>("standard");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discountFixed, setDiscountFixed] = useState("0");
  /** percent vs a flat IQD amount off — the admin picks one */
  const [discountMode, setDiscountMode] = useState<"percent" | "fixed">("percent");
  const [volumePriced, setVolumePriced] = useState(false);
  // The shared by-count ladder (global, not per product) — edited here so the
  // admin can tune it right where they turn volume pricing on.
  const [volTiers, setVolTiers] = useState<{ minQty: string; unitPrice: string }[]>([]);
  const [volSaving, setVolSaving] = useState(false);
  const [volSaved, setVolSaved] = useState(false);
  const [stock, setStock] = useState("25");
  // Same rule as ImageRow.initialStock, for a plain product's own count.
  const [initialStock, setInitialStock] = useState<string | null>(null);
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
  /** home-page showcase rails this product belongs to */
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [rows, setRows] = useState<ImageRow[]>([]);
  /**
   * Which slot is the thumbnail, by `ImageRow.key`. null means "the first one",
   * which is both the old behaviour and the right answer for a brand-new
   * product whose photos are still being added.
   */
  const [coverKey, setCoverKey] = useState<string | null>(null);
  /**
   * An image uploaded for the product CARD alone, overriding the starred photo.
   *
   * null means "no special image" — the card then shows the starred photo, or
   * the first one. It is never added to `images`, so it stays out of the
   * gallery and the lightbox: its whole job is to be the one picture that sells
   * the product in a list.
   */
  const [cardImage, setCardImage] = useState<{
    url?: string;
    file?: File;
    preview?: string;
  } | null>(null);
  /** the slot a print-file pick is destined for, by key */
  const [printTarget, setPrintTarget] = useState<string | null>(null);
  /**
   * Whether this form knows the product's stored print masters yet.
   *
   * It is NOT decorative: `printImages` is only sent on save once this is true,
   * because "I don't know" and "there are none" must not be the same message to
   * the server. The editor opens over the dashboard inventory (which carries
   * the masters) and over the store page (whose products come from the public
   * catalogue and are stripped of them) — so without this, saving a price from
   * the store page erased every print master the product had.
   */
  const [printLoaded, setPrintLoaded] = useState(false);
  const [printZipError, setPrintZipError] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [catFormOpen, setCatFormOpen] = useState(false);
  /** which store filter box a category created from here joins */
  const [catGroup, setCatGroup] = useState<CategoryGroup>("theme");
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
    // "tiered" is no longer a selectable type — it's folded into the inline
    // count-pricing option, so a legacy tiered product opens as a standard
    // product with count pricing switched on.
    setKind(product?.kind === "tiered" ? "standard" : product?.kind ?? "standard");
    setNameAr(product?.nameAr ?? "");
    setNameEn(product?.nameEn ?? "");
    setPrice(product ? String(product.price) : "");
    setDiscount(String(product?.discountPercent ?? 0));
    setDiscountFixed(String(product?.discountFixed ?? 0));
    setDiscountMode((product?.discountFixed ?? 0) > 0 ? "fixed" : "percent");
    setVolumePriced(product?.volumePriced || product?.kind === "tiered");
    setVolTiers(
      storeVolumeTiers.length > 0
        ? storeVolumeTiers.map((tr) => ({
            minQty: String(tr.minQty),
            unitPrice: String(tr.unitPrice),
          }))
        : [{ minQty: "1", unitPrice: "" }],
    );
    setVolSaved(false);
    setStock(String(product?.stock ?? 25));
    setInitialStock(product ? String(product.stock ?? 25) : null);
    setDescAr(product?.descAr ?? "");
    setDescEn(product?.descEn ?? "");
    setSelectedCats(product?.categories?.length ? product.categories : []);
    setSelectedSubs(product?.subcategories ?? []);
    setSelectedFandoms(product?.fandoms ?? []);
    setWaterproof(product?.waterproof ?? false);
    setSurcharge(String(product?.waterproofSurcharge ?? 0));
    setAllowCustom(product?.allowCustomImage ?? false);
    setGroupIds(
      product
        ? storeFeaturedGroups.filter((g) => g.productIds.includes(product.id)).map((g) => g.id)
        : [],
    );
    // Package products: slots come from their items (each has its own price);
    // others: from the plain image gallery.
    // The print master is looked up by URL in both branches, so it follows its
    // photo even where a legacy row's item order and `images` order disagree.
    const seeded: ImageRow[] =
      product?.kind === "package" && product.items.length > 0
        ? product.items.map((it) => ({
            key: rowKey(),
            itemId: it.id,
            url: it.imageUrl,
            printUrl: printImageFor(product, it.imageUrl),
            price: it.price === null ? "" : String(it.price),
            // null = the stock column isn't in the database yet; leave the field
            // blank rather than showing a 0 the admin never typed.
            stock: it.stock === null ? "" : String(it.stock),
            initialStock: it.stock === null ? "" : String(it.stock),
          }))
        : product
          ? product.images.map((url) => ({
              key: rowKey(),
              url,
              printUrl: printImageFor(product, url),
              price: "",
              stock: "",
            }))
          : [];
    setRows(seeded);
    // The cover is stored as a URL and tracked here as a slot key, so it is
    // resolved once, now, while the two are still known to line up. A cover
    // naming a photo the product no longer has falls back to the first slot —
    // the same answer coverImageOf() gives on the way out.
    setCoverKey(seeded.find((r) => r.url === product?.image)?.key ?? null);
    // A stored card image that is NOT one of the photos can only have come from
    // the slot below — that is how the editor tells the admin's two choices
    // apart without a column saying which it was.
    setCardImage(
      product && isSpecialCardImage(product.images, product.image)
        ? { url: product.image }
        : null,
    );
    setPrintTarget(null);
    setPrintZipError(false);
    setWarning(null);
    setTiers(
      product?.tiers?.length
        ? product.tiers.map((tr) => ({ minQty: String(tr.minQty), unitPrice: String(tr.unitPrice) }))
        : DEFAULT_TIERS,
    );
    setBulkPrice("");
    setBulkStock("");
    setExtraCats([]);
    setExtraSubs([]);
    setExtraFandoms([]);
    setCatFormOpen(false);
    setSubFormOpen(false);
    setFanFormOpen(false);
    setConfirmingDelete(false);
    setCreatedId(null);
    setError(null);
  }, [open, product, storeVolumeTiers, storeFeaturedGroups]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Load the product's stored print masters, whichever list the editor was
   * opened from.
   *
   * The seeding effect above already fills these in when the product came from
   * the dashboard inventory, so that path renders instantly and this only
   * confirms it. When it came from the store page the product has none to seed
   * from — the public catalogue is stripped of them — and this is the only
   * thing that puts them on screen, and the only thing that makes it safe to
   * save from there at all.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    // A product being created has nothing stored yet, so the form already knows
    // everything there is to know.
    if (!product) {
      setPrintLoaded(true);
      return;
    }
    let active = true;
    setPrintLoaded(false);
    getProductPrintImagesAction(product.id)
      .then((stored) => {
        if (!active) return;
        const indexOf = new Map(product.images.map((url, i) => [url, i]));
        setRows((prev) =>
          prev.map((r) => {
            // A master picked while this was in flight is the admin's newer
            // intent and outranks whatever is stored.
            if (!r.url || r.printFile) return r;
            const at = indexOf.get(r.url);
            return { ...r, printUrl: (at === undefined ? "" : stored[at]) || undefined };
          }),
        );
        setPrintLoaded(true);
      })
      .catch(() => {
        // Left false on purpose: a form that could not read the masters must
        // not go on to overwrite them with its own blanks.
      });
    return () => {
      active = false;
    };
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
  const cardRef = useRef<{ preview?: string } | null>(null);
  useEffect(() => {
    cardRef.current = cardImage;
  }, [cardImage]);
  useEffect(
    () => () => {
      rowsRef.current.forEach((r) => {
        if (r.preview) URL.revokeObjectURL(r.preview);
        if (r.printPreview) URL.revokeObjectURL(r.printPreview);
      });
      if (cardRef.current?.preview) URL.revokeObjectURL(cardRef.current.preview);
    },
    [],
  );

  if (!open) return null;

  const allCats = [...storeCategories, ...extraCats];
  // Same split the storefront draws, so the editor shows the two tags a product
  // needs rather than one undifferentiated list. With the store's boxes AND-ed,
  // a product tagged only "stickers" vanishes the moment a shopper picks a
  // theme — the grouping here is what makes that omission visible.
  const catBoxes = splitCategoryGroups(allCats);
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
      ...accepted.map((f) => ({
        key: rowKey(),
        file: f,
        preview: URL.createObjectURL(f),
        price: "",
        stock: "",
      })),
    ]);
    e.target.value = "";
  }

  function removeRow(i: number) {
    const r = rows[i];
    // Removing the chosen cover hands the choice back to the first slot rather
    // than leaving a cover key pointing at nothing. Decided out here, not
    // inside the updater below: an updater has to stay a pure function of the
    // previous state, and React is free to run it more than once.
    if (r && coverKey === r.key) setCoverKey(null);
    setRows((prev) => {
      const row = prev[i];
      if (row?.preview) URL.revokeObjectURL(row.preview);
      if (row?.printPreview) URL.revokeObjectURL(row.printPreview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function pickCardImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCardImage((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
  }

  /** Drop the special image; the card falls back to the starred photo. */
  function removeCardImage() {
    setCardImage((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });
  }

  /**
   * Open the file picker for ONE slot's print master.
   *
   * The target is remembered by slot key rather than by index: the picker is a
   * separate dialog the admin can take their time in, and a slot removed while
   * it is open would otherwise land the file on whichever photo inherited that
   * index.
   */
  function openPrintPicker(key: string) {
    setPrintTarget(key);
    printFileRef.current?.click();
  }

  function pickPrintImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const key = printTarget;
    setPrintTarget(null);
    if (!file || !key) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (r.printPreview) URL.revokeObjectURL(r.printPreview);
        // The new pick replaces a stored master as well as a pending one: the
        // slot holds one print file, and `printUrl` left set would win at save.
        return {
          ...r,
          printFile: file,
          printPreview: URL.createObjectURL(file),
          printUrl: undefined,
        };
      }),
    );
  }

  function removePrint(key: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (r.printPreview) URL.revokeObjectURL(r.printPreview);
        return { ...r, printFile: undefined, printPreview: undefined, printUrl: undefined };
      }),
    );
  }

  /** Stored print masters, in slot order — what the ZIP button can offer. */
  const storedPrintUrls = rows.flatMap((r) => (r.printUrl ? [r.printUrl] : []));
  const printCount = rows.filter(hasPrint).length;

  /**
   * Download every print master as one ZIP, ready to send to the cutter.
   *
   * Only the STORED ones: a file picked a moment ago is still on the admin's own
   * disk, so putting it in the archive would be handing them back a copy of
   * something they already have while implying the product has been saved.
   */
  async function downloadPrintFiles() {
    if (storedPrintUrls.length === 0) return;
    setPrintZipError(false);
    setZipping(true);
    try {
      // The product id is already a slug, and is ASCII — an Arabic file name
      // would arrive as mojibake out of most unzip tools (see lib/zip.ts).
      await downloadImagesAsZip(storedPrintUrls, `${product?.id ?? "product"}-print.zip`);
    } catch {
      setPrintZipError(true);
    } finally {
      setZipping(false);
    }
  }

  function setRowPrice(i: number, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, price: value } : r)));
  }

  function setRowStock(i: number, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, stock: value } : r)));
  }

  function setVolTier(i: number, field: "minQty" | "unitPrice", value: string) {
    setVolTiers((prev) => prev.map((tr, idx) => (idx === i ? { ...tr, [field]: value } : tr)));
  }

  async function saveVolumeTiers() {
    setVolSaving(true);
    setError(null);
    const res = await updateVolumeTiersAction({
      tiers: volTiers
        .map((tr) => ({
          minQty: Math.max(1, Number(tr.minQty) || 1),
          unitPrice: Math.max(0, Number(tr.unitPrice) || 0),
        }))
        .filter((tr, idx, arr) => arr.findIndex((x) => x.minQty === tr.minQty) === idx),
    });
    setVolSaving(false);
    if (!res.ok) {
      setError(res.error ?? t("checkout.error"));
      return;
    }
    setVolSaved(true);
    setTimeout(() => setVolSaved(false), 1500);
    router.refresh();
  }

  /** Bulk-apply one price to every image/item slot at once. */
  function applyBulkPrice() {
    const v = bulkPrice.trim();
    if (v === "") return;
    setRows((prev) => prev.map((r) => ({ ...r, price: v })));
  }

  /** Same idea for stock — a restock is usually the same count across designs. */
  function applyBulkStock() {
    const v = bulkStock.trim();
    if (v === "") return;
    setRows((prev) => prev.map((r) => ({ ...r, stock: v })));
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
    const res = await createCategoryAction({
      nameAr: catNameAr.trim(),
      nameEn: catNameEn.trim(),
      group: catGroup,
    });
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
    // A product this modal already created keeps its id, so pressing Save
    // again updates that row instead of minting a new one.
    const id = product?.id ?? createdId ?? slugify(nameEn || nameAr, performance.now() | 0);
    const creating = !isEdit && createdId === null;

    startTransition(async () => {
      // upload new files to product-images/<id>/…
      const finalRows: {
        key: string;
        itemId?: string;
        url: string;
        printUrl: string;
        price: string;
        stock: string;
        initialStock?: string;
      }[] = [];
      const toUpload = rows.filter((r) => r.file || r.printFile);
      if (toUpload.length > 0 || cardImage?.file) setUploading(true);

      /**
       * Upload one slot's print master, if it picked a new one.
       *
       * Capped at MAX_DIMENSION rather than DISPLAY_MAX_DIMENSION, because this
       * is the file the admin PRINTS from — the same reason a customer's own
       * artwork is kept at print resolution. Capping it at display size would
       * quietly hand the cutter a 1600px master.
       *
       * A failure here is reported like any other upload failure: the print
       * master is the whole point of the pair, and saving the product with the
       * photo attached and the master silently missing is the one outcome the
       * admin must not have to discover at the printer.
       */
      const putPrint = async (r: ImageRow, i: number): Promise<string | null> => {
        if (!r.printFile) return r.printUrl ?? "";
        const image = await toWebpVariants(r.printFile, MAX_DIMENSION);
        const uploaded = await uploadImagePair({
          bucket: "product-images",
          // Its own prefix, so a glance at the bucket (or a lifecycle rule) can
          // tell production masters from catalogue photos.
          base: `${id}/print/${Date.now()}-${i}`,
          image,
          maxDimension: MAX_DIMENSION,
          upsert: true,
        });
        if (!uploaded.ok) {
          setUploading(false);
          setError(uploaded.error);
          return null;
        }
        return uploaded.url;
      };

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.url) {
          const printUrl = await putPrint(r, i);
          if (printUrl === null) return;
          finalRows.push({
            key: r.key,
            itemId: r.itemId,
            url: r.url,
            printUrl,
            price: r.price,
            stock: r.stock,
            initialStock: r.initialStock,
          });
          continue;
        }
        if (!r.file) continue;
        // Re-encode to WebP in the browser (handles PNG/JPEG and iPhone
        // HEIC/HEIF) so the bucket only ever stores compact files.
        // Catalogue photos are display-only, so cap them at display size —
        // they're served straight from storage with no resizing step.
        //
        // Two sizes go up, not one. Every small slot in the app (cards, cart
        // lines, restock rows, lightbox strip) renders the thumb; only the
        // lightbox pulls this full-size file.
        const image = await toWebpVariants(r.file, DISPLAY_MAX_DIMENSION);
        const uploaded = await uploadImagePair({
          bucket: "product-images",
          base: `${id}/${Date.now()}-${i}`,
          image,
          maxDimension: DISPLAY_MAX_DIMENSION,
          upsert: true,
        });
        if (!uploaded.ok) {
          setUploading(false);
          setError(uploaded.error);
          return;
        }
        const printUrl = await putPrint(r, i);
        if (printUrl === null) return;
        finalRows.push({
          key: r.key,
          url: uploaded.url,
          printUrl,
          price: r.price,
          stock: r.stock,
        });
      }
      // The card image, if a new one was picked. Capped at display size like
      // every other catalogue photo — it is only ever shown, never printed —
      // and kept under its own prefix so the bucket says what it is.
      let cardImageUrl = cardImage?.url ?? "";
      if (cardImage?.file) {
        const encoded = await toWebpVariants(cardImage.file, DISPLAY_MAX_DIMENSION);
        const uploaded = await uploadImagePair({
          bucket: "product-images",
          base: `${id}/card/${Date.now()}`,
          image: encoded,
          maxDimension: DISPLAY_MAX_DIMENSION,
          upsert: true,
        });
        if (!uploaded.ok) {
          setUploading(false);
          setError(uploaded.error);
          return;
        }
        cardImageUrl = uploaded.url;
        // Swap the pending File for the stored URL, so a second Save in the
        // same sitting re-uploads nothing.
        setCardImage((prev) => {
          if (prev?.preview) URL.revokeObjectURL(prev.preview);
          return { url: uploaded.url };
        });
      }

      setUploading(false);

      // Fold the stored URLs back into the slots, in place of the Files they
      // came from. Everything in the bucket is now referenced by a slot, so a
      // second Save in the same sitting re-uploads nothing — which matters
      // because the print-files warning below deliberately leaves this form
      // open and invites exactly that.
      if (toUpload.length > 0) {
        const doneByKey = new Map(finalRows.map((r) => [r.key, r]));
        setRows((prev) =>
          prev.map((r) => {
            const done = doneByKey.get(r.key);
            if (!done) return r;
            // Safe to revoke here: the same update swaps the slot onto the
            // stored URL, so nothing renders the blob: preview again.
            if (r.preview) URL.revokeObjectURL(r.preview);
            if (r.printPreview) URL.revokeObjectURL(r.printPreview);
            return {
              ...r,
              url: done.url,
              file: undefined,
              preview: undefined,
              printUrl: done.printUrl || undefined,
              printFile: undefined,
              printPreview: undefined,
            };
          }),
        );
      }

      const priceNum = Number(price);
      // Only one discount mode is stored; the other is zeroed out.
      const discountNum =
        discountMode === "percent" ? Math.min(90, Math.max(0, Number(discount) || 0)) : 0;
      const discountFixedNum =
        discountMode === "fixed" ? Math.max(0, Number(discountFixed) || 0) : 0;
      const stockNum = Math.max(0, Number(stock) || 0);
      // Only a count the admin actually changed is sent. An untouched field is
      // sent as null, which upsertProductAction reads as "leave the database's
      // number alone" — that number may have moved since this form was opened
      // (every accepted order moves it), and the value loaded here is stale
      // the moment it has. Saving a price edit must never restock a product.
      const stockToSave = initialStock !== null && stock === initialStock ? null : stockNum;
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
            // Same rule per design: unchanged → null → left alone on the server.
            stock:
              r.initialStock !== undefined && r.stock === r.initialStock
                ? null
                : Math.max(0, Number(r.stock) || 0),
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

      // Resolved from the final rows, so the chosen cover is the UPLOADED url
      // of that slot and not the blob: preview it was picked by. Falls back to
      // the first photo, which is what coverImageOf() does with it anyway.
      const coverUrl =
        finalRows.find((r) => r.key === coverKey)?.url ?? finalRows[0]?.url;

      const res = await upsertProductAction({
        id,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || nameAr.trim(),
        price: priceNum,
        discountPercent: discountNum,
        discountFixed: discountFixedNum,
        volumePriced,
        stock: stockToSave,
        descAr: descAr.trim(),
        descEn: descEn.trim(),
        images: finalRows.map((r) => r.url),
        coverUrl,
        // "" when there is no special image, which the server reads as "clear
        // it" — that is how removing one puts the card back on the star.
        cardImage: cardImageUrl,
        // Index-aligned with `images` by construction — both come off the same
        // rows in the same pass, which is the whole reason the pairing can be
        // stored as two arrays rather than a join table.
        //
        // Omitted entirely until the stored masters have been read back, so a
        // form that does not know them cannot overwrite them with its blanks.
        ...(printLoaded ? { printImages: finalRows.map((r) => r.printUrl) } : {}),
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
        isUpdate: !creating,
      });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      // The row now exists, whatever happens below. Recorded before the first
      // thing that can stop early, so a second press updates it instead of
      // creating another one.
      if (creating) setCreatedId(id);

      // The product saved, but the print masters had nowhere to go — the column
      // arrives with a migration that may not have been run. Said out loud and
      // the modal left open, because the admin would otherwise walk away
      // believing those files are attached. Pressing Save again after running
      // the migration finishes the job — see `createdId`.
      if (res.warning === "print_images_missing") {
        setWarning(t("dash.printMigration"));
        // Everything else about the product DID save, so the list behind the
        // modal is brought up to date rather than left showing the old row.
        router.refresh();
        return;
      }

      // Showcase membership lives in its own join table, so it's saved
      // alongside the product rather than as a column on it.
      if (storeFeaturedGroups.length > 0) {
        const groupRes = await setProductGroupsAction(id, groupIds);
        if (!groupRes.ok) {
          setError(groupRes.error ?? t("checkout.error"));
          return;
        }
      }

      /**
       * Hand the saved product back to the list — on an EDIT as well as a
       * create, which it did not used to do.
       *
       * The inventory list is seeded ONCE from the server and is not re-read by
       * `router.refresh()` (its seed is component state; only a filter change
       * re-fetches it). So after saving an edit, the row behind this modal was
       * still the row as it was when the page loaded — and reopening the
       * product showed that stale copy. With print files that reads as the
       * upload having failed: the master is in the bucket and in the database,
       * but the form you reopen was built from a product fetched before it
       * existed, so the slot comes back empty.
       *
       * An edit starts from `product` so fields this form does not touch
       * (badge, sort order, created_at) survive; a create supplies the few
       * defaults a brand-new row gets.
       */
      const saved: Product = {
        ...(product ?? {
          subAr: "",
          subEn: "",
          emoji: "🛍️",
          soldOut: false,
          isActive: true,
          order: Date.now(),
          createdAt: new Date().toISOString(),
          tags: [],
        }),
        id,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || nameAr.trim(),
        price: priceNum,
        image: cardImageUrl || coverUrl,
        images: finalRows.map((r) => r.url),
        printImages: finalRows.map((r) => r.printUrl),
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
          stock: it.stock ?? 0,
        })),
        tiers: tiersPayload,
        stock: stockNum,
        discountPercent: discountNum,
        discountFixed: discountFixedNum,
        volumePriced,
        isFeatured: groupIds.length > 0,
        descAr: descAr.trim(),
        descEn: descEn.trim(),
      };
      onSaved?.(saved);
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
    const id = product.id;
    // Optimistic: drop it from the list and close now. router.refresh() then
    // reconciles — a rare failure simply re-lists the product.
    onDeleted?.(id);
    onClose();
    startTransition(async () => {
      await deleteProductAction(id);
      router.refresh();
    });
  }

  const content = (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="backdrop-in absolute inset-0 bg-black/55 backdrop-blur-[3px]"
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
            <div className="grid grid-cols-2 gap-2">
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

          {/* The shared by-count ladder. Any number of rungs is fine — the
              storefront renders however many exist. */}
          {volumePriced && (
            <div className="rounded-xl border border-line-2 bg-surface-2/40 p-3">
              <p className="text-xs font-bold text-ink-2">{t("dash.volumeLadder")}</p>
              <p className="mb-2 mt-0.5 text-[11px] leading-snug text-ink-3">
                {t("dash.volumeLadderHint")}
              </p>

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-[10px] font-bold text-ink-3">
                  <span>{t("dash.tierMinQty")}</span>
                  <span>{t("dash.tierPrice")}</span>
                  <span />
                </div>
                {volTiers.map((tr, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={tr.minQty}
                      onChange={(e) => setVolTier(i, "minQty", e.target.value)}
                      aria-label={t("dash.tierMinQty")}
                      className="dash-input h-9"
                    />
                    <input
                      type="number"
                      min={0}
                      value={tr.unitPrice}
                      onChange={(e) => setVolTier(i, "unitPrice", e.target.value)}
                      aria-label={t("dash.tierPrice")}
                      className="dash-input h-9"
                    />
                    <button
                      type="button"
                      onClick={() => setVolTiers((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={volTiers.length <= 1}
                      aria-label={t("offer.delete")}
                      className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {volTiers.length < 12 && (
                  <button
                    type="button"
                    onClick={() =>
                      setVolTiers((prev) => [
                        ...prev,
                        {
                          minQty: String((Number(prev[prev.length - 1]?.minQty) || prev.length) + 1),
                          unitPrice: "",
                        },
                      ])
                    }
                    className="tap inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-1.5 text-xs font-bold text-ink-3 transition hover:border-brand hover:text-brand"
                  >
                    <Plus size={13} />
                    {t("dash.addTier")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveVolumeTiers}
                  disabled={volSaving}
                  className="tap cta ms-auto inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {volSaved ? t("profile.saved") : volSaving ? "…" : t("dash.saveLadder")}
                </button>
              </div>
            </div>
          )}

          {/* Images / package items */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.image")}
              <span className="ms-2 font-semibold text-ink-3">
                {rows.length}/{maxImages}
              </span>
            </span>
            {isPackage && <p className="mb-2 text-[11px] text-ink-3">{t("dash.packageHint")}</p>}

            {/* The card image: one picture, uploaded for the product card and
                nowhere else. It is NOT added to `images`, so it never turns up
                in the gallery or the lightbox — which is the whole point. A
                package of twenty designs has no single photo that sells it;
                this is where the composite shot goes.

                Sits above the gallery because it is the first thing a shopper
                sees of this product, and because leaving it empty is a real
                choice the admin should make knowingly: the line under the slot
                says exactly what shows instead. */}
            <div className="mb-3 rounded-xl border border-line-2 bg-surface-2/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                <Photo size={13} className="text-brand" />
                {t("dash.cardImage")}
              </p>
              <input
                ref={cardFileRef}
                type="file"
                accept="image/*"
                onChange={pickCardImage}
                className="hidden"
              />
              <div className="mt-2 flex items-center gap-3">
                {cardImage ? (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-brand">
                    <RetryImage
                      src={cardImage.url ?? cardImage.preview ?? ""}
                      alt=""
                      fill
                      sizes="80px"
                      unoptimized={!!cardImage.preview}
                      className="object-cover"
                    />
                    {/* Siblings, not nested: the overlay makes the whole tile a
                        replace target, and a remove button inside it would be a
                        button inside a button. */}
                    <button
                      type="button"
                      onClick={() => cardFileRef.current?.click()}
                      aria-label={t("dash.cardImageReplace")}
                      title={t("dash.cardImageReplace")}
                      className="tap absolute inset-0"
                    />
                    <button
                      type="button"
                      onClick={removeCardImage}
                      aria-label={t("dash.cardImageRemove")}
                      className="tap absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => cardFileRef.current?.click()}
                    aria-label={t("dash.cardImageAdd")}
                    className="tap grid h-20 w-20 shrink-0 place-items-center gap-1 rounded-xl border-2 border-dashed border-line bg-surface text-ink-3 transition hover:border-brand hover:text-brand"
                  >
                    <Plus size={18} />
                    <span className="text-[9px] font-bold leading-none">
                      {t("dash.cardImageAdd")}
                    </span>
                  </button>
                )}
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink-3">
                  {cardImage ? t("dash.cardImageSet") : t("dash.cardImageEmpty")}
                </p>
              </div>
            </div>
            {/* The pairing, said once at the top. Every slot below is two
                pictures of one design: the photo that sells it and the file it
                is produced from. */}
            <p className="mb-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
              <Printer
                size={13}
                className="mt-px shrink-0"
                style={{ color: PRINT_FILE_COLOR }}
              />
              {t("dash.printPairHint")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={pickImages}
              className="hidden"
            />
            {/* One input for every print slot — the destination is held in
                `printTarget` rather than in eighteen hidden inputs. */}
            <input
              ref={printFileRef}
              type="file"
              accept="image/*"
              onChange={pickPrintImage}
              className="hidden"
            />
            <div className={`grid gap-2 ${isPackage ? "grid-cols-3" : "grid-cols-4"}`}>
              {rows.map((r, i) => {
                // null means "the first slot", so a product nobody has chosen a
                // cover for still shows one — and shows the same one the store
                // will render. See coverImageOf().
                const isCover = coverKey === null ? i === 0 : coverKey === r.key;
                return (
                  <div key={r.key} className="space-y-1">
                    <div className="relative aspect-square overflow-hidden rounded-xl border border-line-2">
                      <RetryImage
                        src={rowSrc(r)}
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
                      {/* Pick the thumbnail. On every kind, package included: a
                          package's card needs a cover as much as a standard
                          product's, and the only way to change it used to be to
                          delete photos until the right one happened to be first. */}
                      <button
                        type="button"
                        onClick={() => setCoverKey(r.key)}
                        aria-pressed={isCover}
                        aria-label={t("dash.makeCover")}
                        title={isCover ? t("dash.cover") : t("dash.makeCover")}
                        className={`tap absolute start-1 top-1 grid h-6 w-6 place-items-center rounded-full transition ${
                          isCover ? "bg-brand text-white" : "bg-black/60 text-white hover:bg-brand"
                        }`}
                      >
                        <Star size={12} />
                      </button>
                      {isCover && (
                        <span className="absolute bottom-1 start-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {t("dash.cover")}
                        </span>
                      )}
                    </div>

                    {/* The print master for THIS photo, directly under it. Empty
                        is a dashed violet slot that reads as "something belongs
                        here"; filled is the file itself, tappable to replace. */}
                    {hasPrint(r) ? (
                      <div
                        className="relative aspect-square overflow-hidden rounded-xl border-2"
                        style={{ borderColor: PRINT_FILE_COLOR }}
                      >
                        <RetryImage
                          src={printSrc(r)}
                          alt=""
                          fill
                          sizes="96px"
                          unoptimized={!!r.printPreview}
                          className="object-cover"
                        />
                        {/* Siblings, never nested: the overlay is what makes the
                            whole tile a replace target, and a remove button
                            inside it would be a button inside a button. */}
                        <button
                          type="button"
                          onClick={() => openPrintPicker(r.key)}
                          aria-label={t("dash.printReplace")}
                          title={t("dash.printReplace")}
                          className="tap absolute inset-0"
                        />
                        <button
                          type="button"
                          onClick={() => removePrint(r.key)}
                          aria-label={t("dash.printRemove")}
                          className="tap absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500"
                        >
                          <X size={12} />
                        </button>
                        <span
                          aria-hidden
                          className="absolute bottom-1 start-1 grid h-4 w-4 place-items-center rounded text-white"
                          style={{ background: PRINT_FILE_COLOR }}
                        >
                          <Printer size={10} />
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openPrintPicker(r.key)}
                        aria-label={t("dash.printAdd")}
                        title={t("dash.printAdd")}
                        className="tap grid aspect-square w-full place-items-center gap-0.5 rounded-xl border-2 border-dashed transition"
                        style={{
                          borderColor: `color-mix(in srgb, ${PRINT_FILE_COLOR} 45%, transparent)`,
                          background: `color-mix(in srgb, ${PRINT_FILE_COLOR} 6%, transparent)`,
                          color: PRINT_FILE_COLOR,
                        }}
                      >
                        <Printer size={16} />
                        <span className="text-[9px] font-bold leading-none">
                          {t("dash.printShort")}
                        </span>
                      </button>
                    )}
                    {isPackage && (
                      <>
                        <input
                          type="number"
                          min={0}
                          value={r.price}
                          onChange={(e) => setRowPrice(i, e.target.value)}
                          placeholder={price || t("dash.itemPrice")}
                          aria-label={t("dash.itemPrice")}
                          className="dash-input h-8 px-2 text-center text-xs"
                        />
                        {/* Stock sits directly under the price it belongs to, so a
                            design's price and its remaining count read as one unit. */}
                        <label className="flex items-center gap-1 rounded-lg border border-line-2 bg-surface-2/50 ps-2">
                          <Package size={11} className="shrink-0 text-ink-3" />
                          <input
                            type="number"
                            min={0}
                            value={r.stock}
                            onChange={(e) => setRowStock(i, e.target.value)}
                            placeholder="0"
                            aria-label={t("dash.itemStock")}
                            title={t("dash.itemStock")}
                            className="h-7 w-full min-w-0 bg-transparent px-1 text-center text-xs font-bold text-ink outline-none"
                          />
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
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

            {/* How many of the photos have a print master, and the whole set as
                one ZIP — the admin's way from "this product" to "the files to
                send to the cutter" without opening eighteen storage links. */}
            {rows.length > 0 && (
              <div
                className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border p-2.5"
                style={{
                  borderColor: `color-mix(in srgb, ${PRINT_FILE_COLOR} 35%, transparent)`,
                  background: `color-mix(in srgb, ${PRINT_FILE_COLOR} 5%, transparent)`,
                }}
              >
                <Printer size={14} style={{ color: PRINT_FILE_COLOR }} />
                <span className="text-[11px] font-bold" style={{ color: PRINT_FILE_COLOR }}>
                  {t("dash.printFiles")}
                </span>
                <span className="text-[11px] font-semibold text-ink-3">
                  {printCount}/{rows.length}
                </span>
                {storedPrintUrls.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadPrintFiles}
                    disabled={zipping}
                    className="tap ms-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition disabled:opacity-60"
                    style={{ borderColor: PRINT_FILE_COLOR, color: PRINT_FILE_COLOR }}
                  >
                    <Download size={12} />
                    {zipping
                      ? t("dash.downloading")
                      : `${t("dash.printDownloadAll")} (${storedPrintUrls.length})`}
                  </button>
                )}
                {/* A slot whose master was picked a moment ago isn't in the ZIP:
                    it is still on this machine and not yet uploaded. Said here
                    so the count and the archive can't look like they disagree. */}
                {printCount > storedPrintUrls.length && (
                  <span className="w-full text-[10px] font-semibold text-ink-3">
                    {t("dash.printPendingUpload")}
                  </span>
                )}
                {printZipError && (
                  <span className="w-full text-[10px] font-semibold text-red-500">
                    {t("dash.downloadError")}
                  </span>
                )}
              </div>
            )}

            {/* Bulk price / stock: type once, apply to every item at once —
                a restock is nearly always the same count across every design. */}
            {isPackage && rows.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
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
                    className="tap cta shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                  >
                    {t("dash.applyToAll")}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={bulkStock}
                    onChange={(e) => setBulkStock(e.target.value)}
                    placeholder={t("dash.bulkStock")}
                    aria-label={t("dash.bulkStock")}
                    className="dash-input h-9 flex-1"
                  />
                  <button
                    type="button"
                    onClick={applyBulkStock}
                    disabled={bulkStock.trim() === ""}
                    className="tap cta shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                  >
                    {t("dash.applyToAll")}
                  </button>
                </div>
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

          {/* Price / stock. A package has no single stock to speak of — each
              design is counted separately above — so the field would be a
              number with nothing behind it. It stays for one-photo products,
              where the product IS the thing being counted. */}
          <div className={`grid gap-3 ${isPackage ? "grid-cols-1" : "grid-cols-2"}`}>
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
            {!isPackage && (
              <Field label={t("dash.fieldStock")}>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="dash-input"
                />
              </Field>
            )}
          </div>

          {/* Discount — a segmented control picks the unit, so the value field
              gets a full row instead of being squeezed into a 3-up grid. */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.fieldDiscount")}
            </span>
            <div className="flex items-stretch gap-2">
              <div className="flex shrink-0 rounded-xl border border-line bg-surface-2 p-1">
                {(["percent", "fixed"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDiscountMode(m)}
                    aria-pressed={discountMode === m}
                    className={`tap rounded-lg px-3.5 py-1.5 text-[11px] font-bold transition ${
                      discountMode === m
                        ? "bg-brand text-white shadow-sm"
                        : "text-ink-2 hover:text-brand"
                    }`}
                  >
                    {m === "percent" ? "%" : t("dash.fixedAmount")}
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0}
                  max={discountMode === "percent" ? 90 : undefined}
                  value={discountMode === "percent" ? discount : discountFixed}
                  onChange={(e) =>
                    discountMode === "percent"
                      ? setDiscount(e.target.value)
                      : setDiscountFixed(e.target.value)
                  }
                  aria-label={t("dash.fieldDiscount")}
                  className="dash-input pe-12"
                />
                <span className="pointer-events-none absolute inset-y-0 end-3.5 grid place-items-center text-[11px] font-bold text-ink-3">
                  {discountMode === "percent" ? "%" : t("currency.iqd")}
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">{t("dash.discountHint")}</p>
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
            <div className="space-y-2">
              {(["type", "theme"] as const).map((g) => {
                const list = g === "type" ? catBoxes.types : catBoxes.themes;
                if (list.length === 0) return null;
                return (
                  <div
                    key={g}
                    className={`rounded-xl border p-2.5 ${
                      g === "type"
                        ? "border-brand-line bg-brand-soft"
                        : "border-accent-2-line bg-accent-2-soft"
                    }`}
                  >
                    <p className="mb-1.5 text-[10.5px] font-black text-ink">
                      {t(g === "type" ? "store.groupType" : "store.groupTheme")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((c) => {
                        const on = selectedCats.includes(c.code);
                        const onClass =
                          g === "type"
                            ? "border-brand bg-brand text-white"
                            : "border-accent-2 bg-accent-2 text-accent-2-ink";
                        const offClass =
                          g === "type"
                            ? "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                            : "border-line bg-surface text-ink-2 hover:border-accent-2 hover:text-accent-2";
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => toggleCat(c.code)}
                            aria-pressed={on}
                            className={`tap rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                              on ? onClass : offClass
                            }`}
                          >
                            {lang === "ar" ? c.nameAr : c.nameEn}
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
              <div className="mt-2 space-y-2 rounded-xl border border-line-2 bg-surface-2/50 p-3">
                <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
                  {(["type", "theme"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setCatGroup(g)}
                      aria-pressed={catGroup === g}
                      className={`tap flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                        catGroup === g
                          ? g === "type"
                            ? "bg-brand text-white shadow-sm"
                            : "bg-accent-2 text-accent-2-ink shadow-sm"
                          : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      {t(g === "type" ? "store.groupType" : "store.groupTheme")}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
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
                    className="tap cta shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                  >
                    {catPending ? "…" : t("dash.addCategory")}
                  </button>
                </div>
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
                      className="tap cta shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
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
                  className="tap cta shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
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

          {/* Showcase rails this product appears in on the home page */}
          {storeFeaturedGroups.length > 0 && (
            <div className="rounded-xl border border-line-2 bg-surface-2/40 p-3">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Star size={16} className="text-amber-500" filled={groupIds.length > 0} />
                {t("dash.featuredGroups")}
              </span>
              <span className="mt-0.5 mb-2 block text-[11px] leading-snug text-ink-3">
                {t("dash.featuredToggleHint")}
              </span>
              <div className="flex flex-wrap gap-2">
                {storeFeaturedGroups.map((g) => {
                  const on = groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setGroupIds((prev) =>
                          prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id],
                        )
                      }
                      aria-pressed={on}
                      className={`tap inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        on
                          ? "border-amber-400 bg-amber-400 text-white"
                          : "border-line bg-surface text-ink-2 hover:border-amber-400 hover:text-amber-500"
                      }`}
                    >
                      <Star size={12} filled={on} />
                      {lang === "ar" ? g.nameAr : g.nameEn}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* The product saved; something optional in it did not. Amber, not
              red, and left on screen rather than closing the modal. */}
          {warning && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-700">
              {warning}
            </p>
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
              className="tap cta rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
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
