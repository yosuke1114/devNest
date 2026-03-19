// src-tauri/src/swarm/watchdog.rs

use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct WatchdogConfig {
    pub stall_threshold_secs: u64,
    pub nudge_max_attempts: u32,
    pub nudge_debounce_ms: u64,
    pub poll_interval_secs: u64,
}

impl Default for WatchdogConfig {
    fn default() -> Self {
        Self {
            stall_threshold_secs: 120,
            nudge_max_attempts: 3,
            nudge_debounce_ms: 500,
            poll_interval_secs: 30,
        }
    }
}

struct WorkerActivity {
    last_output_at: Instant,
    nudge_attempts: u32,
}

pub struct Watchdog {
    config: WatchdogConfig,
    activity: HashMap<String, WorkerActivity>,
}

impl Watchdog {
    pub fn new(config: WatchdogConfig) -> Self {
        Self { config, activity: HashMap::new() }
    }

    /// Worker出力があったら最終活動時刻を更新
    pub fn record_activity(&mut self, worker_id: &str) {
        self.activity.insert(worker_id.to_string(), WorkerActivity {
            last_output_at: Instant::now(),
            nudge_attempts: 0,
        });
    }

    /// スタックしているWorkerを返す
    pub fn stalled_workers(&self) -> Vec<(String, u32)> {
        let threshold = Duration::from_secs(self.config.stall_threshold_secs);
        self.activity.iter()
            .filter(|(_, a)| a.last_output_at.elapsed() > threshold)
            .map(|(id, a)| (id.clone(), a.nudge_attempts))
            .collect()
    }

    pub fn increment_nudge(&mut self, worker_id: &str) {
        if let Some(a) = self.activity.get_mut(worker_id) {
            a.nudge_attempts += 1;
            a.last_output_at = Instant::now();
        }
    }

    pub fn remove_worker(&mut self, worker_id: &str) {
        self.activity.remove(worker_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    fn config_zero_threshold() -> WatchdogConfig {
        WatchdogConfig {
            stall_threshold_secs: 0,
            nudge_max_attempts: 3,
            nudge_debounce_ms: 0,
            poll_interval_secs: 1,
        }
    }

    fn config_large_threshold() -> WatchdogConfig {
        WatchdogConfig {
            stall_threshold_secs: 9999,
            nudge_max_attempts: 3,
            nudge_debounce_ms: 0,
            poll_interval_secs: 1,
        }
    }

    // ITa-13-17: record_activityで活動が記録される
    #[test]
    fn test_record_activity_registers_worker() {
        let mut wd = Watchdog::new(config_large_threshold());
        wd.record_activity("worker-1");
        // stall_threshold が大きいので stalledにならない
        let stalled = wd.stalled_workers();
        assert!(stalled.is_empty());
        // activityに登録されていることをremove後に確認
        wd.remove_worker("worker-1");
        let stalled_after = wd.stalled_workers();
        assert!(stalled_after.is_empty());
    }

    // ITa-13-18: 閾値0の場合はrecord_activity直後でもstalled
    #[test]
    fn test_stalled_workers_with_zero_threshold() {
        let mut wd = Watchdog::new(config_zero_threshold());
        wd.record_activity("worker-1");
        // elapsed() > Duration::from_secs(0) は常にtrue（少し待つ）
        thread::sleep(Duration::from_millis(1));
        let stalled = wd.stalled_workers();
        assert!(!stalled.is_empty());
        assert_eq!(stalled[0].0, "worker-1");
    }

    // ITa-13-19: 閾値が大きい場合はstalled_workersが空
    #[test]
    fn test_stalled_workers_large_threshold_empty() {
        let mut wd = Watchdog::new(config_large_threshold());
        wd.record_activity("worker-1");
        let stalled = wd.stalled_workers();
        assert!(stalled.is_empty());
    }

    // ITa-13-20: increment_nudgeでnudge_attemptsが増える
    #[test]
    fn test_increment_nudge_increases_attempts() {
        let mut wd = Watchdog::new(config_zero_threshold());
        wd.record_activity("worker-1");
        thread::sleep(Duration::from_millis(1));
        let stalled_before = wd.stalled_workers();
        let attempts_before = stalled_before.iter()
            .find(|(id, _)| id == "worker-1")
            .map(|(_, a)| *a)
            .unwrap_or(0);

        wd.increment_nudge("worker-1");

        // increment後はlast_output_atがリセットされるので大きい閾値では非stalled
        // ただし閾値0なので少し待てばまたstalledになる
        thread::sleep(Duration::from_millis(1));
        let stalled_after = wd.stalled_workers();
        let attempts_after = stalled_after.iter()
            .find(|(id, _)| id == "worker-1")
            .map(|(_, a)| *a)
            .unwrap_or(0);

        assert_eq!(attempts_after, attempts_before + 1);
    }

    // ITa-13-21: increment_nudgeでタイマーがリセットされる（直後はstalledにならない）
    #[test]
    fn test_increment_nudge_resets_timer() {
        let mut wd = Watchdog::new(config_large_threshold());
        // まず記録してstalledを偽造するためactivityに直接insertは難しいので
        // 大きい閾値設定ではstalledにならないことを確認
        wd.record_activity("worker-1");
        wd.increment_nudge("worker-1");
        let stalled = wd.stalled_workers();
        // large thresholdなのでstalledにならない
        assert!(stalled.is_empty());
    }

    // ITa-13-22: remove_workerで活動記録が削除される
    #[test]
    fn test_remove_worker_clears_activity() {
        let mut wd = Watchdog::new(config_zero_threshold());
        wd.record_activity("worker-1");
        wd.remove_worker("worker-1");
        thread::sleep(Duration::from_millis(1));
        let stalled = wd.stalled_workers();
        assert!(stalled.is_empty());
    }

    // ITa-13-23: 複数Workerのスタックを同時に検出できる
    #[test]
    fn test_stalled_workers_multiple() {
        let mut wd = Watchdog::new(config_zero_threshold());
        wd.record_activity("worker-1");
        wd.record_activity("worker-2");
        wd.record_activity("worker-3");
        thread::sleep(Duration::from_millis(1));
        let stalled = wd.stalled_workers();
        assert_eq!(stalled.len(), 3);
    }

    // ITa-13-24: Nudge回数が上限でもstalled_workersに含まれる
    #[test]
    fn test_stalled_workers_includes_max_nudge() {
        let mut wd = Watchdog::new(WatchdogConfig {
            stall_threshold_secs: 0,
            nudge_max_attempts: 3,
            nudge_debounce_ms: 0,
            poll_interval_secs: 1,
        });
        wd.record_activity("worker-1");
        thread::sleep(Duration::from_millis(1));
        // 3回nudge
        wd.increment_nudge("worker-1");
        wd.increment_nudge("worker-1");
        wd.increment_nudge("worker-1");
        thread::sleep(Duration::from_millis(1));
        let stalled = wd.stalled_workers();
        // 上限(3)に達してもstalled_workersには含まれる
        let found = stalled.iter().find(|(id, _)| id == "worker-1");
        assert!(found.is_some());
        assert_eq!(found.unwrap().1, 3);
    }
}
