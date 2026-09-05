use serde::Serialize;
use std::{
    env, fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

struct ProjectState(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    root: String,
    name: String,
    scenes: Vec<String>,
    assets: Vec<String>,
}

fn initial_project() -> Option<PathBuf> {
    let candidate = env::var_os("NATURAL_PROJECT")
        .map(PathBuf::from)
        .or_else(|| env::current_dir().ok())?;
    let canonical = candidate.canonicalize().ok()?;
    canonical
        .join("natural.config.ts")
        .is_file()
        .then_some(canonical)
}

fn project_root(state: &tauri::State<'_, ProjectState>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|_| "Project state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "No Natural project is open".to_string())
}

fn safe_project_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if Path::new(relative).components().any(|part| {
        matches!(
            part,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("Path escapes the project root".to_string());
    }
    let path = root.join(relative);
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Cannot access {relative}: {error}"))?;
    if !canonical.starts_with(root) {
        return Err("Path escapes the project root".to_string());
    }
    Ok(canonical)
}

fn collect_files(root: &Path, current: &Path, files: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_symlink()
        {
            continue;
        }
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if ["node_modules", ".git", ".natural", "dist", "target"].contains(&name.as_ref()) {
                continue;
            }
            collect_files(root, &path, files)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            files.push(relative);
        }
    }
    Ok(())
}

#[tauri::command]
fn set_project_root(path: String, state: tauri::State<'_, ProjectState>) -> Result<(), String> {
    let root = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Cannot open project: {error}"))?;
    if !root.join("natural.config.ts").is_file() || !root.join("package.json").is_file() {
        return Err("Directory is not a Natural project".to_string());
    }
    *state
        .0
        .lock()
        .map_err(|_| "Project state is unavailable".to_string())? = Some(root);
    Ok(())
}

#[tauri::command]
fn load_project(state: tauri::State<'_, ProjectState>) -> Result<ProjectSummary, String> {
    let root = project_root(&state)?;
    let mut files = Vec::new();
    collect_files(&root, &root, &mut files)?;
    files.sort();
    let scenes = files
        .iter()
        .filter(|path| path.ends_with(".scene.jsonc"))
        .cloned()
        .collect();
    let assets = files
        .iter()
        .filter(|path| {
            [".png", ".jpg", ".jpeg", ".glb", ".gltf", ".ogg", ".wav"]
                .iter()
                .any(|extension| path.to_ascii_lowercase().ends_with(extension))
        })
        .cloned()
        .collect();
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Natural project")
        .to_string();
    Ok(ProjectSummary {
        root: root.to_string_lossy().to_string(),
        name,
        scenes,
        assets,
    })
}

#[tauri::command]
fn load_scene(path: String, state: tauri::State<'_, ProjectState>) -> Result<String, String> {
    let root = project_root(&state)?;
    let target = safe_project_path(&root, &path)?;
    if !path.ends_with(".scene.jsonc") {
        return Err("Only Natural scene files can be opened".to_string());
    }
    let size = target.metadata().map_err(|error| error.to_string())?.len();
    if size > 16 * 1024 * 1024 {
        return Err("Scene exceeds the 16 MiB editor limit".to_string());
    }
    fs::read_to_string(target).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_scene(
    path: String,
    contents: String,
    state: tauri::State<'_, ProjectState>,
) -> Result<(), String> {
    if contents.len() > 16 * 1024 * 1024 {
        return Err("Scene exceeds the 16 MiB editor limit".to_string());
    }
    let root = project_root(&state)?;
    let target = safe_project_path(&root, &path)?;
    if !path.ends_with(".scene.jsonc") {
        return Err("Only Natural scene files can be saved".to_string());
    }
    let temporary = target.with_extension(format!("natural-tmp-{}", std::process::id()));
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    fs::rename(temporary, target).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProjectState(Mutex::new(initial_project())))
        .invoke_handler(tauri::generate_handler![
            set_project_root,
            load_project,
            load_scene,
            save_scene
        ])
        .run(tauri::generate_context!())
        .expect("Natural editor failed to start");
}
