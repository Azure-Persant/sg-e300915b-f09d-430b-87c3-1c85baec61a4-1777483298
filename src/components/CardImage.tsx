import Image from "next/image";

/**
 * Card art, served through the image CDN rather than straight from gatcg.
 *
 * Every card image lives on api.gatcg.com. Rendering those with a plain <img>
 * meant each visitor fetched each image from gatcg directly, and because <img>
 * does not lazy-load by default, a 120-tile page fired 120 requests at their
 * servers on load. next/image changes both halves of that: the host fetches an
 * image once, caches the optimised copy at the edge and serves every later
 * visitor from there, and images below the fold are not requested until they
 * scroll into view.
 *
 * Sizes are declared per variant because next/image needs intrinsic dimensions
 * to reserve layout space. The ratio is the physical card's 2.5 x 3.5 inches.
 */
const CARD_ASPECT = 3.5 / 2.5;

const VARIANTS = {
  /** Grid tile — fills its column, so the browser picks a width from `sizes`. */
  tile: {
    width: 250,
    sizes: "(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw",
  },
  /** The large image in a card dialog. */
  detail: { width: 380, sizes: "(max-width: 768px) 90vw, 380px" },
  /** Row thumbnail in a list. */
  thumb: { width: 64, sizes: "64px" },
  /** Slightly larger row thumbnail. */
  row: { width: 80, sizes: "80px" },
} as const;

type Props = {
  src: string | null | undefined;
  alt: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
  /**
   * Set on images already visible when the page opens, so they are not
   * lazy-loaded and do not pop in. Leave off for grid tiles.
   */
  priority?: boolean;
};

export function CardImage({ src, alt, variant = "tile", className, priority }: Props) {
  if (!src) return null;

  const { width, sizes } = VARIANTS[variant];

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={Math.round(width * CARD_ASPECT)}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}
