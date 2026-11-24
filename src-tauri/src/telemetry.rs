// Port of src/main/telemetry.ts and process-tree.ts. One sysinfo path for every OS: each
// panel is measured over its whole process tree (a shell is idle, its programs are not).
use crate::pty::PtyManager;
use serde::Serialize;
use std::{collections::HashMap, sync::Arc, time::Duration};
use sysinfo::{Pid, ProcessesToUpdate, System};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub cpu: f64,
    pub memory_mb: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    cpu_percent: i64,
    used_mem_mb: i64,
    total_mem_mb: i64,
}

#[derive(Serialize, Clone)]
pub struct TelemetryPayload {
    system: SystemMetrics,
    panels: HashMap<String, ProcessMetrics>,
}

pub struct Sample {
    pub pid: u32,
    pub ppid: Option<u32>,
    pub memory: u64,
    pub cpu: f32,
}

fn round(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

// `seen` because pids can be reused, so a dead parent's id could close a loop.
pub fn measure_tree(root: u32, processes: &[Sample]) -> ProcessMetrics {
    let mut pending = vec![root];
    let mut seen = std::collections::HashSet::new();
    let (mut memory, mut cpu) = (0u64, 0f64);
    while let Some(pid) = pending.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(p) = processes.iter().find(|p| p.pid == pid) {
            memory += p.memory;
            cpu += f64::from(p.cpu);
        }
        pending.extend(processes.iter().filter(|p| p.ppid == Some(pid)).map(|p| p.pid));
    }
    ProcessMetrics { cpu: round(cpu), memory_mb: round(memory as f64 / (1024.0 * 1024.0)) }
}

pub fn process_name(pid: u32) -> String {
    let mut sys = System::new();
    let pid = Pid::from_u32(pid);
    sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), false);
    sys.process(pid).map(|p| p.name().to_string_lossy().into_owned()).unwrap_or_default()
}

pub fn start(pty: Arc<PtyManager>, interval: Duration, on_update: impl Fn(TelemetryPayload) + Send + 'static) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        let mut tick = tokio::time::interval(interval);
        loop {
            tick.tick().await;
            let pids = pty.get_pids();
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            let mut panels = HashMap::new();
            if !pids.is_empty() {
                sys.refresh_processes(ProcessesToUpdate::All, true);
                let samples: Vec<Sample> = sys
                    .processes()
                    .iter()
                    .map(|(pid, p)| Sample { pid: pid.as_u32(), ppid: p.parent().map(Pid::as_u32), memory: p.memory(), cpu: p.cpu_usage() })
                    .collect();
                for (panel, pid) in pids {
                    panels.insert(panel, measure_tree(pid, &samples));
                }
            }
            let mb = |bytes: u64| (bytes as f64 / (1024.0 * 1024.0)).round() as i64;
            on_update(TelemetryPayload {
                system: SystemMetrics {
                    cpu_percent: sys.global_cpu_usage().round() as i64,
                    used_mem_mb: mb(sys.used_memory()),
                    total_mem_mb: mb(sys.total_memory()),
                },
                panels,
            });
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(pid: u32, ppid: u32, memory_mb: u64, cpu: f32) -> Sample {
        Sample { pid, ppid: Some(ppid), memory: memory_mb * 1024 * 1024, cpu }
    }

    #[test]
    fn sums_the_shell_and_everything_it_started() {
        let procs = [s(10, 1, 5, 0.0), s(11, 10, 100, 40.0), s(12, 11, 50, 10.5), s(99, 1, 1000, 90.0)];
        assert_eq!(measure_tree(10, &procs), ProcessMetrics { cpu: 50.5, memory_mb: 155.0 });
    }

    #[test]
    fn a_pid_loop_from_a_reused_id_does_not_hang() {
        let procs = [s(10, 12, 1, 1.0), s(11, 10, 1, 1.0), s(12, 11, 1, 1.0)];
        assert_eq!(measure_tree(10, &procs).memory_mb, 3.0);
    }

    #[test]
    fn an_unknown_root_measures_nothing() {
        assert_eq!(measure_tree(7, &[]), ProcessMetrics { cpu: 0.0, memory_mb: 0.0 });
    }
}
