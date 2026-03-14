use std::path::PathBuf;
use tauri::State;
use tokio::task::spawn_blocking;

use crate::error::AppError;
use crate::maintenance::{
    coverage::{run_coverage_scan, CoverageReport},
    dependency::{scan_dependencies, DependencyReport},
    refactor::{analyze_refactor_candidates, RefactorCandidate},
    tech_debt::{scan_tech_debt, TechDebtReport},
};
use crate::state::AppState;

/// 依存ライブラリのスキャン
/// cargo outdated / npm outdated などを spawn_blocking で実行し async ランタイムをブロックしない
#[tauri::command]
pub async fn maintenance_scan_dependencies(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<DependencyReport, AppError> {
    spawn_blocking(move || {
        let path = std::path::Path::new(&project_path);
        scan_dependencies(path).map_err(|e| AppError::Internal(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
}

/// 技術的負債スキャン（ファイル走査のみ。外部ツール不使用）
#[tauri::command]
pub async fn maintenance_scan_tech_debt(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<TechDebtReport, AppError> {
    spawn_blocking(move || {
        let path = std::path::Path::new(&project_path);
        scan_tech_debt(path)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))
}

/// テストカバレッジスキャン
/// cargo tarpaulin を spawn_blocking で実行し async ランタイムをブロックしない
#[tauri::command]
pub async fn maintenance_run_coverage(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<CoverageReport, AppError> {
    spawn_blocking(move || {
        let path = std::path::Path::new(&project_path);
        run_coverage_scan(path)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))
}

/// カバレッジ生成コマンド
/// tokio::process::Command を使い非同期でテストを実行する。
/// Tauri の async ランタイムをブロックしない。
/// target: "node" | "rust" | "all"
#[tauri::command]
pub async fn maintenance_generate_coverage(
    project_path: String,
    target: String,
    _state: State<'_, AppState>,
) -> Result<CoverageReport, AppError> {
    let path = PathBuf::from(&project_path);

    if target == "node" || target == "all" {
        let npm_cmd = if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" };
        // テスト失敗でも coverage は生成されるので exit code は無視
        let _ = tokio::process::Command::new(npm_cmd)
            .args(["run", "test:coverage"])
            .current_dir(&path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    if target == "rust" || target == "all" {
        let cargo_toml = path.join("src-tauri").join("Cargo.toml");
        let manifest = if cargo_toml.exists() {
            cargo_toml.to_string_lossy().to_string()
        } else {
            path.join("Cargo.toml").to_string_lossy().to_string()
        };
        let output = tokio::process::Command::new("cargo")
            .args(["tarpaulin", "--out", "Json", "--manifest-path", &manifest, "--skip-clean"])
            .current_dir(&path)
            .output()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // 出力を .devnest/tarpaulin-report.json に保存
        let devnest_dir = path.join(".devnest");
        tokio::fs::create_dir_all(&devnest_dir).await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        tokio::fs::write(devnest_dir.join("tarpaulin-report.json"), &output.stdout).await
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    // 生成されたファイルを読んで返す
    let path_clone = path.clone();
    spawn_blocking(move || run_coverage_scan(&path_clone))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))
}

/// リファクタリング候補分析（git log 走査）
#[tauri::command]
pub async fn maintenance_refactor_candidates(
    project_path: String,
    top_n: usize,
    _state: State<'_, AppState>,
) -> Result<Vec<RefactorCandidate>, AppError> {
    spawn_blocking(move || {
        let path = std::path::Path::new(&project_path);
        let top = if top_n == 0 { 20 } else { top_n };
        analyze_refactor_candidates(path, top)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))
}
