import { useEffect, useMemo, useState } from "react";
import type { SceneData, SceneNodeData } from "@natural-engine/core";
import {
  chooseProject,
  flattenNodes,
  isDesktopEditor,
  loadProject,
  loadScene,
  saveScene,
  type ProjectSummary,
} from "./api.ts";

export function App() {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [scene, setScene] = useState<SceneData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("Editor ready");
  const [playing, setPlaying] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [undoStack, setUndoStack] = useState<SceneData[]>([]);
  const [redoStack, setRedoStack] = useState<SceneData[]>([]);
  const [componentsDraft, setComponentsDraft] = useState("{}");
  const [dirty, setDirty] = useState(false);

  const openFirstScene = async (value: ProjectSummary): Promise<void> => {
    setProject(value);
    const path = value.scenes[0];
    if (path === undefined) {
      setScene(null);
      setSelectedId("");
      setMessage("Project has no scenes");
      return;
    }
    const loaded = await loadScene(path);
    setScene(loaded);
    setSelectedId(loaded.root.id);
    setUndoStack([]);
    setRedoStack([]);
    setDirty(false);
    setMessage(`Opened ${value.name}`);
  };

  useEffect(() => {
    void loadProject()
      .then(openFirstScene)
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      );
  }, []);

  const nodes = useMemo(() => (scene === null ? [] : flattenNodes(scene.root)), [scene]);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    setComponentsDraft(JSON.stringify(selected?.components ?? {}, null, 2));
  }, [selected]);

  const commit = (next: SceneData): void => {
    if (scene !== null) setUndoStack((history) => [...history.slice(-99), scene]);
    setRedoStack([]);
    setScene(next);
    setDirty(true);
  };

  const updateNode = (
    node: SceneNodeData,
    id: string,
    update: (value: SceneNodeData) => SceneNodeData,
  ): SceneNodeData => {
    if (node.id === id) return update(node);
    if (node.children === undefined) return node;
    return { ...node, children: node.children.map((child) => updateNode(child, id, update)) };
  };

  const rename = (name: string): void => {
    if (scene === null || selected === null) return;
    commit({ ...scene, root: updateNode(scene.root, selected.id, (node) => ({ ...node, name })) });
  };

  const setActive = (active: boolean): void => {
    if (scene === null || selected === null) return;
    commit({
      ...scene,
      root: updateNode(scene.root, selected.id, (node) => ({ ...node, active })),
    });
  };

  const addChild = (): void => {
    if (scene === null || selected === null) return;
    const child: SceneNodeData = { id: crypto.randomUUID(), name: "New Node", children: [] };
    commit({
      ...scene,
      root: updateNode(scene.root, selected.id, (node) => ({
        ...node,
        children: [...(node.children ?? []), child],
      })),
    });
    setSelectedId(child.id);
  };

  const removeSelected = (): void => {
    if (scene === null || selected === null || selected.id === scene.root.id) {
      setMessage("The scene root cannot be deleted");
      return;
    }
    const remove = (node: SceneNodeData): SceneNodeData => ({
      ...node,
      ...(node.children === undefined
        ? {}
        : { children: node.children.filter((child) => child.id !== selected.id).map(remove) }),
    });
    commit({ ...scene, root: remove(scene.root) });
    setSelectedId(scene.root.id);
  };

  const undo = (): void => {
    const previous = undoStack.at(-1);
    if (scene === null || previous === undefined) return;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((history) => [...history, scene]);
    setScene(previous);
    setSelectedId(previous.root.id);
    setDirty(true);
  };

  const redo = (): void => {
    const next = redoStack.at(-1);
    if (scene === null || next === undefined) return;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((history) => [...history, scene]);
    setScene(next);
    setSelectedId(next.root.id);
    setDirty(true);
  };

  const updateComponents = (): void => {
    if (scene === null || selected === null) return;
    try {
      const components: unknown = JSON.parse(componentsDraft);
      if (components === null || Array.isArray(components) || typeof components !== "object")
        throw new Error("Components must be a JSON object");
      commit({
        ...scene,
        root: updateNode(scene.root, selected.id, (node) => ({
          ...node,
          components: components as Record<string, unknown>,
        })),
      });
      setMessage("Component data updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const persist = async (): Promise<void> => {
    const path = project?.scenes[0];
    if (scene === null || path === undefined) return;
    await saveScene(path, scene);
    setDirty(false);
    setMessage(`Saved ${path}`);
  };

  const open = async (): Promise<void> => {
    if (!(await chooseProject())) {
      setMessage(isDesktopEditor() ? "No project selected" : "Set NATURAL_PROJECT and restart");
      return;
    }
    await openFirstScene(await loadProject());
  };

  const play = async (): Promise<void> => {
    if (isDesktopEditor()) {
      setMessage("Run `natural dev` for live game preview; desktop preview is isolated by design");
      return;
    }
    setPreviewRevision((value) => value + 1);
    setPlaying(true);
    setMessage(dirty ? "Preview running from last save" : "Preview running");
  };

  return (
    <main className="editor">
      <header className="topbar">
        <span className="brand">NATURAL{dirty ? " •" : ""}</span>
        <button type="button" onClick={() => void open()}>
          Open
        </button>
        <button type="button" onClick={() => void persist()}>
          Save
        </button>
        <button type="button" disabled={undoStack.length === 0} onClick={undo}>
          Undo
        </button>
        <button type="button" disabled={redoStack.length === 0} onClick={redo}>
          Redo
        </button>
        <button type="button" onClick={() => void play()}>
          ▶ Play
        </button>
        <button type="button" onClick={() => setPlaying(false)}>
          Ⅱ Stop
        </button>
        <span className="spacer" />
        <span className="status">
          <span className="dot" /> {isDesktopEditor() ? "Desktop" : "WebGPU"}
        </span>
      </header>
      <aside className="panel">
        <h2>Scene</h2>
        <div className="scene-actions">
          <button type="button" onClick={addChild}>
            + Child
          </button>
          <button type="button" onClick={removeSelected}>
            Delete
          </button>
        </div>
        <ul className="tree">
          {nodes.map((node) => (
            <li
              key={node.id}
              data-selected={node.id === selectedId}
              onClick={() => setSelectedId(node.id)}
            >
              {node === scene?.root ? "◆" : "◇"} {node.name}
            </li>
          ))}
        </ul>
      </aside>
      <section className="viewport" aria-label="3D viewport">
        {playing ? (
          <iframe
            key={previewRevision}
            title="Game preview"
            src={`/preview/?revision=${previewRevision}`}
          />
        ) : (
          <>
            <div className="grid" />
            <div className="axis" />
          </>
        )}
        <span className="viewport-label">Perspective · Lit</span>
      </section>
      <aside className="panel right">
        <h2>Inspector</h2>
        <div className="inspector">
          <label className="field">
            <span>Name</span>
            <input value={selected?.name ?? ""} onChange={(event) => rename(event.target.value)} />
          </label>
          <label className="field">
            <span>Stable ID</span>
            <input value={selected?.id ?? ""} readOnly />
          </label>
          <label className="field">
            <span>Active</span>
            <input
              type="checkbox"
              checked={selected?.active ?? true}
              onChange={(event) => setActive(event.target.checked)}
            />
          </label>
          <label className="component-field">
            <span>Components (JSON)</span>
            <textarea
              value={componentsDraft}
              spellCheck={false}
              onChange={(event) => setComponentsDraft(event.target.value)}
              onBlur={updateComponents}
            />
          </label>
        </div>
      </aside>
      <footer className="bottom">
        <div className="console">{message}</div>
        <div className="assets">
          <strong>Assets</strong> · {project?.assets.length ?? 0} imported
        </div>
      </footer>
    </main>
  );
}
