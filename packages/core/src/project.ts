import { validateInputMap, type InputMap } from "./input.ts";
import type { EnginePlugin } from "./plugin.ts";

export interface ProjectDefinition {
  name: string;
  id: string;
  entryScene?: string;
  fixedTickRate?: number;
  maxFrameDelta?: number;
  input?: InputMap;
  plugins?: readonly EnginePlugin[];
}

export function defineProject(project: ProjectDefinition): Readonly<ProjectDefinition> {
  if (!/^[a-z][a-z0-9-]+$/.test(project.id)) throw new Error(`Invalid project id: ${project.id}`);
  if (project.name.trim() === "") throw new Error("Project name must not be empty");
  if (!Number.isFinite(project.fixedTickRate ?? 60) || (project.fixedTickRate ?? 60) <= 0)
    throw new Error("fixedTickRate must be finite and positive");
  if (!Number.isFinite(project.maxFrameDelta ?? 0.25) || (project.maxFrameDelta ?? 0.25) <= 0)
    throw new Error("maxFrameDelta must be finite and positive");
  validateInputMap(project.input ?? {});
  const pluginIds = new Set(project.plugins?.map((plugin) => plugin.id));
  if (pluginIds.size !== (project.plugins?.length ?? 0))
    throw new Error("Project plugin ids must be unique");
  return Object.freeze({ fixedTickRate: 60, maxFrameDelta: 0.25, ...project });
}
