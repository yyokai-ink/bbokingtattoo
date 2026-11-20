/** Admin-editable look & copy of the public site (stored in SiteSetting 'site.appearance'). All fields optional → sensible defaults. */
export interface Appearance {
  heroKind: 'none' | 'image' | 'video';
  heroUrl: string | null;      // image or video file (/media/... or CDN URL)
  heroPosterUrl: string | null; // shown while the video loads and for visitors who prefer reduced motion
  heroOverlay: number;          // 0–80: how dark the readability overlay is
  logoUrl: string | null;       // site logo (header)
  companyName: string;          // legal entity / owner name shown in Terms & Privacy
  contactEmail: string;         // contact for privacy requests
  ctaBgUrl: string | null;      // background image of the "for specialists" block
  heroTitle: Partial<Record<string, string>>;    // per-locale overrides
  heroSubtitle: Partial<Record<string, string>>;
}

export const DEFAULT_APPEARANCE: Appearance = { heroKind: 'none', heroUrl: null, heroPosterUrl: null, heroOverlay: 45, logoUrl: null, companyName: '', contactEmail: '', ctaBgUrl: null, heroTitle: {}, heroSubtitle: {} };
export const APPEARANCE_KEY = 'site.appearance';

export function normalizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max && v.length > 0 ? v : null);
  const media = (v: unknown) => { const s = str(v); return s && (s.startsWith('/media/') || /^https:\/\//.test(s)) ? s : null; }; // never javascript:/data: URLs
  const rec = (v: unknown) => Object.fromEntries(Object.entries((v && typeof v === 'object' ? v : {}) as Record<string, unknown>).filter(([k, x]) => /^[a-z]{2}$/.test(k) && typeof x === 'string' && x.length <= 200)) as Record<string, string>;
  const kind = r.heroKind === 'image' || r.heroKind === 'video' ? r.heroKind : 'none';
  const url = media(r.heroUrl);
  return {
    heroKind: url ? kind : 'none', heroUrl: url, heroPosterUrl: media(r.heroPosterUrl),
    heroOverlay: typeof r.heroOverlay === 'number' ? Math.min(80, Math.max(0, Math.round(r.heroOverlay))) : DEFAULT_APPEARANCE.heroOverlay,
    companyName: typeof r.companyName === 'string' ? r.companyName.trim().slice(0, 120) : '',
    contactEmail: typeof r.contactEmail === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(r.contactEmail.trim()) ? r.contactEmail.trim().slice(0, 254) : '',
    logoUrl: media(r.logoUrl), ctaBgUrl: media(r.ctaBgUrl), heroTitle: rec(r.heroTitle), heroSubtitle: rec(r.heroSubtitle),
  };
}

