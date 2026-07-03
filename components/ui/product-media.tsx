import Image from "next/image";
import type { Product } from "@/lib/products";

type CSSVars = React.CSSProperties & Record<string, string>;

/**
 * Product visual. Uses next/image (lazy-loaded, responsive) when the product
 * has a real `image`; otherwise renders the brand emoji tile. The accent color
 * drives the tinted background via color-mix so it adapts to dark mode.
 */
export function ProductMedia({
  product,
  name,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px",
  priority = false,
  emojiClassName = "text-5xl",
}: {
  product: Product;
  name: string;
  sizes?: string;
  priority?: boolean;
  emojiClassName?: string;
}) {
  const style: CSSVars = {
    "--c": product.color,
    background: "color-mix(in srgb, var(--c) 11%, var(--surface))",
  };

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden" style={style}>
      <span className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ background: "var(--c)" }} />
      {product.image ? (
        <Image
          src={product.image}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span className={`${emojiClassName} transition-transform duration-300 group-hover:scale-110`}>
          {product.emoji}
        </span>
      )}
    </div>
  );
}
