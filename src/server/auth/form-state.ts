/** Shape returned by every form Server Action. `error` / `message` are i18n key suffixes, never raw text. */
export interface FormState { error?: string; message?: string; ok?: boolean }
export const initialFormState: FormState = {};
