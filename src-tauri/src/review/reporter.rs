/// レビュー結果の整形
///
/// `ReviewResult` を人間が読みやすい Markdown 形式に変換するユーティリティ。
use super::findings::{FindingSeverity, ReviewFinding};

/// レビュー結果のサマリーを Markdown 文字列として整形する。
pub fn format_findings_as_markdown(findings: &[ReviewFinding]) -> String {
    if findings.is_empty() {
        return "No findings.\n".to_string();
    }

    let mut out = String::new();
    out.push_str("## Review Findings\n\n");

    let mut sorted = findings.to_vec();
    sorted.sort_by(|a, b| b.severity.cmp(&a.severity));

    for f in &sorted {
        let severity_label = match f.severity {
            FindingSeverity::Critical => "🔴 CRITICAL",
            FindingSeverity::High => "🟠 HIGH",
            FindingSeverity::Medium => "🟡 MEDIUM",
            FindingSeverity::Low => "🔵 LOW",
        };
        out.push_str(&format!(
            "### [{severity_label}] {}\n",
            f.file
        ));
        out.push_str(&format!("**Message:** {}\n", f.message));
        if let Some(fix) = &f.suggested_fix {
            out.push_str(&format!("**Suggested Fix:** {}\n", fix));
        }
        out.push('\n');
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::review::findings::{FindingCategory, FindingSeverity, ReviewFinding};

    #[test]
    fn test_format_empty_findings() {
        let result = format_findings_as_markdown(&[]);
        assert_eq!(result, "No findings.\n");
    }

    #[test]
    fn test_format_findings_contains_severity() {
        let findings = vec![ReviewFinding {
            file: "src/main.rs".to_string(),
            line_start: None,
            line_end: None,
            severity: FindingSeverity::Critical,
            category: FindingCategory::Security,
            message: "SQL injection risk".to_string(),
            suggested_fix: None,
        }];
        let result = format_findings_as_markdown(&findings);
        assert!(result.contains("CRITICAL"));
        assert!(result.contains("SQL injection risk"));
    }
}
