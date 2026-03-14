use std::path::Path;
use std::process::Command;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DependencyError {
    #[error("コマンド実行失敗: {0}")]
    Command(String),
    #[error("JSON パースエラー: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("IO エラー: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Ecosystem {
    Rust,
    Node,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UpdateType {
    Patch,
    Minor,
    Major,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub name: String,
    pub ecosystem: Ecosystem,
    pub current_version: String,
    pub latest_version: String,
    pub update_type: UpdateType,
    pub has_vulnerability: bool,
    pub vulnerability_severity: Option<Severity>,
    pub affected_sources: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyReport {
    pub checked_at: String, // ISO8601
    pub rust_deps: Vec<DependencyStatus>,
    pub node_deps: Vec<DependencyStatus>,
    pub total_outdated: usize,
    pub total_vulnerable: usize,
}

// ─── バージョン比較 ────────────────────────────────────────────────────────────

/// semver 比較で更新タイプを判定する（簡易実装）
fn classify_update(current: &str, latest: &str) -> UpdateType {
    let parse = |v: &str| -> Option<(u64, u64, u64)> {
        let v = v.trim_start_matches('v');
        let parts: Vec<&str> = v.splitn(3, '.').collect();
        if parts.len() < 3 {
            return None;
        }
        Some((
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].split('-').next()?.parse().ok()?,
        ))
    };

    let (Some((c_maj, c_min, _c_pat)), Some((l_maj, l_min, _l_pat))) =
        (parse(current), parse(latest))
    else {
        return UpdateType::Unknown;
    };

    if l_maj > c_maj {
        UpdateType::Major
    } else if l_min > c_min {
        UpdateType::Minor
    } else {
        UpdateType::Patch
    }
}

// ─── Rust 依存スキャン ─────────────────────────────────────────────────────────

/// `cargo outdated` (JSON) の形式（簡易）
#[derive(Deserialize)]
struct CargoOutdatedRoot {
    dependencies: Vec<CargoOutdatedDep>,
}

#[derive(Deserialize)]
struct CargoOutdatedDep {
    name: String,
    project: String,     // 現在バージョン
    latest: String,      // 最新バージョン
}

fn scan_rust_outdated(project_path: &Path) -> Result<Vec<DependencyStatus>, DependencyError> {
    let cargo_toml = project_path.join("src-tauri").join("Cargo.toml");
    let manifest_path = if cargo_toml.exists() {
        cargo_toml.to_string_lossy().to_string()
    } else {
        project_path.join("Cargo.toml").to_string_lossy().to_string()
    };

    let output = Command::new("cargo")
        .args(["outdated", "--format", "json", "--manifest-path", &manifest_path])
        .current_dir(project_path)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let root: CargoOutdatedRoot = serde_json::from_slice(&out.stdout)
                .unwrap_or(CargoOutdatedRoot { dependencies: vec![] });
            Ok(root
                .dependencies
                .into_iter()
                .map(|d| {
                    let update_type = classify_update(&d.project, &d.latest);
                    DependencyStatus {
                        name: d.name,
                        ecosystem: Ecosystem::Rust,
                        current_version: d.project,
                        latest_version: d.latest,
                        update_type,
                        has_vulnerability: false,
                        vulnerability_severity: None,
                        affected_sources: vec![],
                    }
                })
                .collect())
        }
        _ => {
            // cargo outdated がインストールされていない場合は空を返す
            tracing::warn!("cargo outdated が利用不可。`cargo install cargo-outdated` でインストール");
            Ok(vec![])
        }
    }
}

/// `cargo audit --json` の形式（簡易）
#[derive(Deserialize)]
struct CargoAuditRoot {
    vulnerabilities: CargoAuditVulns,
}

#[derive(Deserialize)]
struct CargoAuditVulns {
    list: Vec<CargoAuditVuln>,
}

#[derive(Deserialize)]
struct CargoAuditVuln {
    package: CargoAuditPackage,
    advisory: CargoAuditAdvisory,
}

#[derive(Deserialize)]
struct CargoAuditPackage {
    name: String,
    version: String,
}

#[derive(Deserialize)]
struct CargoAuditAdvisory {
    severity: Option<String>,
}

fn scan_rust_vulns(project_path: &Path) -> Vec<(String, String, Severity)> {
    let cargo_toml = project_path.join("src-tauri").join("Cargo.toml");
    let manifest_path = if cargo_toml.exists() {
        cargo_toml.to_string_lossy().to_string()
    } else {
        project_path.join("Cargo.toml").to_string_lossy().to_string()
    };

    let output = Command::new("cargo")
        .args(["audit", "--json", "--file", &manifest_path])
        .current_dir(project_path)
        .output();

    match output {
        Ok(out) => {
            if let Ok(root) = serde_json::from_slice::<CargoAuditRoot>(&out.stdout) {
                root.vulnerabilities
                    .list
                    .into_iter()
                    .map(|v| {
                        let sev = match v.advisory.severity.as_deref() {
                            Some("critical") => Severity::Critical,
                            Some("high") => Severity::High,
                            Some("medium") => Severity::Medium,
                            _ => Severity::Low,
                        };
                        (v.package.name, v.package.version, sev)
                    })
                    .collect()
            } else {
                vec![]
            }
        }
        Err(_) => vec![],
    }
}

// ─── Node 依存スキャン ─────────────────────────────────────────────────────────

fn scan_node_outdated(project_path: &Path) -> Result<Vec<DependencyStatus>, DependencyError> {
    if !project_path.join("package.json").exists() {
        return Ok(vec![]);
    }

    let output = Command::new("npm")
        .args(["outdated", "--json"])
        .current_dir(project_path)
        .output();

    match output {
        Ok(out) => {
            // npm outdated は outdated があると exit code 1 を返す
            if out.stdout.is_empty() {
                return Ok(vec![]);
            }
            let map: serde_json::Value =
                serde_json::from_slice(&out.stdout).unwrap_or(serde_json::Value::Object(Default::default()));
            let mut deps = Vec::new();
            if let Some(obj) = map.as_object() {
                for (name, info) in obj {
                    let current = info["current"].as_str().unwrap_or("?").to_string();
                    let latest = info["latest"].as_str().unwrap_or("?").to_string();
                    let update_type = classify_update(&current, &latest);
                    deps.push(DependencyStatus {
                        name: name.clone(),
                        ecosystem: Ecosystem::Node,
                        current_version: current,
                        latest_version: latest,
                        update_type,
                        has_vulnerability: false,
                        vulnerability_severity: None,
                        affected_sources: vec![],
                    });
                }
            }
            Ok(deps)
        }
        Err(_) => {
            tracing::warn!("npm outdated が利用不可");
            Ok(vec![])
        }
    }
}

fn scan_node_vulns(project_path: &Path) -> Vec<(String, Severity)> {
    if !project_path.join("package.json").exists() {
        return vec![];
    }

    let output = Command::new("npm")
        .args(["audit", "--json"])
        .current_dir(project_path)
        .output();

    match output {
        Ok(out) => {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                let mut result = Vec::new();
                if let Some(vulns) = val.get("vulnerabilities").and_then(|v| v.as_object()) {
                    for (name, info) in vulns {
                        let sev = match info["severity"].as_str() {
                            Some("critical") => Severity::Critical,
                            Some("high") => Severity::High,
                            Some("moderate") => Severity::Medium,
                            _ => Severity::Low,
                        };
                        result.push((name.clone(), sev));
                    }
                }
                result
            } else {
                vec![]
            }
        }
        Err(_) => vec![],
    }
}

// ─── 公開 API ──────────────────────────────────────────────────────────────────

/// 依存ライブラリの状態を一括スキャンする
pub fn scan_dependencies(project_path: &Path) -> Result<DependencyReport, DependencyError> {
    let mut rust_deps = scan_rust_outdated(project_path)?;
    let rust_vulns = scan_rust_vulns(project_path);

    // 脆弱性情報をマージ
    for (dep_name, dep_version, sev) in &rust_vulns {
        for dep in &mut rust_deps {
            if &dep.name == dep_name && dep.current_version == *dep_version {
                dep.has_vulnerability = true;
                dep.vulnerability_severity = Some(sev.clone());
            }
        }
        // 脆弱性があるが outdated に含まれていない場合も追加
        if !rust_deps.iter().any(|d| &d.name == dep_name) {
            rust_deps.push(DependencyStatus {
                name: dep_name.clone(),
                ecosystem: Ecosystem::Rust,
                current_version: dep_version.clone(),
                latest_version: dep_version.clone(),
                update_type: UpdateType::Unknown,
                has_vulnerability: true,
                vulnerability_severity: Some(sev.clone()),
                affected_sources: vec![],
            });
        }
    }

    let mut node_deps = scan_node_outdated(project_path)?;
    let node_vulns = scan_node_vulns(project_path);

    for (dep_name, sev) in &node_vulns {
        for dep in &mut node_deps {
            if &dep.name == dep_name {
                dep.has_vulnerability = true;
                dep.vulnerability_severity = Some(sev.clone());
            }
        }
        if !node_deps.iter().any(|d| &d.name == dep_name) {
            node_deps.push(DependencyStatus {
                name: dep_name.clone(),
                ecosystem: Ecosystem::Node,
                current_version: "?".to_string(),
                latest_version: "?".to_string(),
                update_type: UpdateType::Unknown,
                has_vulnerability: true,
                vulnerability_severity: Some(sev.clone()),
                affected_sources: vec![],
            });
        }
    }

    let total_outdated = rust_deps
        .iter()
        .chain(&node_deps)
        .filter(|d| d.update_type != UpdateType::Unknown)
        .count();
    let total_vulnerable = rust_deps
        .iter()
        .chain(&node_deps)
        .filter(|d| d.has_vulnerability)
        .count();

    Ok(DependencyReport {
        checked_at: Utc::now().to_rfc3339(),
        rust_deps,
        node_deps,
        total_outdated,
        total_vulnerable,
    })
}
