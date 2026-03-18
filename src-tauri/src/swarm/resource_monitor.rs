/// ResourceMonitor — CPU/メモリ使用率を取得してWorker起動可否を判定 (Feature 12-5)
use serde::{Deserialize, Serialize};
use sysinfo::System;

// ─── 公開型 ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUsage {
    /// CPU 使用率 (0–100 %)
    pub cpu_pct: f32,
    /// 空きメモリ (GB)
    pub mem_free_gb: f32,
    /// 総メモリ (GB)
    pub mem_total_gb: f32,
    /// 起動抑制中かどうか (CPU > 75% または mem_free < 1 GB)
    pub spawn_suppressed: bool,
}

/// CPU・メモリ使用率を取得する
pub fn get_resource_usage() -> ResourceUsage {
    let mut sys = System::new_all();
    // CPU は 2 回測定が必要（初回は 0 になる）
    sys.refresh_cpu_all();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_pct = sys.global_cpu_usage();
    let mem_free_gb = sys.available_memory() as f32 / 1024.0 / 1024.0 / 1024.0;
    let mem_total_gb = sys.total_memory() as f32 / 1024.0 / 1024.0 / 1024.0;

    let spawn_suppressed = cpu_pct > 75.0 || mem_free_gb < 1.0;

    ResourceUsage {
        cpu_pct,
        mem_free_gb,
        mem_total_gb,
        spawn_suppressed,
    }
}

/// Worker を新規起動してよいかを判定する（起動OK条件: CPU < 75% かつ mem_free > 1 GB）
/// spawn_suppressed の閾値（UI表示）と統一する
pub fn can_spawn_worker() -> bool {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_pct = sys.global_cpu_usage();
    let mem_free_gb = sys.available_memory() as f32 / 1024.0 / 1024.0 / 1024.0;

    cpu_pct < 75.0 && mem_free_gb > 1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_usage_fields_are_valid() {
        let usage = get_resource_usage();
        assert!(usage.cpu_pct >= 0.0 && usage.cpu_pct <= 100.0);
        assert!(usage.mem_free_gb >= 0.0);
    }

    #[test]
    fn can_spawn_worker_returns_bool() {
        // 戻り値の型確認のみ（実際の値はシステム依存）
        let _ = can_spawn_worker();
    }
}
