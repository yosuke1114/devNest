use serde::{Deserialize, Serialize};

/// リポジトリのファイルツリーノード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    /// プロジェクトルートからの相対パス（例: "src/main.rs"）
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub ext: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// ファイル読み込み結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    /// 行数制限で切り捨てられたか
    pub truncated: bool,
    pub total_lines: u32,
}

/// コードファイル保存結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeSaveResult {
    pub sha: String,
    pub push_status: String, // "synced" | "pending_push" | "push_failed"
}
