use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;
use tauri::AppHandle;

use super::methods::{handle_request, ApiRequest, ApiResponse};

pub struct DevNestApiServer {
    pub socket_path: PathBuf,
}

impl DevNestApiServer {
    pub fn socket_path() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".devnest").join("devnest.sock")
    }

    pub async fn start(app: AppHandle) -> Result<Self, String> {
        let socket_path = Self::socket_path();

        // ~/.devnest/ ディレクトリを作成
        if let Some(parent) = socket_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // 既存ソケットファイルがあれば削除
        if socket_path.exists() {
            std::fs::remove_file(&socket_path).map_err(|e| e.to_string())?;
        }

        let listener = UnixListener::bind(&socket_path).map_err(|e| e.to_string())?;
        let path_clone = socket_path.clone();

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let app_clone = app.clone();
                        tokio::spawn(handle_connection(stream, app_clone));
                    }
                    Err(e) => {
                        eprintln!("[DevNest API] accept error: {}", e);
                        break;
                    }
                }
            }
            // 終了時にソケットファイルを削除
            let _ = std::fs::remove_file(&path_clone);
        });

        Ok(Self { socket_path })
    }
}

async fn handle_connection(stream: tokio::net::UnixStream, app: AppHandle) {
    let (reader, mut writer) = tokio::io::split(stream);
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let response = match serde_json::from_str::<ApiRequest>(&line) {
            Ok(request) => handle_request(request, &app).await,
            Err(e) => ApiResponse::error(None, &format!("Parse error: {}", e)),
        };
        let mut json = serde_json::to_string(&response).unwrap_or_default();
        json.push('\n');
        if writer.write_all(json.as_bytes()).await.is_err() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_path_is_in_devnest_dir() {
        let path = DevNestApiServer::socket_path();
        assert!(path.to_string_lossy().contains(".devnest"));
        assert!(path.to_string_lossy().ends_with("devnest.sock"));
    }
}
