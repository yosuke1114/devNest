// src-tauri/src/swarm/guard_manager.rs

use std::path::Path;
use std::fs;
use super::worker::WorkerRole;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GuardViolation {
    GitPush,
    GitReset,
    FileWriteOutOfScope { file: String },
}

/// Worker起動時にgit hooksを設置する
pub fn install_git_hooks(
    worktree_path: &Path,
    role: &WorkerRole,
) -> Result<(), String> {
    let hooks_dir = worktree_path.join(".git/hooks");
    fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;

    let blocked = role.blocked_git_commands();

    // pre-push フック
    if blocked.contains(&"git push") {
        let hook_path = hooks_dir.join("pre-push");
        let content = format!(
            "#!/bin/sh\n\
             echo 'ERROR: git push is blocked for role: {}'\n\
             echo 'DEVNEST_GUARD_VIOLATION: git_push'\n\
             exit 1\n",
            format!("{:?}", role).to_lowercase()
        );
        fs::write(&hook_path, &content).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                &hook_path,
                fs::Permissions::from_mode(0o755),
            ).map_err(|e| e.to_string())?;
        }
    }

    // pre-commit フック（reset --hard等の間接対策）
    let pre_commit = hooks_dir.join("pre-commit");
    let content = "#!/bin/sh\n\
                   # DevNest guard: installed by role_manager\n\
                   exit 0\n";
    fs::write(&pre_commit, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// PTY出力からガード違反パターンを検出する
pub fn detect_guard_violation(output: &str) -> Option<GuardViolation> {
    if output.contains("DEVNEST_GUARD_VIOLATION: git_push") {
        return Some(GuardViolation::GitPush);
    }
    if output.contains("DEVNEST_GUARD_VIOLATION: git_reset") {
        return Some(GuardViolation::GitReset);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use crate::swarm::worker::WorkerRole;

    fn make_git_dir(dir: &TempDir) {
        std::fs::create_dir_all(dir.path().join(".git/hooks")).unwrap();
    }

    // ITa-13-09: Scout役割でpre-pushフックが設置される
    #[test]
    fn test_install_git_hooks_scout_creates_pre_push() {
        let dir = TempDir::new().unwrap();
        make_git_dir(&dir);
        install_git_hooks(dir.path(), &WorkerRole::Scout).unwrap();
        assert!(dir.path().join(".git/hooks/pre-push").exists());
    }

    // ITa-13-10: Builder役割でpre-pushフックが設置される
    #[test]
    fn test_install_git_hooks_builder_creates_pre_push() {
        let dir = TempDir::new().unwrap();
        make_git_dir(&dir);
        install_git_hooks(dir.path(), &WorkerRole::Builder).unwrap();
        assert!(dir.path().join(".git/hooks/pre-push").exists());
    }

    // ITa-13-11: Shell役割ではpre-pushフックが設置されない
    #[test]
    fn test_install_git_hooks_shell_no_pre_push() {
        let dir = TempDir::new().unwrap();
        make_git_dir(&dir);
        install_git_hooks(dir.path(), &WorkerRole::Shell).unwrap();
        assert!(!dir.path().join(".git/hooks/pre-push").exists());
        // pre-commitは設置される
        assert!(dir.path().join(".git/hooks/pre-commit").exists());
    }

    // ITa-13-13: フックがDEVNEST_GUARD_VIOLATIONシグナルを出力する（ファイル内容確認）
    #[test]
    fn test_hook_contains_guard_violation_signal() {
        let dir = TempDir::new().unwrap();
        make_git_dir(&dir);
        install_git_hooks(dir.path(), &WorkerRole::Scout).unwrap();
        let content = std::fs::read_to_string(
            dir.path().join(".git/hooks/pre-push")
        ).unwrap();
        assert!(content.contains("DEVNEST_GUARD_VIOLATION: git_push"));
    }

    // ITa-13-14: detect_guard_violationがgit_pushを検出する
    #[test]
    fn test_detect_guard_violation_git_push() {
        let output = "some output\nDEVNEST_GUARD_VIOLATION: git_push\nmore output";
        let result = detect_guard_violation(output);
        assert_eq!(result, Some(GuardViolation::GitPush));
    }

    // ITa-13-15: detect_guard_violationが無関係な出力でNoneを返す
    #[test]
    fn test_detect_guard_violation_no_match() {
        let output = "normal command output\ngit status\nno violations here";
        let result = detect_guard_violation(output);
        assert!(result.is_none());
    }
}
