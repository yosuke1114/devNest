//! DevNest CLI — ~/.devnest/devnest.sock に接続して DevNest を操作する

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use serde_json::json;

#[derive(Parser)]
#[command(name = "devnest", about = "DevNest CLI — DevNest アプリを外部から操作する")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
    /// JSON形式で出力する
    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// 通知を送信する
    Notify {
        #[arg(long)]
        title: String,
        #[arg(long)]
        body: String,
        /// urgency: info / warning / critical
        #[arg(long, default_value = "info")]
        urgency: String,
    },
    /// 保守スキャンをトリガーする
    Scan {
        #[arg(long)]
        product: Option<String>,
    },
    /// タスク操作
    #[command(subcommand)]
    Task(TaskAction),
    /// ブラウザ操作
    #[command(subcommand)]
    Browser(BrowserAction),
    /// プロダクト操作
    #[command(subcommand)]
    Product(ProductAction),
    /// 設計書操作
    #[command(subcommand)]
    Docs(DocsAction),
    /// ヘルスチェック
    Health,
}

#[derive(Subcommand)]
enum TaskAction {
    /// タスク一覧を表示
    List,
    /// タスクを登録
    Submit {
        #[arg(long)]
        r#type: String,
        #[arg(long)]
        doc: Option<String>,
    },
    /// タスクのステータスを確認
    Status { task_id: String },
    /// タスクを承認
    Approve { task_id: String },
}

#[derive(Subcommand)]
enum BrowserAction {
    /// URLをアプリ内ブラウザで開く
    Open { url: String },
    /// ブラウザのURLを変更
    Navigate {
        panel_id: String,
        url: String,
    },
}

#[derive(Subcommand)]
enum ProductAction {
    /// 現在のプロダクト情報を表示
    Current,
    /// アクティブプロダクトを切り替える
    Switch { product_id: i64 },
}

#[derive(Subcommand)]
enum DocsAction {
    /// 設計書の鮮度を確認
    Staleness {
        #[arg(long)]
        product: Option<String>,
    },
    /// 変更影響設計書を取得
    Affected {
        #[arg(long)]
        doc: String,
    },
}

fn socket_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".devnest").join("devnest.sock")
}

fn send_request(method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = socket_path();
    let stream = UnixStream::connect(&path).map_err(|_| {
        "DevNest に接続できません。DevNest アプリが起動しているか確認してください。".to_string()
    })?;

    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });

    let mut writer = stream.try_clone().map_err(|e| e.to_string())?;
    let reader = BufReader::new(stream);

    let mut request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    request_str.push('\n');
    writer.write_all(request_str.as_bytes()).map_err(|e| e.to_string())?;

    let mut response_line = String::new();
    reader.lines().next().ok_or("No response")?.map_err(|e| e.to_string()).and_then(|line| {
        response_line = line;
        serde_json::from_str(&response_line).map_err(|e| e.to_string())
    })
}

fn print_result(value: &serde_json::Value, json_mode: bool) {
    if json_mode {
        println!("{}", serde_json::to_string_pretty(value).unwrap_or_default());
    } else {
        if let Some(result) = value.get("result") {
            println!("{}", serde_json::to_string_pretty(result).unwrap_or_default());
        } else if let Some(error) = value.get("error") {
            eprintln!("エラー: {}", error["message"].as_str().unwrap_or("Unknown error"));
            std::process::exit(1);
        }
    }
}

fn main() {
    let cli = Cli::parse();
    let json_mode = cli.json;

    let result = match cli.command {
        Commands::Notify { title, body, urgency } => {
            send_request("notify", json!({ "title": title, "body": body, "urgency": urgency }))
        }
        Commands::Scan { product } => {
            send_request("scan.trigger", json!({ "product": product }))
        }
        Commands::Task(action) => match action {
            TaskAction::List => send_request("task.list", json!({})),
            TaskAction::Submit { r#type, doc } => {
                send_request("task.submit", json!({ "type": r#type, "doc": doc }))
            }
            TaskAction::Status { task_id } => {
                send_request("task.status", json!({ "task_id": task_id }))
            }
            TaskAction::Approve { task_id } => {
                send_request("task.approve", json!({ "task_id": task_id }))
            }
        },
        Commands::Browser(action) => match action {
            BrowserAction::Open { url } => {
                send_request("browser.open", json!({ "url": url }))
            }
            BrowserAction::Navigate { panel_id, url } => {
                send_request("browser.navigate", json!({ "panel_id": panel_id, "url": url }))
            }
        },
        Commands::Product(action) => match action {
            ProductAction::Current => send_request("product.current", json!({})),
            ProductAction::Switch { product_id } => {
                send_request("product.switch", json!({ "product_id": product_id }))
            }
        },
        Commands::Docs(action) => match action {
            DocsAction::Staleness { product } => {
                send_request("docs.staleness", json!({ "product": product }))
            }
            DocsAction::Affected { doc } => {
                send_request("docs.affected", json!({ "doc": doc }))
            }
        },
        Commands::Health => send_request("health.status", json!({})),
    };

    match result {
        Ok(value) => print_result(&value, json_mode),
        Err(e) => {
            eprintln!("{}", e);
            std::process::exit(1);
        }
    }
}
