// Port of src/main/terminal-history.ts: a panel's last output, replayed once per run.
use crate::store::write_atomic;
use regex::Regex;
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    sync::{LazyLock, Mutex},
};

// What must not run again. Queries would make the terminal answer into the new shell as if
// typed; modes (alt screen, mouse, bracketed paste) belonged to programs that are gone.
static LIVE_SEQUENCES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"\x1bP[\s\S]*?\x1b\\",              // DCS: capability and setting queries
        r"\x1b\]\d+;[^\x07\x1b]*\?(?:\x07|\x1b\\)", // OSC queries: colours, clipboard
        r"\x1b\[[?>=]?[\d;]*[cn]",           // device attributes and cursor position
        r"\x1b\[\??\d+\$p",                  // mode queries
        r"\x1b\[[\d;]*t",                    // window size and title queries
        r"\x1b\[\?[\d;]+[hl]",               // private modes
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

pub fn clean_for_replay(text: &str) -> String {
    LIVE_SEQUENCES.iter().fold(text.to_string(), |clean, re| re.replace_all(&clean, "").into_owned())
}

pub struct TerminalHistory {
    dir: PathBuf,
    taken: Mutex<HashSet<String>>,
}

// Panel ids reach the disk as file names, and they come from the renderer.
fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

impl TerminalHistory {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir, taken: Mutex::new(HashSet::new()) }
    }

    fn file(&self, id: &str) -> Option<PathBuf> {
        safe_id(id).then(|| self.dir.join(format!("{id}.log")))
    }

    pub fn save(&self, id: &str, text: &str) {
        let Some(file) = self.file(id) else { return };
        if fs::create_dir_all(&self.dir).is_ok() {
            write_atomic(&file, text);
        }
    }

    // Only the first start of a panel in each run gets its past back; a restart keeps the live one.
    pub fn take(&self, id: &str) -> String {
        let Some(file) = self.file(id) else { return String::new() };
        if !self.taken.lock().unwrap().insert(id.to_string()) {
            return String::new();
        }
        fs::read(&file).map(|b| clean_for_replay(&String::from_utf8_lossy(&b))).unwrap_or_default()
    }

    pub fn prune(&self, keep: &HashSet<String>) {
        let Ok(entries) = fs::read_dir(&self.dir) else { return };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(".tmp").unwrap_or(&name);
            let id = id.strip_suffix(".log").unwrap_or(id);
            if !keep.contains(id) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_and_colours_survive_a_replay() {
        let text = "C:\\repo>dir\r\n\x1b[32mok\x1b[0m\x1b[2J\x1b[H\x1b]0;titulo\x07fin";
        assert_eq!(clean_for_replay(text), text);
    }

    #[test]
    fn nothing_in_a_replay_can_make_the_terminal_answer_back() {
        let queries = ["\x1b[c", "\x1b[0c", "\x1b[>c", "\x1b[=c", "\x1b[5n", "\x1b[6n", "\x1b[?6n", "\x1b[?25$p", "\x1b[18t", "\x1b]10;?\x07", "\x1b]11;?\x1b\\", "\x1b]4;1;?\x07", "\x1b]52;c;?\x07", "\x1bP+q544e\x1b\\", "\x1bP$qm\x1b\\"];
        for q in queries {
            assert_eq!(clean_for_replay(&format!("a{q}b")), "ab", "{q:?}");
        }
    }

    #[test]
    fn modes_left_on_by_a_program_that_is_gone_are_dropped() {
        for m in ["\x1b[?1049h", "\x1b[?1049l", "\x1b[?1000h", "\x1b[?1006h", "\x1b[?2004h", "\x1b[?1004h", "\x1b[?25l", "\x1b[?9001h", "\x1b[?1;2h"] {
            assert_eq!(clean_for_replay(&format!("a{m}b")), "ab", "{m:?}");
        }
    }

    #[test]
    fn history_comes_back_once_per_run() {
        let dir = tempfile::tempdir().unwrap();
        TerminalHistory::new(dir.path().into()).save("panel-1", "hola\x1b[6n");
        let history = TerminalHistory::new(dir.path().into());
        assert_eq!(history.take("panel-1"), "hola");
        assert_eq!(history.take("panel-1"), "");
        assert_eq!(TerminalHistory::new(dir.path().join("nowhere")).take("panel-2"), "");
    }

    #[test]
    fn a_hostile_panel_id_never_reaches_the_disk() {
        let dir = tempfile::tempdir().unwrap();
        let history = TerminalHistory::new(dir.path().join("history"));
        for id in ["../outside", "..\\outside", "a/b", "a.b", ""] {
            history.save(id, "secreto");
            assert_eq!(history.take(id), "");
        }
        assert!(!dir.path().join("outside.log").exists());
        assert!(!dir.path().join("history").exists());
    }

    #[test]
    fn history_of_cards_that_no_longer_exist_is_removed() {
        let dir = tempfile::tempdir().unwrap();
        let history = TerminalHistory::new(dir.path().into());
        history.save("keep-1", "a");
        history.save("gone-1", "b");
        fs::write(dir.path().join("gone-2.log.tmp"), "c").unwrap();
        history.prune(&HashSet::from(["keep-1".to_string()]));
        let names: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, ["keep-1.log"]);
        TerminalHistory::new(dir.path().join("nowhere")).prune(&HashSet::new());
    }
}
