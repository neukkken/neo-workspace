// Port of src/main/agent-activity.ts. Methods return the changes instead of calling back,
// so the caller can emit them after releasing the lock.
use regex::Regex;
use serde::Serialize;
use std::{collections::HashMap, sync::LazyLock};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentChange {
    pub panel_id: String,
    pub state: &'static str, // working | done | exited | stopped
    pub started_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
}

#[derive(Default)]
struct Panel {
    started_at: Option<i64>,
    last_output_at: i64,
    working: bool,
    titled: bool,
}

// Without a title signal: sustained output followed by silence. Long enough that
// a directory listing or a server logging now and then doesn't count as work.
pub const MIN_BUSY_MS: i64 = 15_000;
pub const QUIET_MS: i64 = 6_000;

// Agents that animate the terminal title report their state exactly, so short turns count too.
// Claude Code alternates ◐ ◑ while working and shows ✳ when it's free.
static SPINNER_TITLE: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[◐◑◒◓\u{2800}-\u{28FF}]").unwrap());
static TITLE_OSC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)").unwrap());

fn last_title(data: &str) -> Option<&str> {
    if !data.contains("\x1b]") {
        return None;
    }
    TITLE_OSC.captures_iter(data).last().map(|c| c.get(1).unwrap().as_str())
}

fn change(panel_id: &str, state: &'static str, started_at: Option<i64>) -> AgentChange {
    AgentChange { panel_id: panel_id.into(), state, started_at, exit_code: None }
}

#[derive(Default)]
pub struct AgentActivity {
    panels: HashMap<String, Panel>,
}

impl AgentActivity {
    fn begin(panel_id: &str, panel: &mut Panel, now: i64, out: &mut Vec<AgentChange>) {
        panel.started_at.get_or_insert(now);
        if panel.working {
            return;
        }
        panel.working = true;
        out.push(change(panel_id, "working", panel.started_at));
    }

    fn finish(panel_id: &str, panel: &mut Panel, out: &mut Vec<AgentChange>) {
        if panel.working {
            out.push(change(panel_id, "done", panel.started_at));
        }
        panel.working = false;
        panel.started_at = None;
    }

    pub fn on_output(&mut self, panel_id: &str, data: &str, now: i64) -> Vec<AgentChange> {
        let mut out = Vec::new();
        let panel = self.panels.entry(panel_id.to_string()).or_default();
        panel.last_output_at = now;

        match last_title(data) {
            Some(title) if SPINNER_TITLE.is_match(title) => {
                // Whatever ran before the agent spoke up wasn't its work
                if !panel.titled {
                    panel.started_at = None;
                }
                panel.titled = true;
                Self::begin(panel_id, panel, now, &mut out);
            }
            Some(title) if panel.titled || title.starts_with('✳') => {
                // ✳ means the agent is still open, so its screen redraws aren't work either
                panel.titled = title.starts_with('✳');
                Self::finish(panel_id, panel, &mut out);
            }
            _ => {}
        }
        if panel.titled {
            return out;
        }

        let started = *panel.started_at.get_or_insert(now);
        if now - started >= MIN_BUSY_MS {
            Self::begin(panel_id, panel, now, &mut out);
        }
        out
    }

    // Keystrokes echo back as output; only Enter can start real work.
    pub fn on_input(&mut self, panel_id: &str, data: &str) {
        if let Some(panel) = self.panels.get_mut(panel_id) {
            if !panel.working && !data.contains('\r') {
                panel.started_at = None;
            }
        }
    }

    // Also the safety net for titled agents: a title split across two chunks can't leave one stuck.
    pub fn tick(&mut self, now: i64) -> Vec<AgentChange> {
        let mut out = Vec::new();
        for (id, panel) in self.panels.iter_mut() {
            if panel.started_at.is_some() && now - panel.last_output_at >= QUIET_MS {
                Self::finish(id, panel, &mut out);
            }
        }
        out
    }

    pub fn on_exit(&mut self, panel_id: &str, exit_code: i64) -> AgentChange {
        let started_at = self.panels.remove(panel_id).and_then(|p| p.started_at);
        AgentChange { exit_code: Some(exit_code), ..change(panel_id, "exited", started_at) }
    }

    pub fn working_panels(&self) -> Vec<String> {
        self.panels.iter().filter(|(_, p)| p.working).map(|(id, _)| id.clone()).collect()
    }

    // The user killed or restarted it: nothing to report as finished.
    pub fn forget(&mut self, panel_id: &str) -> Option<AgentChange> {
        let panel = self.panels.remove(panel_id)?;
        panel.working.then(|| change(panel_id, "stopped", panel.started_at))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn title(t: &str) -> String {
        format!("\x1b]0;{t}\x07")
    }
    fn states(c: &[AgentChange]) -> Vec<&'static str> {
        c.iter().map(|c| c.state).collect()
    }
    // Output every second from `from` for `seconds`
    fn stream(a: &mut AgentActivity, log: &mut Vec<AgentChange>, from: i64, seconds: i64, data: &str) -> i64 {
        for s in 0..=seconds {
            log.extend(a.on_output("p", data, from + s * 1000));
        }
        from + seconds * 1000
    }

    #[test]
    fn sustained_output_then_silence_is_one_finished_run() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        let end = stream(&mut a, &mut log, 0, 20, "x");
        log.extend(a.tick(end + QUIET_MS - 1));
        assert_eq!(states(&log), ["working"]);
        log.extend(a.tick(end + QUIET_MS));
        assert_eq!(states(&log), ["working", "done"]);
        assert_eq!(log[1].started_at, Some(0));
        assert!(a.working_panels().is_empty());
    }

    #[test]
    fn short_bursts_and_occasional_logs_never_count() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        log.extend(a.on_output("p", "dir output", 0));
        log.extend(a.tick(QUIET_MS));
        for i in 1..=6 {
            log.extend(a.on_output("p", "request log", i * 10_000));
            log.extend(a.tick(i * 10_000 + QUIET_MS));
        }
        assert!(log.is_empty());
    }

    #[test]
    fn typing_is_not_work_enter_lets_the_run_count() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        for s in 0..=30 {
            log.extend(a.on_output("p", "a", s * 1000));
            a.on_input("p", "a");
        }
        assert!(log.is_empty());
        a.on_input("p", "\r");
        stream(&mut a, &mut log, 31_000, 20, "x");
        assert_eq!(states(&log), ["working"]);
    }

    #[test]
    fn a_spinner_title_reports_a_short_turn_exactly() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        log.extend(a.on_output("p", &title("✳ Claude Code"), 0));
        log.extend(a.on_output("p", &title("◐ Claude Code"), 1000));
        log.extend(a.on_output("p", &format!("{}text", title("◑ Faros")), 2000));
        log.extend(a.on_output("p", &title("✳ Faros"), 4000));
        assert_eq!(states(&log), ["working", "done"]);
        assert_eq!(log[0].started_at, Some(1000));
    }

    #[test]
    fn redraws_of_an_idle_titled_agent_are_not_work() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        log.extend(a.on_output("p", &title("◐ Faros"), 0));
        log.extend(a.on_output("p", &title("✳ Faros"), 1000));
        stream(&mut a, &mut log, 2000, 30, "redraw");
        log.extend(a.tick(40_000));
        assert_eq!(states(&log), ["working", "done"]);
    }

    #[test]
    fn after_the_agent_closes_the_generic_rule_applies_again() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        log.extend(a.on_output("p", &title("◐ Faros"), 0));
        log.extend(a.on_output("p", &title("✳ Faros"), 1000));
        log.extend(a.on_output("p", &title("cmd.exe"), 2000));
        let end = stream(&mut a, &mut log, 3000, 20, "x");
        log.extend(a.tick(end + QUIET_MS));
        assert_eq!(states(&log), ["working", "done", "working", "done"]);
    }

    #[test]
    fn a_lost_idle_title_still_ends_the_run() {
        let (mut a, mut log) = (AgentActivity::default(), vec![]);
        log.extend(a.on_output("p", &title("◐ Faros"), 0));
        log.extend(a.on_output("p", "\x1b]0;✳ Fa", 1000));
        log.extend(a.on_output("p", "ros\x07", 1001));
        log.extend(a.tick(1001 + QUIET_MS));
        assert_eq!(states(&log), ["working", "done"]);
    }

    #[test]
    fn exit_carries_its_code_and_stopping_on_purpose_is_not_a_finished_run() {
        let mut a = AgentActivity::default();
        let exit = a.on_exit("p", 3);
        assert_eq!((exit.state, exit.exit_code, exit.started_at), ("exited", Some(3), None));

        let mut log = vec![];
        stream(&mut a, &mut log, 0, 20, "x");
        log.extend(a.forget("p"));
        log.extend(a.tick(60_000));
        assert_eq!(states(&log), ["working", "stopped"]);

        let mut quiet = AgentActivity::default();
        quiet.on_output("p", "x", 0);
        assert!(quiet.forget("p").is_none());
    }
}
