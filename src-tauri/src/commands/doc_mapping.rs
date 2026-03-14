use std::path::Path;

use tauri::State;

use crate::doc_mapping::{
    diff_analyzer,
    index::{build_index, find_docs_for_source, write_index},
    staleness::check_all_staleness,
    types::{AffectedDoc, DocIndex, DocStaleness, SourceContent, UpdateContext},
};
use crate::error::AppError;
use crate::state::AppState;

/// ドキュメントマッピングインデックスを再生成して返す
#[tauri::command]
pub async fn rebuild_doc_index(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<DocIndex, AppError> {
    let repo = Path::new(&project_path);
    let docs_dir = repo.join("docs");

    let index = build_index(&docs_dir, repo)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // .doc-map.yaml を docs/ 直下に書き出す
    let out = docs_dir.join(".doc-map.yaml");
    let _ = write_index(&index, &out); // 書き出し失敗は無視（読み取り専用 FS 対策）

    Ok(index)
}

/// 指定コミット範囲の変更で影響を受ける設計書を返す
#[tauri::command]
pub async fn find_affected_docs_cmd(
    project_path: String,
    from_commit: String,
    to_commit: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<AffectedDoc>, AppError> {
    let repo = Path::new(&project_path);
    let docs_dir = repo.join("docs");

    let index = build_index(&docs_dir, repo)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let results = diff_analyzer::find_affected_docs(
        repo,
        &index,
        &from_commit,
        to_commit.as_deref(),
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(results)
}

/// 設計書の鮮度ステータスを一括チェックする
#[tauri::command]
pub async fn check_doc_staleness(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<Vec<DocStaleness>, AppError> {
    let repo = Path::new(&project_path);
    let docs_dir = repo.join("docs");

    let index = build_index(&docs_dir, repo)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let results = check_all_staleness(repo, &docs_dir, &index)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(results)
}

/// 指定設計書の更新コンテキスト（差分サマリー＋関連ソース内容）を生成する
#[tauri::command]
pub async fn generate_update_context(
    project_path: String,
    doc_path: String,
    _state: State<'_, AppState>,
) -> Result<UpdateContext, AppError> {
    let repo = Path::new(&project_path);
    let docs_dir = repo.join("docs");
    let abs_doc = repo.join(&doc_path);

    let index = build_index(&docs_dir, repo)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // 設計書の現在内容を読み込む
    let doc_content = std::fs::read_to_string(&abs_doc)
        .map_err(|e| AppError::Internal(format!("設計書の読み込み失敗: {}", e)))?;

    // last_synced_commit を frontmatter から取得
    let (last_synced_commit, diff_summary) = {
        let fm = crate::doc_mapping::parser::parse_doc_file(&abs_doc)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let last = fm.last_synced_commit.clone();

        let summary = if let Some(ref sha) = last {
            generate_diff_summary(repo, sha)
                .unwrap_or_else(|_| "差分の取得に失敗しました".to_string())
        } else {
            "last_synced_commit が未設定のため差分を取得できません".to_string()
        };
        (last, summary)
    };

    // 関連ソースの内容を収集
    let related_entries = find_docs_for_source(&index, &doc_path);
    let mut source_contents: Vec<SourceContent> = Vec::new();

    // この設計書に直接マッピングされているソースを取得
    if let Some(entry) = index.doc_index.get(&doc_path) {
        for src_path in &entry.sources {
            let full = repo.join(src_path.trim_start_matches('/'));
            let content = if full.is_file() {
                std::fs::read_to_string(&full).unwrap_or_else(|_| "(読み込み失敗)".to_string())
            } else {
                "(ディレクトリ)".to_string()
            };
            source_contents.push(SourceContent {
                path: src_path.clone(),
                content,
            });
        }
    }

    // related_entries から追加（重複除去）
    for entry in related_entries {
        let already = source_contents.iter().any(|sc| sc.path == entry.doc);
        if !already {
            source_contents.push(SourceContent {
                path: entry.doc.clone(),
                content: "(参照)".to_string(),
            });
        }
    }

    Ok(UpdateContext {
        doc_path,
        doc_content,
        diff_summary,
        source_contents,
        last_synced_commit,
    })
}

/// last_synced_commit..HEAD の簡易差分サマリーを生成する
fn generate_diff_summary(repo_path: &Path, from_commit: &str) -> Result<String, git2::Error> {
    let repo = git2::Repository::open(repo_path)?;
    let from_oid = repo.revparse_single(from_commit)?.peel_to_commit()?.id();
    let head = repo.head()?.peel_to_commit()?;
    let from_tree = repo.find_commit(from_oid)?.tree()?;
    let to_tree = head.tree()?;
    let diff = repo.diff_tree_to_tree(Some(&from_tree), Some(&to_tree), None)?;

    let stats = diff.stats()?;
    let mut lines = vec![format!(
        "変更ファイル数: {} (+{} / -{})",
        stats.files_changed(),
        stats.insertions(),
        stats.deletions()
    )];

    for (i, delta) in diff.deltas().enumerate() {
        if i >= 20 {
            lines.push("... (以下省略)".to_string());
            break;
        }
        let path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let status = match delta.status() {
            git2::Delta::Added => "A",
            git2::Delta::Deleted => "D",
            git2::Delta::Modified => "M",
            git2::Delta::Renamed => "R",
            _ => "?",
        };
        lines.push(format!("  {} {}", status, path));
    }

    Ok(lines.join("\n"))
}
