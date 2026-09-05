export type TranslationValue = string | { one: string; other: string; zero?: string };
export type TranslationCatalog = Readonly<Record<string, TranslationValue>>;

export class Localizer {
  readonly #catalogs = new Map<string, TranslationCatalog>();
  #locale: string;

  constructor(
    locale = "en",
    readonly fallbackLocale = "en",
  ) {
    this.#locale = locale;
  }

  add(locale: string, catalog: TranslationCatalog): this {
    this.#catalogs.set(locale, catalog);
    return this;
  }

  setLocale(locale: string): void {
    this.#locale = locale;
  }

  translate(key: string, variables: Readonly<Record<string, string | number>> = {}): string {
    const value =
      this.#catalogs.get(this.#locale)?.[key] ?? this.#catalogs.get(this.fallbackLocale)?.[key];
    if (value === undefined) return key;
    let template: string;
    if (typeof value === "string") template = value;
    else {
      const count = Number(variables.count ?? 0);
      template =
        count === 0 && value.zero !== undefined
          ? value.zero
          : count === 1
            ? value.one
            : value.other;
    }
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
      variables[name] === undefined ? match : String(variables[name]),
    );
  }

  get locale(): string {
    return this.#locale;
  }
}
