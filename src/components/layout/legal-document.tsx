import { localeMeta, type Locale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { LEGAL_SECTIONS } from '@/lib/legal';
import { getAppearance } from '@/server/site-settings';

const hasKey = (t: (k: string) => string, k: string) => t(k) !== k;

/** Renders Terms / Privacy from the translation catalogs. Company name and e-mail come from /admin/content. */
export async function LegalDocument({ doc, locale }: { doc: 'privacy' | 'terms'; locale: Locale }) {
  const t = createT(locale);
  const a = await getAppearance();
  const vars = { company: a.companyName || t('app.name'), email: a.contactEmail || '—' };
  const date = new Intl.DateTimeFormat(localeMeta[locale].intl, { dateStyle: 'long' }).format(new Date('2026-11-01'));
  return (
    <article className="container max-w-3xl py-10">
      <h1 className="h-display">{t(`legal.${doc}.title`)}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t(`legal.${doc}.updated`, { date })}</p>
      <p className="mt-6 text-fg-muted">{t(`legal.${doc}.intro`, vars)}</p>
      <div className="mt-8 space-y-8">
        {LEGAL_SECTIONS.filter((s) => hasKey(t, `legal.${doc}.s.${s}.title`)).map((s, i) => (
          <section key={s}><h2 className="text-xl font-bold">{i + 1}. {t(`legal.${doc}.s.${s}.title`)}</h2>
            {t(`legal.${doc}.s.${s}.body`, vars).split('\n\n').map((para, j) => <p key={j} className="mt-2 text-fg-muted">{para}</p>)}</section>
        ))}
      </div>
    </article>
  );
}
