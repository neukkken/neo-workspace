// Port of src/main/workspace-clock.ts (same file format: workspace-time.json).
use chrono::{Datelike, Duration, Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};

// Running workspaces are banked every minute, so a longer gap means the computer slept.
pub const MAX_GAP_MS: i64 = 5 * 60 * 1000;

#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct Banked {
    total_ms: i64,
    week_start: i64,
    week_ms: i64,
}

struct Session {
    started_at: i64,
    counted_to: i64,
    paused: bool,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTime {
    pub elapsed_ms: i64,
    pub total_ms: i64,
    pub week_ms: i64,
    pub paused: bool,
}

// Monday 00:00, local time
pub fn week_start_of(at: i64) -> i64 {
    let day = Local.timestamp_millis_opt(at).earliest().unwrap_or_else(Local::now);
    let monday = day.date_naive() - Duration::days(day.weekday().num_days_from_monday() as i64);
    let midnight = monday.and_hms_opt(0, 0, 0).expect("midnight exists");
    Local.from_local_datetime(&midnight).earliest().map_or(at, |d| d.timestamp_millis())
}

pub struct WorkspaceClock {
    path: PathBuf,
    banked: HashMap<String, Banked>,
    sessions: HashMap<String, Session>,
}

impl WorkspaceClock {
    pub fn new(path: PathBuf) -> Self {
        // First run or a damaged file: counting restarts from zero.
        let banked = fs::read_to_string(&path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default();
        Self { path, banked, sessions: HashMap::new() }
    }

    pub fn set_running(&mut self, ids: &[String], now: i64) {
        let stopped: Vec<String> = self.sessions.keys().filter(|id| !ids.contains(id)).cloned().collect();
        for id in &stopped {
            self.bank(id, now);
            self.sessions.remove(id);
        }
        for id in ids {
            self.sessions.entry(id.clone()).or_insert(Session { started_at: now, counted_to: now, paused: false });
        }
        if !stopped.is_empty() {
            self.save();
        }
    }

    // A paused workspace stands still: neither the stopwatch nor its totals move.
    pub fn pause_where(&mut self, is_paused: impl Fn(&str) -> bool, now: i64) {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.bank(&id, now);
            if let Some(s) = self.sessions.get_mut(&id) {
                s.paused = is_paused(&id);
            }
        }
    }

    // Run periodically, so a crash costs a minute at most.
    pub fn flush(&mut self, now: i64) {
        if self.sessions.is_empty() {
            return;
        }
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.bank(&id, now);
        }
        self.save();
    }

    pub fn read(&mut self, id: &str, now: i64) -> WorkspaceTime {
        self.bank(id, now);
        let banked = self.banked.get(id);
        let session = self.sessions.get(id);
        WorkspaceTime {
            elapsed_ms: session.map_or(0, |s| now - s.started_at),
            total_ms: banked.map_or(0, |b| b.total_ms),
            week_ms: banked.filter(|b| b.week_start == week_start_of(now)).map_or(0, |b| b.week_ms),
            paused: session.is_some_and(|s| s.paused),
        }
    }

    fn bank(&mut self, id: &str, now: i64) {
        let Some(session) = self.sessions.get_mut(id) else { return };
        let gap = now - session.counted_to;
        session.counted_to = now;
        if session.paused || gap < 0 || gap > MAX_GAP_MS {
            session.started_at += gap;
            return;
        }
        let week_start = week_start_of(now);
        let prev = self.banked.get(id).copied();
        let week_ms = prev.filter(|b| b.week_start == week_start).map_or(0, |b| b.week_ms);
        self.banked.insert(
            id.to_string(),
            Banked {
                total_ms: prev.map_or(0, |b| b.total_ms) + gap,
                week_start,
                week_ms: week_ms + now - (now - gap).max(week_start),
            },
        );
    }

    fn save(&self) {
        crate::store::write_atomic(&self.path, &serde_json::to_string(&self.banked).unwrap_or_default());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINUTE: i64 = 60_000;
    const HOUR: i64 = 60 * MINUTE;

    fn at(m: u32, d: u32, h: u32, min: u32) -> i64 {
        Local.with_ymd_and_hms(2026, m, d, h, min, 0).unwrap().timestamp_millis()
    }
    fn monday() -> i64 {
        at(10, 26, 9, 0)
    }
    fn file() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace-time.json");
        (dir, path)
    }
    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }
    fn t(elapsed: i64, total: i64, week: i64, paused: bool) -> WorkspaceTime {
        WorkspaceTime { elapsed_ms: elapsed, total_ms: total, week_ms: week, paused }
    }

    #[test]
    fn the_week_starts_on_monday_at_midnight_local_time() {
        let start = at(10, 26, 0, 0);
        assert_eq!(week_start_of(start), start);
        assert_eq!(week_start_of(at(11, 1, 23, 59)), start);
        assert_eq!(week_start_of(at(10, 25, 23, 59)), at(10, 19, 0, 0));
    }

    #[test]
    fn counts_from_the_start_and_keeps_the_totals_once_stopped() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.set_running(&ids(&["a"]), m + MINUTE);
        assert_eq!(c.read("a", m + 2 * MINUTE), t(2 * MINUTE, 2 * MINUTE, 2 * MINUTE, false));
        c.set_running(&[], m + 3 * MINUTE);
        assert_eq!(c.read("a", m + HOUR), t(0, 3 * MINUTE, 3 * MINUTE, false));
    }

    #[test]
    fn each_session_adds_to_the_total_and_the_stopwatch_starts_over() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.set_running(&[], m + 2 * MINUTE);
        c.set_running(&ids(&["a"]), m + HOUR);
        assert_eq!(c.read("a", m + HOUR + MINUTE), t(MINUTE, 3 * MINUTE, 3 * MINUTE, false));
    }

    #[test]
    fn workspaces_count_on_their_own() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.set_running(&ids(&["a", "b"]), m + MINUTE);
        assert_eq!(c.read("a", m + 2 * MINUTE).total_ms, 2 * MINUTE);
        assert_eq!(c.read("b", m + 2 * MINUTE).total_ms, MINUTE);
        assert_eq!(c.read("nunca", m).total_ms, 0);
    }

    #[test]
    fn a_crash_keeps_everything_up_to_the_last_flush() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p.clone());
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.flush(m + MINUTE);
        assert_eq!(WorkspaceClock::new(p).read("a", m + HOUR), t(0, MINUTE, MINUTE, false));
    }

    #[test]
    fn a_session_crossing_into_monday_only_counts_this_week_from_midnight() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let sunday = at(10, 25, 23, 59);
        c.set_running(&ids(&["a"]), sunday);
        assert_eq!(c.read("a", sunday + 3 * MINUTE), t(3 * MINUTE, 3 * MINUTE, 2 * MINUTE, false));
    }

    #[test]
    fn a_new_week_starts_at_zero_and_keeps_the_total() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.set_running(&[], m + 2 * MINUTE);
        assert_eq!(c.read("a", m + 7 * 24 * HOUR), t(0, 2 * MINUTE, 0, false));
    }

    #[test]
    fn a_paused_workspace_stands_still_then_carries_on() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.pause_where(|_| true, m + 2 * MINUTE);
        assert_eq!(c.read("a", m + 2 * MINUTE + 30_000), t(2 * MINUTE, 2 * MINUTE, 2 * MINUTE, true));
        c.pause_where(|_| true, m + 3 * HOUR);
        c.pause_where(|_| false, m + 3 * HOUR);
        assert_eq!(c.read("a", m + 3 * HOUR + MINUTE), t(3 * MINUTE, 3 * MINUTE, 3 * MINUTE, false));
    }

    #[test]
    fn pausing_one_workspace_leaves_the_others_counting() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a", "b"]), m);
        c.pause_where(|id| id == "a", m);
        assert_eq!(c.read("a", m + MINUTE).total_ms, 0);
        assert_eq!(c.read("b", m + MINUTE).total_ms, MINUTE);
    }

    #[test]
    fn flushing_while_paused_adds_nothing() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.pause_where(|_| true, m);
        c.flush(m + MINUTE);
        c.flush(m + 2 * MINUTE);
        assert_eq!(c.read("a", m + 3 * MINUTE).total_ms, 0);
    }

    #[test]
    fn time_asleep_or_a_clock_moved_back_counts_for_nothing() {
        let (_d, p) = file();
        let mut c = WorkspaceClock::new(p);
        let m = monday();
        c.set_running(&ids(&["a"]), m);
        c.flush(m + MINUTE);
        let wake = m + MINUTE + MAX_GAP_MS + 8 * HOUR;
        assert_eq!(c.read("a", wake), t(MINUTE, MINUTE, MINUTE, false));
        assert_eq!(c.read("a", wake - HOUR), t(MINUTE, MINUTE, MINUTE, false));
    }

    #[test]
    fn a_damaged_file_starts_from_zero() {
        for content in ["{ not json", "null"] {
            let (_d, p) = file();
            fs::write(&p, content).unwrap();
            let mut c = WorkspaceClock::new(p.clone());
            let m = monday();
            assert_eq!(c.read("a", m).total_ms, 0);
            c.set_running(&ids(&["a"]), m);
            c.set_running(&[], m + MINUTE);
            assert_eq!(WorkspaceClock::new(p).read("a", m).total_ms, MINUTE);
        }
    }
}
