'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useT } from '@/i18n/client';

export interface Uploaded { key: string; url: string; kind: 'image' | 'video' }

/** File picker (camera/gallery on phones) → POST /api/upload → reports the stored key. `name` makes it usable inside a plain <form>. */
export function MediaUploader({ purpose, accept, name, label, initialUrl, initialKind = 'image', onUploaded, className }: {
  purpose: 'avatar' | 'cover' | 'portfolio' | 'site' | 'studio'; accept: string; name?: string; label: string; initialUrl?: string | null; initialKind?: 'image' | 'video';
  onUploaded?: (u: Uploaded) => void; className?: string;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string; url?: string | null; kind: 'image' | 'video'; key: string }>({ busy: false, url: initialUrl, kind: initialKind, key: '' });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState((s) => ({ ...s, busy: true, error: undefined }));
    const fd = new FormData(); fd.set('file', file); fd.set('purpose', purpose);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'upload_failed');
      setState({ busy: false, url: json.url, kind: json.kind, key: json.key });
      onUploaded?.(json);
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : 'upload_failed' }));
    }
    if (input.current) input.current.value = '';
  }

  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
          {state.url ? (state.kind === 'video' ? <video src={state.url} muted playsInline className="h-full w-full object-cover" /> : <img src={state.url} alt="" className="h-full w-full object-cover" />) : <ImagePlus className="h-6 w-6 text-fg-muted" aria-hidden />}
        </div>
        <div className="space-y-1">
          <button type="button" onClick={() => input.current?.click()} disabled={state.busy} className="inline-flex min-h-touch items-center gap-2 rounded-md border bg-surface px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60">
            {state.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}{t('media.choose')}
          </button>
          {state.url && name && <button type="button" onClick={() => setState((s) => ({ ...s, url: null, key: '' }))} className="ml-2 inline-flex min-h-touch items-center gap-1 text-sm text-danger"><Trash2 className="h-4 w-4" aria-hidden />{t('media.remove')}</button>}
          {state.error && <p role="alert" className="text-xs text-danger">{t(`media.errors.${state.error}`)}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept={accept} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} tabIndex={-1} aria-hidden />
      {name && <input type="hidden" name={name} value={state.key} />}
    </div>
  );
}
