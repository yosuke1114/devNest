use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Frontmatter 型定義 ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocFrontmatter {
    pub title: String,
    pub doc_type: DocType,
    pub version: String,
    pub last_synced_commit: Option<String>,
    pub status: DocStatus,
    pub mapping: Option<DocMapping>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DocType {
    Architecture,
    ModuleStructure,
    ScreenDesign,
    ApiDefinition,
    ErrorHandling,
    /// フロントマターはあるが doc_type が未知の場合のフォールバック
    #[serde(other)]
    Other,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DocStatus {
    Current,
    Outdated,
    Draft,
    Archived,
    /// 未設定の場合のフォールバック
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocMapping {
    #[serde(default)]
    pub sources: Vec<SourceMapping>,
    pub sections: Option<Vec<SectionMapping>>,
    pub depends_on: Option<Vec<DocDependency>>,
    pub defines: Option<Vec<InterfaceDefinition>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceMapping {
    pub path: String,
    pub scope: SourceScope,
    pub description: Option<String>,
    pub functions: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SourceScope {
    Directory,
    File,
    Function,
    Module,
    Type,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SectionMapping {
    pub heading: String,
    pub sources: Vec<SourceMapping>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocDependency {
    pub doc: String,
    pub relationship: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InterfaceDefinition {
    #[serde(rename = "type")]
    pub def_type: String,
    pub names: Vec<String>,
}

// ─── インデックス型定義 ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DocIndex {
    pub generated_at: DateTime<Utc>,
    pub generated_from_commit: String,
    pub source_index: HashMap<String, Vec<SourceIndexEntry>>,
    pub doc_index: HashMap<String, DocIndexEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceIndexEntry {
    pub doc: String,
    pub sections: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocIndexEntry {
    pub sources: Vec<String>,
    pub depends_on: Vec<String>,
}

// ─── Diff 分析型定義 ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AffectedDoc {
    pub doc_path: String,
    pub affected_sections: Vec<String>,
    pub changed_sources: Vec<ChangedSource>,
    pub change_severity: ChangeSeverity,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChangedSource {
    pub path: String,
    pub change_type: ChangeType,
    pub lines_added: u32,
    pub lines_deleted: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ChangeType {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ChangeSeverity {
    /// ドキュメント変更や設定変更のみ
    Low,
    /// 既存ファイルの変更
    Medium,
    /// ファイルの追加/削除/リネーム
    High,
}

// ─── 鮮度型定義 ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocStaleness {
    pub doc_path: String,
    pub current_status: DocStatus,
    pub staleness_score: f64,
    pub recommended_status: DocStatus,
    pub days_since_sync: u32,
    pub commits_since_sync: u32,
    pub lines_changed_in_sources: u32,
    pub total_source_lines: u32,
}

// ─── UpdateContext 型定義 ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateContext {
    pub doc_path: String,
    pub doc_content: String,
    pub diff_summary: String,
    pub source_contents: Vec<SourceContent>,
    pub last_synced_commit: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceContent {
    pub path: String,
    pub content: String,
}
