use crate::error::{AppError, Result};
use tokio::sync::oneshot;

const CALLBACK_PORT: u16 = 4649;

/// ローカル HTTP サーバーを立ち上げ、OAuth コールバックの `code` を受け取る。
/// GitHub が `http://localhost:4649/callback?code=xxx` にリダイレクトしてくる想定。
pub async fn wait_for_callback(tx: oneshot::Sender<String>) -> Result<()> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let listener = TcpListener::bind(format!("127.0.0.1:{}", CALLBACK_PORT))
        .await
        .map_err(|e| AppError::Internal(format!("コールバックサーバー起動失敗: {}", e)))?;

    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| AppError::Internal(format!("コールバック受信失敗: {}", e)))?;

    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await.unwrap_or(0);
    let request = String::from_utf8_lossy(&buf[..n]);

    // "GET /callback?code=xxx HTTP/1.1" の形式からコードを抽出
    let code = extract_code(&request).ok_or_else(|| {
        AppError::Internal("OAuth code が見つかりません".to_string())
    })?;

    // 成功レスポンスを返す
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
        <html><head><meta charset=\"utf-8\"></head><body>\
        <h1>&#35469;&#35388;&#23436;&#20102;</h1>\
        <p>&#12371;&#12398;&#12454;&#12451;&#12531;&#12489;&#12454;&#12434;&#38281;&#12376;&#12390;&#12367;&#12384;&#12373;&#12356;&#12290;</p>\
        </body></html>";
    let _ = stream.write_all(response.as_bytes()).await;

    tx.send(code)
        .map_err(|_| AppError::Internal("コード送信失敗".to_string()))
}

fn extract_code(request: &str) -> Option<String> {
    let line = request.lines().next()?;
    // "GET /callback?code=xxx&state=yyy HTTP/1.1"
    let path = line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if kv.next() == Some("code") {
            return kv.next().map(|v| v.to_string());
        }
    }
    None
}

/// GitHub OAuth 認証 URL を生成する
pub fn auth_url(client_id: &str) -> String {
    format!(
        "https://github.com/login/oauth/authorize\
         ?client_id={}\
         &redirect_uri=http://localhost:{}/callback\
         &scope=repo,read:user",
        client_id, CALLBACK_PORT
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: extract_code が正しく code を取り出すこと
    #[test]
    fn test_extract_code_from_request() {
        let req = "GET /callback?code=abc123&state=xyz HTTP/1.1\r\nHost: localhost\r\n";
        let code = extract_code(req);
        assert_eq!(code, Some("abc123".to_string()));
    }

    // 🔴 Red: code なしのリクエストは None を返すこと
    #[test]
    fn test_extract_code_missing_returns_none() {
        let req = "GET /callback?state=xyz HTTP/1.1\r\n";
        assert_eq!(extract_code(req), None);
    }

    // 🔴 Red: auth_url が client_id を含んでいること
    #[test]
    fn test_auth_url_contains_client_id() {
        let url = auth_url("my_client_id");
        assert!(url.contains("my_client_id"));
        assert!(url.contains("github.com/login/oauth/authorize"));
        assert!(url.contains("scope=repo"));
    }

    // 🔴 Red: auth_url がコールバックポートを含むこと
    #[test]
    fn test_auth_url_contains_callback_port() {
        let url = auth_url("cid");
        assert!(url.contains(&CALLBACK_PORT.to_string()));
    }
}
