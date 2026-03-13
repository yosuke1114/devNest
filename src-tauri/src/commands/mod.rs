pub mod ai;
pub mod conflict;
pub mod doc_mapping;
pub mod document;
pub mod maintenance;
pub mod file_viewer;
pub mod github_auth;
pub mod issue;
pub mod notifications;
pub mod polling;
pub mod pr;
pub mod project;
pub mod search;
pub mod settings;
pub mod terminal;
pub mod util;

#[macro_export]
macro_rules! all_commands {
    () => {
        tauri::generate_handler![
            // Phase 1: project
            commands::project::project_create,
            commands::project::project_list,
            commands::project::project_update,
            commands::project::project_get_status,
            commands::project::project_delete,
            commands::project::project_set_last_opened_document,
            // Phase 1: document
            commands::document::document_list,
            commands::document::document_get,
            commands::document::document_scan,
            commands::document::document_save,
            commands::document::document_set_dirty,
            commands::document::document_push_retry,
            commands::document::document_linked_issues,
            commands::document::document_create,
            commands::document::document_rename,
            // CodeViewer (Phase A + B)
            commands::file_viewer::file_tree,
            commands::file_viewer::file_read,
            commands::file_viewer::file_save,
            // Phase 1: settings / util
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::util::startup_cleanup,
            commands::util::sync_log_list,
            // Phase 1: Issue
            commands::issue::issue_sync,
            commands::issue::issue_list,
            commands::issue::issue_doc_link_list,
            commands::issue::issue_doc_link_add,
            commands::issue::issue_doc_link_remove,
            commands::issue::issue_draft_create,
            commands::issue::issue_draft_update,
            commands::issue::issue_draft_list,
            commands::issue::issue_draft_generate,
            commands::issue::issue_draft_cancel,
            commands::issue::issue_create,
            commands::issue::github_labels_list,
            // Phase 1: GitHub 認証
            commands::github_auth::github_auth_start,
            commands::github_auth::github_auth_complete,
            commands::github_auth::github_auth_status,
            commands::github_auth::github_auth_revoke,
            // Phase 4: Terminal
            commands::terminal::terminal_session_start,
            commands::terminal::terminal_session_stop,
            commands::terminal::terminal_input_send,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_session_list,
            // Phase 3: 検索
            commands::search::index_build,
            commands::search::document_index_build,
            commands::search::document_search_keyword,
            commands::search::document_search_semantic,
            commands::search::search_history_list,
            commands::search::index_reset,
            commands::search::search_context_for_issue,
            // Phase 4: Conflict 解消
            commands::conflict::conflict_scan,
            commands::conflict::conflict_list,
            commands::conflict::conflict_resolve,
            commands::conflict::conflict_resolve_all,
            // Phase 5: 通知
            commands::notifications::notification_list,
            commands::notifications::notification_unread_count,
            commands::notifications::notification_mark_read,
            commands::notifications::notification_mark_all_read,
            commands::notifications::notification_navigate,
            commands::notifications::notification_push,
            commands::notifications::notification_permission_request,
            // Phase 2: PR
            commands::pr::pr_sync,
            commands::pr::pr_list,
            commands::pr::pr_get_detail,
            commands::pr::pr_get_files,
            commands::pr::pr_get_diff,
            commands::pr::pr_add_comment,
            commands::pr::pr_review_submit,
            commands::pr::pr_merge,
            commands::pr::pr_create_from_branch,
            commands::pr::pr_doc_diff_get,
            commands::pr::git_pull,
            // Phase 5: ポーリング制御
            commands::polling::polling_start,
            commands::polling::polling_stop,
            commands::polling::polling_status,
            // Maintenance
            commands::maintenance::maintenance_scan_dependencies,
            commands::maintenance::maintenance_scan_tech_debt,
            commands::maintenance::maintenance_run_coverage,
            commands::maintenance::maintenance_refactor_candidates,
            // Doc Mapping
            commands::doc_mapping::rebuild_doc_index,
            commands::doc_mapping::find_affected_docs_cmd,
            commands::doc_mapping::check_doc_staleness,
            commands::doc_mapping::generate_update_context,
            // Phase 6: AI アシスタント
            commands::ai::ai_get_context,
            commands::ai::ai_review_changes,
            commands::ai::ai_generate_code,
        ]
    };
}
