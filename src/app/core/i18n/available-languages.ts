export interface AvailableLanguage {
  code: 'fr' | 'en';
  nativeName: string;
}

/** Fleet apps ship fr (default) + en (STANDARD-frontend-layout.md §5bis). */
export const AVAILABLE_LANGUAGES: AvailableLanguage[] = [
  { code: 'fr', nativeName: 'Français' },
  { code: 'en', nativeName: 'English' },
];

export type LanguageCode = AvailableLanguage['code'];
