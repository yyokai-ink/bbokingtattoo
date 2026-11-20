import type { Appearance } from '@/server/site-settings';

/** Full-bleed hero background: image or looping muted video (poster first; reduced-motion visitors see only the poster). */
export function HeroMedia({ a }: { a: Appearance }) {
  if (a.heroKind === 'none' || !a.heroUrl) return <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-[hsl(262_45%_14%)]" />;
  return (
    <>
      {a.heroKind === 'video' ? (
        <>
          {a.heroPosterUrl ? <img src={a.heroPosterUrl} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-brand to-[hsl(262_45%_14%)] md:hidden" />}
          <video autoPlay muted loop playsInline preload="metadata" poster={a.heroPosterUrl ?? undefined} aria-hidden className="absolute inset-0 hidden h-full w-full object-cover md:motion-safe:block">
            <source src={a.heroUrl} type={a.heroUrl.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
          </video>
        </>
      ) : <img src={a.heroUrl} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
      <div aria-hidden className="absolute inset-0 bg-black" style={{ opacity: a.heroOverlay / 100 }} />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
    </>
  );
}
