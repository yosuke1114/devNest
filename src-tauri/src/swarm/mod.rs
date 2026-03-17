pub mod agentic_bridge;
pub mod ai_resolver;
pub mod resource_monitor;
pub mod conflict_resolver;
pub mod git_branch;
pub mod manager;
pub mod orchestrator;
pub mod result_aggregator;
pub mod subtask;
pub mod task_splitter;
pub mod worker;
pub mod role_manager;
pub mod guard_manager;
pub mod watchdog;
pub mod context_store;
pub mod mail_store;
pub mod session_store;
pub mod knowledge_store;
pub mod health_check;

use std::sync::{Arc, Mutex};

use manager::WorkerManager;

pub type SharedWorkerManager = Arc<Mutex<WorkerManager>>;

pub fn create_manager() -> SharedWorkerManager {
    Arc::new(Mutex::new(WorkerManager::new()))
}

pub use orchestrator::{create_orchestrator, SharedOrchestrator};
