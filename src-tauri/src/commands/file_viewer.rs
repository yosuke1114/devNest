use tauri::{AppHandle, Emitter, State};
use serde::Serialize;
use crate::db;
use crate::error::AppError;
use crate::models::file_node::{CodeSaveResult, FileContent, FileNode};
use crate::services::{git::GitService, keychain};
use crate::state::AppState;

/// code_save_progress イベントのペイロード
#[derive(Debug, Clone, Serialize)]
pub struct CodeSaveProgressPayload {
    pub path: String,
    pub status: String, // "committing" | "pushing" | "synced" | "push_failed"
    pub sha: Option<String>,
}

/// デフォルト除外ディレクトリ・ファイル
const EXCLUDE_DIRS: &[&str] = &[
    "node_modules", "target", ".git", ".next", "dist", "build",
    "__pycache__", ".cache", "vendor", "gen",
];
const EXCLUDE_FILES: &[&str] = &[".DS_Store", "Thumbs.db"];

/// コードビューアで対応する拡張子
const CODE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "rs", "html", "htm",
    "css", "scss", "sass", "sql", "json", "toml", "yaml", "yml",
    "go", "php", "py", "md", "txt", "sh", "bash", "zsh",
    "env", "gitignore", "lock",
];

fn is_excluded_dir(name: &str) -> bool {
    EXCLUDE_DIRS.contains(&name)
}

fn is_excluded_file(name: &str) -> bool {
    EXCLUDE_FILES.contains(&name) || name.starts_with('.')
}

fn build_tree(dir: &std::path::Path, root: &std::path::Path) -> Vec<FileNode> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut nodes: Vec<FileNode> = entries
        .filter_map(|e| e.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                if is_excluded_dir(&name) {
                    return None;
                }
                let children = build_tree(&path, root);
                // 空ディレクトリは除外
                if children.is_empty() {
                    return None;
                }
                let rel = path.strip_prefix(root).unwrap_or(&path)
                    .to_string_lossy().to_string();
                Some(FileNode {
                    name,
                    path: rel,
                    is_dir: true,
                    size: None,
                    ext: None,
                    children: Some(children),
                })
            } else {
                if is_excluded_file(&name) {
                    return None;
                }
                // コード対応拡張子のみ表示
                let ext = path.extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase());
                let ext_str = ext.as_deref().unwrap_or("");
                // 拡張子なしのファイル（Makefile, Dockerfile 等）も許容
                let is_code = ext.is_none()
                    || CODE_EXTENSIONS.contains(&ext_str);
                if !is_code {
                    return None;
                }
                let size = path.metadata().ok().map(|m| m.len());
                let rel = path.strip_prefix(root).unwrap_or(&path)
                    .to_string_lossy().to_string();
                Some(FileNode {
                    name,
                    path: rel,
                    is_dir: false,
                    size,
                    ext,
                    children: None,
                })
            }
        })
        .collect();

    // ディレクトリ優先、同種はアルファベット順
    nodes.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });
    nodes
}

/// リポジトリのファイルツリーを返す（node_modules / target / .git 等を除外）。
#[tauri::command]
pub async fn file_tree(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<FileNode>, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();

    let nodes = tokio::task::spawn_blocking(move || {
        let root = std::path::Path::new(&local_path);
        build_tree(root, root)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(nodes)
}

/// 指定パスのファイルを読み込んで返す。
/// max_lines を超える場合は truncated: true で先頭のみ返す。
#[tauri::command]
pub async fn file_read(
    project_id: i64,
    path: String,
    max_lines: Option<u32>,
    state: State<'_, AppState>,
) -> std::result::Result<FileContent, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let limit = max_lines.unwrap_or(1000);

    // パストラバーサル防止
    if path.contains("..") {
        return Err(AppError::Validation("不正なパスです".to_string()));
    }

    tokio::task::spawn_blocking(move || {
        let abs = std::path::Path::new(&local_path).join(&path);
        if !abs.exists() {
            return Err(AppError::NotFound(format!("file: {}", path)));
        }

        // バイナリチェック（先頭 512 バイトに NUL があればバイナリ）
        let raw = std::fs::read(&abs)
            .map_err(|e| AppError::Io(format!("読み込み失敗: {}", e)))?;
        if raw[..raw.len().min(512)].contains(&0u8) {
            return Err(AppError::Validation(
                "バイナリファイルは表示できません".to_string(),
            ));
        }

        let text = String::from_utf8_lossy(&raw).to_string();
        let all_lines: Vec<&str> = text.lines().collect();
        let total_lines = all_lines.len() as u32;
        let truncated = total_lines > limit;
        let content = if truncated {
            all_lines[..limit as usize].join("\n")
        } else {
            text
        };

        Ok(FileContent { path, content, truncated, total_lines })
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
}

/// コードファイルを保存し、git commit & push する。
/// commit メッセージ: "src: update {filename}"
#[tauri::command]
pub async fn file_save(
    project_id: i64,
    path: String,
    content: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<CodeSaveResult, AppError> {
    // パストラバーサル防止
    if path.contains("..") {
        return Err(AppError::Validation("不正なパスです".to_string()));
    }

    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();

    let filename = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&path)
        .to_string();
    let commit_msg = format!("src: update {}", filename);

    let _ = app_handle.emit("code_save_progress", CodeSaveProgressPayload {
        path: path.clone(),
        status: "committing".to_string(),
        sha: None,
    });

    let path_clone = path.clone();
    let (commit_sha, branch) = tokio::task::spawn_blocking(move || {
        let svc = GitService::open(&local_path)?;
        let sha = svc.write_and_commit(&path_clone, &content, &commit_msg)?;
        let branch = svc.current_branch().unwrap_or_else(|_| "main".to_string());
        Ok::<_, AppError>((sha, branch))
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    // push（auto モードかつトークンがある場合）
    if project.sync_mode == "auto" {
        let _ = app_handle.emit("code_save_progress", CodeSaveProgressPayload {
            path: path.clone(),
            status: "pushing".to_string(),
            sha: Some(commit_sha.clone()),
        });

        // Keychain → DB フォールバックでトークン取得
        let token_result = tokio::task::spawn_blocking(move || keychain::require_token(project_id))
            .await
            .ok()
            .and_then(|r| r.ok());

        let token = if let Some(t) = token_result {
            Some(t)
        } else {
            // DB フォールバック
            let key = format!("github.token.{}", project_id);
            sqlx::query_scalar::<_, String>(
                "SELECT value FROM app_settings WHERE key = ?"
            )
            .bind(&key)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str::<String>(&v).ok())
        };

        if let Some(tok) = token {
            let local_path2 = project.local_path.clone();
            let branch2 = branch.clone();
            let _sha2 = commit_sha.clone();
            let _path2 = path.clone();
            let _app2 = app_handle.clone();
            let push_result = tokio::task::spawn_blocking(move || {
                let svc = GitService::open(&local_path2)?;
                let mut attempt = 0u32;
                loop {
                    match svc.push(&tok, "origin", &branch2) {
                        Ok(()) => return Ok(()),
                        Err(e) if attempt < 3 => {
                            attempt += 1;
                            std::thread::sleep(std::time::Duration::from_secs(2u64.pow(attempt - 1)));
                        }
                        Err(e) => return Err(e),
                    }
                }
            })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

            match push_result {
                Ok(()) => {
                    let _ = app_handle.emit("code_save_progress", CodeSaveProgressPayload {
                        path: path.clone(),
                        status: "synced".to_string(),
                        sha: Some(commit_sha.clone()),
                    });
                    return Ok(CodeSaveResult { sha: commit_sha, push_status: "synced".to_string() });
                }
                Err(_e) => {
                    let _ = app_handle.emit("code_save_progress", CodeSaveProgressPayload {
                        path: path.clone(),
                        status: "push_failed".to_string(),
                        sha: Some(commit_sha.clone()),
                    });
                    return Ok(CodeSaveResult { sha: commit_sha, push_status: "push_failed".to_string() });
                }
            }
        }
    }

    let _ = app_handle.emit("code_save_progress", CodeSaveProgressPayload {
        path: path.clone(),
        status: "synced".to_string(),
        sha: Some(commit_sha.clone()),
    });
    Ok(CodeSaveResult { sha: commit_sha, push_status: "pending_push".to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_tree(dir: &TempDir) -> Vec<FileNode> {
        let root = dir.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
        std::fs::write(root.join("src/lib.rs"), "pub mod foo;").unwrap();
        std::fs::create_dir_all(root.join("node_modules/foo")).unwrap();
        std::fs::write(root.join("node_modules/foo/index.js"), "").unwrap();
        std::fs::write(root.join("Cargo.toml"), "[package]").unwrap();
        build_tree(root, root)
    }

    #[test]
    fn test_node_modules_excluded() {
        let dir = TempDir::new().unwrap();
        let nodes = make_tree(&dir);
        assert!(!nodes.iter().any(|n| n.name == "node_modules"),
            "node_modules は除外されるべき");
    }

    #[test]
    fn test_src_dir_included() {
        let dir = TempDir::new().unwrap();
        let nodes = make_tree(&dir);
        assert!(nodes.iter().any(|n| n.name == "src" && n.is_dir),
            "src ディレクトリは含まれるべき");
    }

    #[test]
    fn test_dirs_before_files() {
        let dir = TempDir::new().unwrap();
        let nodes = make_tree(&dir);
        // ディレクトリが先に来る
        let first_file_pos = nodes.iter().position(|n| !n.is_dir).unwrap_or(nodes.len());
        let last_dir_pos = nodes.iter().rposition(|n| n.is_dir).unwrap_or(0);
        assert!(last_dir_pos < first_file_pos || first_file_pos == nodes.len(),
            "ディレクトリはファイルより前に来るべき");
    }

    #[test]
    fn test_children_populated_for_dirs() {
        let dir = TempDir::new().unwrap();
        let nodes = make_tree(&dir);
        let src = nodes.iter().find(|n| n.name == "src").unwrap();
        let children = src.children.as_ref().unwrap();
        assert_eq!(children.len(), 2, "src 配下に2ファイル");
        assert!(children.iter().any(|c| c.name == "main.rs"));
        assert!(children.iter().any(|c| c.name == "lib.rs"));
    }
}
