export { definePlugin, type EnginePlugin } from "@toma.com/core";

export type PluginPermission =
  "filesystem:read" | "filesystem:write" | "network" | "process" | "editor" | "runtime";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  engine: string;
  permissions: readonly PluginPermission[];
  entry: string;
}

const pluginPermissions = new Set<PluginPermission>([
  "filesystem:read",
  "filesystem:write",
  "network",
  "process",
  "editor",
  "runtime",
]);

export function definePluginManifest(manifest: PluginManifest): Readonly<PluginManifest> {
  if (!/^[a-z][a-z0-9.-]+$/.test(manifest.id)) throw new Error(`Invalid plugin id: ${manifest.id}`);
  if (manifest.name.trim() === "") throw new Error("Plugin name must not be empty");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version))
    throw new Error(`Invalid plugin version: ${manifest.version}`);
  if (manifest.engine.trim() === "") throw new Error("Plugin engine range must not be empty");
  if (
    manifest.entry.trim() === "" ||
    manifest.entry.includes("\0") ||
    manifest.entry.startsWith("/") ||
    manifest.entry.split(/[\\/]/).includes("..")
  )
    throw new Error(`Invalid plugin entry: ${manifest.entry}`);
  if (new Set(manifest.permissions).size !== manifest.permissions.length)
    throw new Error("Plugin permissions must be unique");
  for (const permission of manifest.permissions) {
    if (!pluginPermissions.has(permission))
      throw new Error(`Invalid plugin permission: ${permission}`);
  }
  return Object.freeze({ ...manifest, permissions: Object.freeze([...manifest.permissions]) });
}
