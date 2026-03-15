pub mod manager;
pub mod subtask;
pub mod task_splitter;
pub mod worker;

use std::sync::{Arc, Mutex};

use manager::WorkerManager;

pub type SharedWorkerManager = Arc<Mutex<WorkerManager>>;

pub fn create_manager() -> SharedWorkerManager {
    Arc::new(Mutex::new(WorkerManager::new()))
}
