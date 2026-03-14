/// 後方互換レイヤー
///
/// `policy::engine` および `policy::rules` に移植済み。
/// 既存コードが `crate::mcp::policy::*` を参照している場合のために re-export する。
pub use crate::policy::engine::{PolicyEngine};
pub use crate::policy::rules::{PolicyConfig, RiskLevel, ToolPolicy};
