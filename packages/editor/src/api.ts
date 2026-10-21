import { canonicalJson, validateScene, type SceneData, type SceneNodeData } from "@toma.com/core";
import { parse } from "jsonc-parser";

export interface ProjectSummary {
  root: string;
  name: string;
  scenes: string[];
  assets: string[];
}

export const isDesktopEditor = (): boolean => "__TAURI_INTERNALS__" in window;

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await import("@tauri-apps/api/core");
  return api.invoke<T>(command, args);
}

export async function loadProject(): Promise<ProjectSummary> {
  if (isDesktopEditor()) return invoke<ProjectSummary>("load_project");
  const response = await fetch("/api/project");
  if (!response.ok) throw new Error(`Could not load project: ${response.status}`);
  return response.json() as Promise<ProjectSummary>;
}

export async function loadScene(path: string): Promise<SceneData> {
  if (isDesktopEditor()) {
    const source = await invoke<string>("load_scene", { path });
    const value: unknown = parse(source);
    validateScene(value as SceneData);
    return value as SceneData;
  }
  const response = await fetch(`/api/scene?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(`Could not load scene: ${response.status}`);
  return response.json() as Promise<SceneData>;
}

export async function saveScene(path: string, scene: SceneData): Promise<void> {
  validateScene(scene);
  if (isDesktopEditor()) {
    await invoke("save_scene", { path, contents: canonicalJson(scene) });
    return;
  }
  const response = await fetch(`/api/scene?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scene),
  });
  if (!response.ok) throw new Error(`Could not save scene: ${response.status}`);
}

export async function chooseProject(): Promise<boolean> {
  if (!isDesktopEditor()) return false;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false, title: "Open Natural project" });
  if (typeof selected !== "string") return false;
  await invoke("set_project_root", { path: selected });
  return true;
}

export function flattenNodes(root: SceneNodeData): SceneNodeData[] {
  return [root, ...(root.children ?? []).flatMap(flattenNodes)];
}
