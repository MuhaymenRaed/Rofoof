import { Grid, Sticker, Photo, Hexagon, Cube } from "@/components/icons";

const map = {
  grid: Grid,
  sticker: Sticker,
  photo: Photo,
  hexagon: Hexagon,
  cube: Cube,
} as const;

export function CategoryIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = map[name as keyof typeof map] ?? Grid;
  return <Icon size={size} />;
}
