import type { DeepPartial } from "./types.ts";

export interface ComponentDefinition<T> {
  readonly id: string;
  readonly create: (value?: DeepPartial<T>) => T;
  readonly validate?: (value: unknown) => value is T;
  readonly transient?: boolean;
}

// Component registries intentionally erase a component's value type; typed access is restored by
// World.add/get/query through the concrete definition supplied by the caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponentDefinition = ComponentDefinition<any>;

export interface ComponentOptions<T> {
  id: string;
  defaults: () => T;
  merge?: (defaults: T, value: DeepPartial<T>) => T;
  validate?: (value: unknown) => value is T;
  transient?: boolean;
}

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) {
    return (patch === undefined ? base : patch) as T;
  }
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = result[key];
    result[key] =
      value !== null && typeof value === "object" && current !== null && typeof current === "object"
        ? mergeDeep(current, value)
        : value;
  }
  return result as T;
}

export function defineComponent<T>(options: ComponentOptions<T>): ComponentDefinition<T> {
  if (!/^[a-z][a-z0-9.-]+$/i.test(options.id)) {
    throw new Error(`Component id must be namespaced and URL-safe: ${options.id}`);
  }
  return Object.freeze({
    id: options.id,
    create: (value?: DeepPartial<T>) => {
      const defaults = options.defaults();
      const created =
        value === undefined ? defaults : (options.merge ?? mergeDeep)(defaults, value);
      if (options.validate !== undefined && !options.validate(created))
        throw new Error(`Invalid value for component ${options.id}`);
      return created;
    },
    ...(options.validate === undefined ? {} : { validate: options.validate }),
    ...(options.transient === undefined ? {} : { transient: options.transient }),
  });
}

export type ComponentValue<T> = T extends ComponentDefinition<infer V> ? V : never;
