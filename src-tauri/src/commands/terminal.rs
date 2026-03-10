use std::io::Write;
use tauri::{AppHandle, Emitter, State};
use crate::db;
use crate::error::AppError;
use crate::models::terminal::{TerminalDonePayload, TerminalSession};
use crate::state::{AppState, PtySessionHandle};

// ─── terminal_session_start ───────────────────────────────────────────────────

/// Claude Code CLI を PTY で起動してセッションを開始する。
#[tauri::command]
pub async fn terminal_session_start(
    project_id: i64,
    _prompt_summary: Option<String>,
    issue_number: Option<i64>,
    issue_id: Option<i64>,
    context_doc_ids: Option<Vec<i64>>,
    branch_name: Option<String>,
    request_changes_comment: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<TerminalSession, AppError> {
    let project = db::project::find(&state.db, project_id).await?;

    // claude コマンドが存在するか確認
    which::which("claude").map_err(|_| {
        AppError::Internal(
            "Claude Code CLI が見つかりません。`npm install -g @anthropic-ai/claude-code` でインストールしてください。".to_string(),
        )
    })?;

    // 既存セッションを強制終了
    {
        let mut guard = state
            .pty_session
            .lock()
            .map_err(|_| AppError::Internal("PTY lock poisoned".to_string()))?;
        *guard = None;
    }

    // DB にセッション作成
    let session = db::terminal::create_session(&state.db, project_id).await?;
    let session_id = session.id;

    // PTY セッションを別スレッドで開始
    let pty_arc = state.pty_session.clone();
    let db_clone = state.db.clone();
    let local_path = project.local_path.clone();
    let tokio_handle = tokio::runtime::Handle::current();

    std::thread::spawn(move || {
        use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

        let pty_system = NativePtySystem::default();
        let pair = match pty_system.openpty(PtySize {
            rows: 24,
            cols: 200,
            pixel_width: 0,
            pixel_height: 0,
        }) {
            Ok(p) => p,
            Err(e) => {
                let _ = app.emit(
                    "terminal_error",
                    serde_json::json!({ "session_id": session_id, "error": e.to_string() }),
                );
                return;
            }
        };

        let mut cmd = CommandBuilder::new("claude");
        cmd.cwd(&local_path);

        // If re-running for request changes, checkout the specified branch first
        if let Some(ref branch) = branch_name {
            let _ = std::process::Command::new("git")
                .args(["checkout", branch])
                .current_dir(&local_path)
                .output();
        }

        let mut child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "terminal_error",
                    serde_json::json!({ "session_id": session_id, "error": e.to_string() }),
                );
                return;
            }
        };

        // slave は子プロセスが継承したので drop して良い
        drop(pair.slave);

        let writer = match pair.master.take_writer() {
            Ok(w) => w,
            Err(e) => {
                let _ = app.emit(
                    "terminal_error",
                    serde_json::json!({ "session_id": session_id, "error": e.to_string() }),
                );
                return;
            }
        };

        // ライターを AppState に格納
        {
            if let Ok(mut guard) = pty_arc.lock() {
                *guard = Some(PtySessionHandle { session_id, writer });
            }
        }

        // PTY 出力を読み取って frontend にストリーミング
        let mut reader = match pair.master.try_clone_reader() {
            Ok(r) => r,
            Err(_) => return,
        };
        let mut buf = [0u8; 4096];
        let mut output_log = String::new();

        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    // 出力ログに追記（最大 100KB）
                    if output_log.len() < 100_000 {
                        output_log.push_str(&text);
                    }
                    let _ = app.emit(
                        "terminal_output",
                        serde_json::json!({ "session_id": session_id, "data": text }),
                    );
                }
            }
        }

        // プロセス終了を待つ
        let exit_code = child
            .wait()
            .map(|s| if s.success() { 0i64 } else { 1i64 })
            .unwrap_or(1);

        // PTY ライターを解放
        {
            if let Ok(mut guard) = pty_arc.lock() {
                *guard = None;
            }
        }

        // git 情報を取得（changed files, branch, commit sha）
        let (branch, commit_sha, changed_files) =
            get_git_info_sync(&local_path).unwrap_or_default();
        let has_doc_changes = changed_files.iter().any(|f| f.ends_with(".md"));

        // DB 更新
        tokio_handle.block_on(async {
            let _ = db::terminal::complete_session(
                &db_clone,
                session_id,
                exit_code,
                Some(&branch),
                has_doc_changes,
                &output_log,
            )
            .await;
        });

        // terminal_done イベント送信
        let payload = TerminalDonePayload {
            session_id,
            branch_name: branch,
            commit_sha,
            has_doc_changes,
            changed_files,
            exit_code,
        };
        let _ = app.emit("terminal_done", payload);
    });

    Ok(session)
}

// ─── terminal_session_stop ────────────────────────────────────────────────────

/// アクティブなターミナルセッションに Ctrl+C を送信して停止する。
#[tauri::command]
pub async fn terminal_session_stop(
    session_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let sent = {
        let mut guard = state
            .pty_session
            .lock()
            .map_err(|_| AppError::Internal("PTY lock".to_string()))?;
        if let Some(ref mut handle) = *guard {
            if handle.session_id == session_id {
                // Ctrl+C (0x03)
                let _ = handle.writer.write_all(&[0x03]);
                true
            } else {
                false
            }
        } else {
            false
        }
    };

    if !sent {
        db::terminal::abort_session(&state.db, session_id).await?;
    }

    Ok(())
}

// ─── terminal_input_send ─────────────────────────────────────────────────────

/// ターミナルに文字列を送信する。
#[tauri::command]
pub async fn terminal_input_send(
    session_id: i64,
    input: String,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let mut guard = state
        .pty_session
        .lock()
        .map_err(|_| AppError::Internal("PTY lock".to_string()))?;
    if let Some(ref mut handle) = *guard {
        if handle.session_id == session_id {
            handle
                .writer
                .write_all(input.as_bytes())
                .map_err(|e| AppError::Internal(e.to_string()))?;
            return Ok(());
        }
    }
    Err(AppError::NotFound(format!("session id={}", session_id)))
}

// ─── terminal_session_list ────────────────────────────────────────────────────

/// ターミナルセッション一覧を返す。
#[tauri::command]
pub async fn terminal_session_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<TerminalSession>, AppError> {
    db::terminal::list_sessions(&state.db, project_id, 10).await
}

// ─── git ヘルパー ─────────────────────────────────────────────────────────────

/// 同期的に git 情報を取得する（branch, commit_sha, changed_files）。
fn get_git_info_sync(path: &str) -> Option<(String, String, Vec<String>)> {
    use git2::Repository;
    let repo = Repository::open(path).ok()?;

    let head = repo.head().ok()?;
    let branch = head
        .shorthand()
        .unwrap_or("HEAD")
        .to_string();

    let commit = head.peel_to_commit().ok()?;
    let commit_sha = commit.id().to_string()[..7].to_string();

    // 直前のコミットとの diff でファイル一覧を取得
    let changed_files = if let Some(parent) = commit.parents().next() {
        let old_tree = parent.tree().ok()?;
        let new_tree = commit.tree().ok()?;
        let diff = repo.diff_tree_to_tree(Some(&old_tree), Some(&new_tree), None).ok()?;
        diff.deltas()
            .filter_map(|d| d.new_file().path().map(|p| p.to_string_lossy().to_string()))
            .collect()
    } else {
        vec![]
    };

    Some((branch, commit_sha, changed_files))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect, migrations, terminal as db_terminal};
    use crate::state::AppState;
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let url = format!("sqlite:{}", dir.path().join("test.db").display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    async fn insert_project(state: &AppState) -> i64 {
        let now = chrono::Utc::now().to_rfc3339();
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('P','o','r','/tmp/p', ?, ?) RETURNING id",
        )
        .bind(&now)
        .bind(&now)
        .fetch_one(&state.db)
        .await
        .unwrap();
        row.0
    }

    // 🔴 Red: TerminalDonePayload が正しくシリアライズされること
    #[test]
    fn test_terminal_done_payload() {
        let p = TerminalDonePayload {
            session_id: 1,
            branch_name: "feat/42".to_string(),
            commit_sha: "abc1234".to_string(),
            has_doc_changes: false,
            changed_files: vec!["src/main.rs".to_string()],
            exit_code: 0,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("branch_name"));
        assert!(json.contains("has_doc_changes"));
    }

    // 🔴 Red: terminal_session_list が空プロジェクトで空を返すこと
    #[tokio::test]
    async fn test_terminal_session_list_empty() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let sessions = db_terminal::list_sessions(&state.db, pid, 20).await.unwrap();
        assert!(sessions.is_empty());
    }

    // 🔴 Red: セッション作成後 status が 'running' であること
    #[tokio::test]
    async fn test_terminal_session_create_running() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let session = db_terminal::create_session(&state.db, pid).await.unwrap();
        assert_eq!(session.status, "running");
        assert_eq!(session.project_id, pid);
        assert!(session.exit_code.is_none());
        assert!(session.ended_at.is_none());
    }

    // 🔴 Red: complete_session で exit_code=0 のとき status が 'completed' になること
    #[tokio::test]
    async fn test_terminal_session_complete_success() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let session = db_terminal::create_session(&state.db, pid).await.unwrap();

        db_terminal::complete_session(
            &state.db, session.id, 0, Some("feat/42"), true, "output",
        )
        .await
        .unwrap();

        let updated = db_terminal::find(&state.db, session.id).await.unwrap();
        assert_eq!(updated.status, "completed");
        assert_eq!(updated.exit_code, Some(0));
        assert!(updated.has_doc_changes);
        assert_eq!(updated.branch_name.as_deref(), Some("feat/42"));
    }

    // 🔴 Red: complete_session で exit_code!=0 のとき status が 'failed' になること
    #[tokio::test]
    async fn test_terminal_session_complete_failed() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let session = db_terminal::create_session(&state.db, pid).await.unwrap();

        db_terminal::complete_session(
            &state.db, session.id, 1, None, false, "",
        )
        .await
        .unwrap();

        let updated = db_terminal::find(&state.db, session.id).await.unwrap();
        assert_eq!(updated.status, "failed");
        assert_eq!(updated.exit_code, Some(1));
        assert!(!updated.has_doc_changes);
    }

    // 🔴 Red: abort_session で status が 'aborted' になること
    #[tokio::test]
    async fn test_terminal_session_abort() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let session = db_terminal::create_session(&state.db, pid).await.unwrap();

        db_terminal::abort_session(&state.db, session.id).await.unwrap();

        let updated = db_terminal::find(&state.db, session.id).await.unwrap();
        assert_eq!(updated.status, "aborted");
        assert!(updated.ended_at.is_some());
    }

    // 🔴 Red: list_sessions が複数セッションを新しい順で返すこと
    #[tokio::test]
    async fn test_terminal_session_list_order() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;

        let s1 = db_terminal::create_session(&state.db, pid).await.unwrap();
        let s2 = db_terminal::create_session(&state.db, pid).await.unwrap();

        let sessions = db_terminal::list_sessions(&state.db, pid, 10).await.unwrap();
        assert_eq!(sessions.len(), 2);
        // 新しい順（id 降順）
        assert!(sessions[0].id >= sessions[1].id);
        let _ = (s1, s2);
    }

    // 🔴 Red: list_sessions が limit で件数を制限すること
    #[tokio::test]
    async fn test_terminal_session_list_limit() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;

        for _ in 0..5 {
            db_terminal::create_session(&state.db, pid).await.unwrap();
        }

        let sessions = db_terminal::list_sessions(&state.db, pid, 3).await.unwrap();
        assert_eq!(sessions.len(), 3);
    }
}
