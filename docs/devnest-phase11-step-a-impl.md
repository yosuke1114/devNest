# DevNest Phase 11 — Step 11-A 実装指示書
# タイル型マルチターミナルUI（MVP）

**対象**: Claude Code
**作成日**: 2026-03-14
**前提設計書**: devnest-phase11-design.md

---

## 概要

DevNestにタイル型マルチターミナル機能を追加する。
複数のPTY（疑似端末）をRust側で管理し、React側で`@xterm/xterm`を複数インスタンス化して
グリッド表示する。

**Step 11-Aの完了基準:**
- [ ] 4ペイン同時表示してそれぞれで独立したシェルが動く
- [ ] ペインを動的に追加/削除できる
- [ ] 各ペインのサイズをリサイズできる
- [ ] ClaudeCode Worker（🤖）とShell（🐚）の種別バッジが表示される

---

## 技術スタック

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | React + TypeScript | 既存 |
| ターミナルUI | @xterm/xterm v6 | **既にDevNestに導入済み** |
| バックエンド | Rust / Tauri v2 | 既存 |
| PTY管理 | portable-pty | **新規追加** |

---

## Rust側の実装

### 1. Cargo.tomlに依存追加

```toml
# src-tauri/Cargo.toml
[dependencies]
portable-pty = "0.8"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
```

---

### 2. ファイル構成

```
src-tauri/src/
└── swarm/
    ├── mod.rs
    ├── worker.rs       # WorkerHandle, WorkerConfig, WorkerKind, WorkerMode
    └── manager.rs      # WorkerManager（PTY複数管理）
```

---

### 3. worker.rs

```rust
// src-tauri/src/swarm/worker.rs

use std::path::PathBuf;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerKind {
    ClaudeCode,
    Shell,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerMode {
    Interactive,
    Batch,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerStatus {
    Idle,
    Running,
    Done,
    Error,
    Retrying,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConfig {
    pub kind: WorkerKind,
    pub mode: WorkerMode,
    pub label: String,
    pub working_dir: PathBuf,
    // 将来の依存グラフ対応用（Step 11-A では未使用）
    pub depends_on: Vec<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerInfo {
    pub id: String,
    pub config: WorkerConfig,
    pub status: WorkerStatus,
}
```

---

### 4. manager.rs

```rust
// src-tauri/src/swarm/manager.rs

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::io::Write;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::worker::{WorkerConfig, WorkerInfo, WorkerKind, WorkerMode, WorkerStatus};

/// PTYプロセスの実体を保持する内部構造体
struct PtyHandle {
    writer: Box<dyn Write + Send>,
    // 将来: reader thread handle など
}

pub struct WorkerManager {
    workers: HashMap<String, WorkerInfo>,
    ptys: HashMap<String, PtyHandle>,
}

impl WorkerManager {
    pub fn new() -> Self {
        Self {
            workers: HashMap::new(),
            ptys: HashMap::new(),
        }
    }

    /// Workerを起動してPTYを作成する
    pub fn spawn_worker(
        &mut self,
        config: WorkerConfig,
        app: AppHandle,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();

        // PTY作成
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        // コマンド構築
        let mut cmd = match config.kind {
            WorkerKind::Shell => {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                CommandBuilder::new(shell)
            }
            WorkerKind::ClaudeCode => {
                // Interactive モードは shell と同様に起動
                // Batch モードは Task 11-D で実装
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                CommandBuilder::new(shell)
            }
        };
        cmd.cwd(&config.working_dir);

        // 子プロセス起動
        let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // 読み取りスレッド起動（PTY出力をフロントにストリーミング）
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let worker_id = id.clone();
        let app_clone = app.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        // フロントにストリーミング
                        let _ = app_clone.emit(
                            "worker-output",
                            serde_json::json!({
                                "workerId": worker_id,
                                "data": data,
                            }),
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        // writer保持
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        self.ptys.insert(id.clone(), PtyHandle { writer: Box::new(writer) });

        // WorkerInfo登録
        let info = WorkerInfo {
            id: id.clone(),
            config,
            status: WorkerStatus::Idle,
        };
        self.workers.insert(id.clone(), info.clone());

        // フロントに通知
        let _ = app.emit("worker-spawned", &info);

        Ok(id)
    }

    /// Workerを停止してPTYを破棄する
    pub fn kill_worker(&mut self, worker_id: &str, app: AppHandle) -> Result<(), String> {
        self.ptys.remove(worker_id);
        self.workers.remove(worker_id);
        let _ = app.emit("worker-killed", serde_json::json!({ "workerId": worker_id }));
        Ok(())
    }

    /// PTYにデータを書き込む（キーボード入力の転送）
    pub fn write_to_worker(&mut self, worker_id: &str, data: &[u8]) -> Result<(), String> {
        let pty = self.ptys.get_mut(worker_id).ok_or("Worker not found")?;
        pty.writer.write_all(data).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// PTYのサイズを変更する（ウィンドウリサイズ時）
    pub fn resize_worker(&mut self, worker_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // portable-ptyのresizeはmaster側で行う
        // 現実装では省略 → Step 11-A 完了後に追加
        Ok(())
    }

    pub fn list_workers(&self) -> Vec<WorkerInfo> {
        self.workers.values().cloned().collect()
    }
}
```

---

### 5. mod.rs

```rust
// src-tauri/src/swarm/mod.rs

pub mod worker;
pub mod manager;

use std::sync::{Arc, Mutex};
use manager::WorkerManager;

pub type SharedWorkerManager = Arc<Mutex<WorkerManager>>;

pub fn create_manager() -> SharedWorkerManager {
    Arc::new(Mutex::new(WorkerManager::new()))
}
```

---

### 6. Tauriコマンド

```rust
// src-tauri/src/commands/swarm_commands.rs

use tauri::State;
use crate::swarm::{SharedWorkerManager, worker::WorkerConfig};

#[tauri::command]
pub async fn spawn_worker(
    config: WorkerConfig,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.spawn_worker(config, app)
}

#[tauri::command]
pub async fn kill_worker(
    worker_id: String,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.kill_worker(&worker_id, app)
}

#[tauri::command]
pub async fn write_to_worker(
    worker_id: String,
    data: Vec<u8>,
    manager: State<'_, SharedWorkerManager>,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.write_to_worker(&worker_id, &data)
}

#[tauri::command]
pub async fn list_workers(
    manager: State<'_, SharedWorkerManager>,
) -> Result<Vec<crate::swarm::worker::WorkerInfo>, String> {
    let mgr = manager.lock().map_err(|e| e.to_string())?;
    Ok(mgr.list_workers())
}
```

---

### 7. main.rsへの登録

```rust
// src-tauri/src/main.rs に追加

mod swarm;
mod commands;

use swarm::create_manager;

fn main() {
    tauri::Builder::default()
        .manage(create_manager())  // WorkerManagerをステートに登録
        .invoke_handler(tauri::generate_handler![
            // 既存コマンド...
            commands::swarm_commands::spawn_worker,
            commands::swarm_commands::kill_worker,
            commands::swarm_commands::write_to_worker,
            commands::swarm_commands::list_workers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## フロント側の実装

### 8. ファイル構成

```
src/
└── components/
    └── swarm/
        ├── XtermPane.tsx       # 1ペイン = 1xterm.jsインスタンス
        ├── TerminalGrid.tsx    # グリッドレイアウト + ペイン管理
        └── SwarmPage.tsx       # Swarm画面全体（既存のルートに追加）
```

---

### 9. XtermPane.tsx

```typescript
// src/components/swarm/XtermPane.tsx

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { WorkerInfo, WorkerStatus } from "./types";

interface XtermPaneProps {
  worker: WorkerInfo;
  onKill: (id: string) => void;
  isActive: boolean;
  onClick: () => void;
}

const STATUS_COLOR: Record<WorkerStatus, string> = {
  idle: "#4a5568",
  running: "#f6ad55",
  done: "#68d391",
  error: "#fc8181",
  retrying: "#76e4f7",
};

const STATUS_ICON: Record<WorkerStatus, string> = {
  idle: "○",
  running: "●",
  done: "✓",
  error: "✕",
  retrying: "↺",
};

export function XtermPane({ worker, onKill, isActive, onClick }: XtermPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const isShell = worker.config.kind === "shell";

  useEffect(() => {
    if (!containerRef.current) return;

    // xterm.jsインスタンス作成
    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        selectionBackground: "#264f78",
      },
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // PTY出力をxtermに流す
    const unlisten = listen<{ workerId: string; data: string }>(
      "worker-output",
      (event) => {
        if (event.payload.workerId === worker.id) {
          term.write(event.payload.data);
        }
      }
    );

    // キーボード入力をRustに転送
    term.onData((data) => {
      const encoder = new TextEncoder();
      invoke("write_to_worker", {
        workerId: worker.id,
        data: Array.from(encoder.encode(data)),
      });
    });

    // リサイズ対応
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      unlisten.then((f) => f());
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [worker.id]);

  const borderColor = isActive
    ? "#388bfd"
    : STATUS_COLOR[worker.status];

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        overflow: "hidden",
        background: "#0d1117",
        minHeight: 200,
        cursor: "pointer",
        transition: "border-color 0.2s",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 10px",
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{isShell ? "🐚" : "🤖"}</span>
          <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace" }}>
            {worker.config.label}
          </span>
          {/* ShellはステータスバッジなしのラベルのみW */}
          {!isShell && (
            <span
              style={{
                fontSize: 11,
                color: STATUS_COLOR[worker.status],
                fontFamily: "monospace",
              }}
            >
              {STATUS_ICON[worker.status]}{" "}
              {worker.status}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onKill(worker.id);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#484f58",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      </div>

      {/* ターミナル本体 */}
      <div
        ref={containerRef}
        style={{ flex: 1, padding: 4 }}
      />
    </div>
  );
}
```

---

### 10. types.ts

```typescript
// src/components/swarm/types.ts

export type WorkerKind = "claudeCode" | "shell";
export type WorkerMode = "interactive" | "batch";
export type WorkerStatus = "idle" | "running" | "done" | "error" | "retrying";

export interface WorkerConfig {
  kind: WorkerKind;
  mode: WorkerMode;
  label: string;
  workingDir: string;
  dependsOn: string[];
  metadata: Record<string, string>;
}

export interface WorkerInfo {
  id: string;
  config: WorkerConfig;
  status: WorkerStatus;
}
```

---

### 11. TerminalGrid.tsx

```typescript
// src/components/swarm/TerminalGrid.tsx

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { XtermPane } from "./XtermPane";
import { WorkerInfo, WorkerConfig } from "./types";

export function TerminalGrid() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Worker追加
  const addWorker = async (kind: "shell" | "claudeCode") => {
    const config: WorkerConfig = {
      kind,
      mode: "interactive",
      label: kind === "shell" ? `Shell ${workers.length + 1}` : `Worker ${workers.length + 1}`,
      workingDir: "/",  // TODO: プロジェクトパスから取得
      dependsOn: [],
      metadata: {},
    };

    try {
      const id = await invoke<string>("spawn_worker", { config });
      const newWorker: WorkerInfo = { id, config, status: "idle" };
      setWorkers((prev) => [...prev, newWorker]);
      setActiveId(id);
    } catch (err) {
      console.error("Failed to spawn worker:", err);
    }
  };

  // Worker削除
  const killWorker = async (id: string) => {
    try {
      await invoke("kill_worker", { workerId: id });
      setWorkers((prev) => prev.filter((w) => w.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (err) {
      console.error("Failed to kill worker:", err);
    }
  };

  // グリッドのカラム数を決定（Worker数に応じて自動調整）
  const cols = workers.length <= 1 ? 1
    : workers.length <= 4 ? 2
    : 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* ツールバー */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => addWorker("shell")}
          style={addButtonStyle}
        >
          🐚 Shell を追加
        </button>
        <button
          onClick={() => addWorker("claudeCode")}
          style={addButtonStyle}
        >
          🤖 Worker を追加
        </button>
        <span style={{ color: "#484f58", fontSize: 12, marginLeft: "auto", alignSelf: "center" }}>
          {workers.length} / 8 ペイン
        </span>
      </div>

      {/* グリッド */}
      {workers.length === 0 ? (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
          <div style={{ color: "#484f58", fontSize: 13 }}>
            WorkerまたはShellを追加してください
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 10,
            overflow: "auto",
          }}
        >
          {workers.map((worker) => (
            <XtermPane
              key={worker.id}
              worker={worker}
              onKill={killWorker}
              isActive={activeId === worker.id}
              onClick={() => setActiveId(worker.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const addButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#21262d",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
};

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #30363d",
  borderRadius: 8,
};
```

---

### 12. SwarmPage.tsx

```typescript
// src/components/swarm/SwarmPage.tsx

import { TerminalGrid } from "./TerminalGrid";

export function SwarmPage() {
  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: 16,
      background: "#0d1117",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3", fontFamily: "monospace" }}>
          DevNest Swarm
        </span>
        <span style={{
          fontSize: 11,
          color: "#388bfd",
          border: "1px solid #1f6feb",
          borderRadius: 4,
          padding: "2px 6px",
        }}>
          Phase 11-A
        </span>
      </div>
      <TerminalGrid />
    </div>
  );
}
```

---

## 実装の注意事項

### portable-ptyのread実装

`manager.rs`のreadループで`use std::io::Read;`のインポートが必要：

```rust
use std::io::{Read, Write};
```

### Tauri v2のEmitter

Tauri v2では`app.emit()`の使用に`tauri::Emitter`トレイトのインポートが必要：

```rust
use tauri::Emitter;
```

### xterm.jsのCSSインポート

`XtermPane.tsx`で以下を必ずインポートすること（ないと表示崩れる）：

```typescript
import "@xterm/xterm/css/xterm.css";
```

---

## 実装順序

1. `src-tauri/Cargo.toml` に `portable-pty` を追加
2. `src-tauri/src/swarm/` モジュールを作成
3. `src-tauri/src/commands/swarm_commands.rs` を作成
4. `src-tauri/src/main.rs` にモジュールとコマンドを登録
5. `src/components/swarm/types.ts` を作成
6. `src/components/swarm/XtermPane.tsx` を作成
7. `src/components/swarm/TerminalGrid.tsx` を作成
8. `src/components/swarm/SwarmPage.tsx` を作成
9. 既存のルーティングに `SwarmPage` を追加

---

## 動作確認手順

```bash
# 1. 依存インストール
cd src-tauri && cargo build

# 2. 起動
npm run tauri dev

# 3. Swarmページを開く

# 4. 確認項目
# - 「Shell を追加」ボタンでペインが追加される
# - 追加されたペインにシェルが起動している（プロンプトが表示される）
# - キーボード入力が正しく転送される
# - 「✕」ボタンでペインが削除される
# - 4ペイン追加して全て独立して動作する
# - 🤖 / 🐚 の種別バッジが正しく表示される
```

---

## 次のStep

Step 11-A 完了後、以下を実施：

- **Step 11-B**: WorkerStatus追跡・完了検出
  - Claude Codeの出力パターンを実測してPatternKindを確定
  - ステータスバッジをリアルタイム更新

- **Step 11-C**: TaskSplitter統合（Rust側Claude API呼び出し）
