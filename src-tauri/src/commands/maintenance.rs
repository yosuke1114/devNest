use tauri::State;
use tokio::task::spawn_blocking;

use crate::error::AppError;
use crate::maintenance::{
    coverage::{run_coverage_scan, CoverageReport},
    dependency::{scan_dependencies, DependencyReport},
    refactor::{analyze_refactor_candidates, RefactorCandidate},
    tech_debt::{save_snapshot, scan_tech_debt, TechDebtReport},
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
        let report = scan_tech_debt(path);
        save_snapshot(path, &report);
        report
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
