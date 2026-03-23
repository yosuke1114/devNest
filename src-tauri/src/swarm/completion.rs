/// PTY 出力から Claude Code タスク完了を検出するモジュール。
///
/// 検出の優先順位:
///   1. センチネル文字列（__SWARM_TASK_DONE__）— 対話モード専用
///   2. Claude 完了マーカー（✓ / Task complete / etc.）
///   3. シェルプロンプト末尾検出（バッチ完了後の確認用）
use super::manager::SWARM_DONE_SENTINEL;

/// CompletionDetector の検出結果
#[derive(Debug, Clone, PartialEq)]
pub enum CompletionResult {
    Done,
    Error,
}

/// PTY 出力パターンに基づくタスク完了検出器
pub struct CompletionDetector {
    done_patterns: Vec<String>,
    error_patterns: Vec<String>,
    shell_prompt_suffixes: Vec<String>,
}

impl Default for CompletionDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl CompletionDetector {
    pub fn new() -> Self {
        Self {
            done_patterns: vec![
                SWARM_DONE_SENTINEL.to_string(),
                "✓ ".to_string(),
                "Task complete".to_string(),
                "Task completed".to_string(),
                "Completed successfully".to_string(),
                // Claude バッチモード完了サマリー（PTY環境で process が終了しない場合の検出用）
                // 例: "* Worked for 2m 6s", "* Crunched for 3m 1s", "* Sautéed for 1m 30s"
                "* Worked for ".to_string(),
                "* Crunched for ".to_string(),
                "* Sautéed for ".to_string(),
                "* Cooked for ".to_string(),
                "* Baked for ".to_string(),
                "* Brewed for ".to_string(),
            ],
            error_patterns: vec![
                "API Error".to_string(),
                "Rate limit".to_string(),
                "Context length".to_string(),
            ],
            shell_prompt_suffixes: vec![
                "$ ".to_string(),
                "% ".to_string(),
                "❯ ".to_string(),
                "# ".to_string(),
            ],
        }
    }

    /// PTY 出力データを検査して完了状態を検出する。
    /// - `Some(Done)` : タスク完了
    /// - `Some(Error)` : エラー完了
    /// - `None` : 継続中
    pub fn check(&self, data: &str) -> Option<CompletionResult> {
        // 完了パターン
        if self.done_patterns.iter().any(|p| data.contains(p.as_str())) {
            return Some(CompletionResult::Done);
        }
        // エラーパターン
        if self.error_patterns.iter().any(|p| data.contains(p.as_str())) {
            return Some(CompletionResult::Error);
        }
        None
    }

    /// データ末尾にシェルプロンプトが現れているか確認する。
    /// バッチモードで claude -p が終了した後にシェルに戻った場合に検出する。
    pub fn is_shell_prompt_visible(&self, data: &str) -> bool {
        let trimmed = data.trim_end_matches('\n').trim_end_matches('\r');
        self.shell_prompt_suffixes
            .iter()
            .any(|p| trimmed.ends_with(p.as_str()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_sentinel() {
        let d = CompletionDetector::new();
        let result = d.check(&format!("output\n{}\n", SWARM_DONE_SENTINEL));
        assert_eq!(result, Some(CompletionResult::Done));
    }

    #[test]
    fn detects_checkmark() {
        let d = CompletionDetector::new();
        assert_eq!(d.check("✓ All done"), Some(CompletionResult::Done));
    }

    #[test]
    fn detects_error_pattern() {
        let d = CompletionDetector::new();
        assert_eq!(d.check("API Error: 500"), Some(CompletionResult::Error));
    }

    #[test]
    fn returns_none_for_normal_output() {
        let d = CompletionDetector::new();
        assert_eq!(d.check("Running tests..."), None);
    }

    #[test]
    fn detects_shell_prompt() {
        let d = CompletionDetector::new();
        assert!(d.is_shell_prompt_visible("user@host:~/project$ "));
        assert!(d.is_shell_prompt_visible("~/project❯ "));
        assert!(!d.is_shell_prompt_visible("running claude..."));
    }
}
