import { Eye, Flower2, Gem, Hand, HeartHandshake, PenTool, Palette, Scissors, Sparkles, type LucideIcon } from 'lucide-react';

// Category.icon holds a lucide icon NAME (editable in the admin later). Unknown names fall back to Sparkles.
const ICONS: Record<string, LucideIcon> = { Eye, Flower2, Gem, Hand, HeartHandshake, PenTool, Palette, Scissors, Sparkles };

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Sparkles;
  return <Icon className={className} aria-hidden />;
}
