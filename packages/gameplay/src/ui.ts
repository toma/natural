import {
  defineComponent,
  definePlugin,
  defineSystem,
  type EnginePlugin,
  type Entity,
  type Game,
} from "@toma.com/core";

export interface UiStyle {
  display: "flex" | "none";
  direction: "row" | "column";
  width?: number | string;
  height?: number | string;
  padding?: number;
  gap?: number;
  color?: string;
  background?: string;
  fontSize?: number;
}

export interface UiControlData {
  kind: "panel" | "label" | "button";
  text: string;
  ariaLabel: string;
  style: UiStyle;
}

export const UiControl = defineComponent<UiControlData>({
  id: "natural.ui.control",
  defaults: () => ({
    kind: "panel",
    text: "",
    ariaLabel: "",
    style: { display: "flex", direction: "column" },
  }),
  validate: (value): value is UiControlData => {
    const data = value as Partial<UiControlData>;
    const style = data.style as Partial<UiStyle> | undefined;
    const validDimension = (dimension: unknown): boolean =>
      dimension === undefined ||
      (typeof dimension === "number" && Number.isFinite(dimension) && dimension >= 0) ||
      (typeof dimension === "string" && dimension.trim() !== "");
    const validOptionalNumber = (item: unknown): boolean =>
      item === undefined || (typeof item === "number" && Number.isFinite(item) && item >= 0);
    return (
      typeof value === "object" &&
      value !== null &&
      (data.kind === "panel" || data.kind === "label" || data.kind === "button") &&
      typeof data.text === "string" &&
      typeof data.ariaLabel === "string" &&
      typeof style === "object" &&
      style !== null &&
      (style.display === "flex" || style.display === "none") &&
      (style.direction === "row" || style.direction === "column") &&
      validDimension(style.width) &&
      validDimension(style.height) &&
      validOptionalNumber(style.padding) &&
      validOptionalNumber(style.gap) &&
      validOptionalNumber(style.fontSize) &&
      (style.color === undefined || typeof style.color === "string") &&
      (style.background === undefined || typeof style.background === "string")
    );
  },
});

const key = (entity: Entity): string => `${entity.index}:${entity.generation}`;

export interface DomUiOptions {
  root: HTMLElement;
  onAction?: (entity: Entity) => void;
}

export function createDomUiPlugin(options: DomUiOptions): EnginePlugin {
  const elements = new Map<string, HTMLElement>();
  return definePlugin({
    id: "natural.ui.dom",
    setup: (game) => {
      game.world.register(UiControl);
      game.scheduler.add(
        defineSystem({
          name: "natural.ui.dom.sync",
          stage: "render",
          before: ["natural.renderer.sync"],
          run: () => syncDom(game, options, elements),
        }),
      );
    },
    dispose: () => {
      for (const element of elements.values()) element.remove();
      elements.clear();
    },
  });
}

function syncDom(game: Game, options: DomUiOptions, elements: Map<string, HTMLElement>): void {
  const seen = new Set<string>();
  for (const row of game.world.query(UiControl)) {
    const control = row.components[0];
    const entityKey = key(row.entity);
    seen.add(entityKey);
    let element = elements.get(entityKey);
    const tag = control.kind === "button" ? "button" : "div";
    if (element?.tagName.toLowerCase() !== tag) {
      element?.remove();
      element = document.createElement(tag);
      options.root.append(element);
      elements.set(entityKey, element);
      if (tag === "button") element.addEventListener("click", () => options.onAction?.(row.entity));
    }
    element.textContent = control.text;
    element.ariaLabel = control.ariaLabel || control.text;
    const style = control.style;
    Object.assign(element.style, {
      display: style.display,
      flexDirection: style.direction,
      width: typeof style.width === "number" ? `${style.width}px` : (style.width ?? ""),
      height: typeof style.height === "number" ? `${style.height}px` : (style.height ?? ""),
      padding: style.padding === undefined ? "" : `${style.padding}px`,
      gap: style.gap === undefined ? "" : `${style.gap}px`,
      color: style.color ?? "",
      background: style.background ?? "",
      fontSize: style.fontSize === undefined ? "" : `${style.fontSize}px`,
    });
  }
  for (const [entityKey, element] of elements) {
    if (!seen.has(entityKey)) {
      element.remove();
      elements.delete(entityKey);
    }
  }
}
