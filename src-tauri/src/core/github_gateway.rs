/// GitHub API ゲートウェイ
///
/// `services/github.rs` の直接 API 呼び出しをラップする薄いファサード層。
/// Phase 7 以降で MCP 経由への切り替えを可能にする。

pub enum GatewayMode {
    /// services/github.rs を使用（現在の実装）
    DirectApi,
    /// Phase 7 以降で追加予定
    ViaMcp,
}

pub struct GitHubGateway {
    mode: GatewayMode,
}

impl GitHubGateway {
    /// 常に DirectApi モードで初期化する。
    pub fn new() -> Self {
        Self {
            mode: GatewayMode::DirectApi,
        }
    }

    /// 現在のゲートウェイモードが DirectApi かどうかを返す。
    pub fn is_direct_api(&self) -> bool {
        matches!(self.mode, GatewayMode::DirectApi)
    }
}

impl Default for GitHubGateway {
    fn default() -> Self {
        Self::new()
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_initializes_direct_api_mode() {
        let gw = GitHubGateway::new();
        assert!(
            gw.is_direct_api(),
            "GitHubGateway::new() should initialize with DirectApi mode"
        );
    }

    #[test]
    fn test_default_is_direct_api() {
        let gw = GitHubGateway::default();
        assert!(gw.is_direct_api());
    }
}
