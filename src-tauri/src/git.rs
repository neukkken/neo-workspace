// Port of src/main/git-branches.ts and git-session.ts.
use futures_util::future::join_all;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{process::Command, sync::OnceCell, time::timeout};

pub fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    cmd
}

// A folder is a repo itself, or holds repos one level down (the workspace's projects).
pub fn find_repos(folder: &str) -> Vec<String> {
    let root = Path::new(folder);
    if !root.exists() {
        return vec![];
    }
    if root.join(".git").exists() {
        return vec![folder.to_string()];
    }
    let Ok(entries) = std::fs::read_dir(root) else { return vec![] };
    let mut repos: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_dir() && e.path().join(".git").exists())
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect();
    repos.sort();
    repos
}

pub fn unique_repos(folders: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    folders.iter().filter(|f| !f.is_empty()).flat_map(|f| find_repos(f)).filter(|r| seen.insert(r.clone())).collect()
}

fn base_name(path: &str) -> String {
    Path::new(path).file_name().map_or(String::new(), |n| n.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct GitBranchInfo {
    name: String,
    branch: String,
}

pub async fn read_branches(folders: &[String]) -> Vec<GitBranchInfo> {
    let reads = unique_repos(folders).into_iter().map(|dir| async move {
        let run = command("git").args(["rev-parse", "--abbrev-ref", "HEAD"]).current_dir(&dir).output();
        let branch = match timeout(Duration::from_secs(3), run).await {
            Ok(Ok(out)) if out.status.success() => Some(String::from_utf8_lossy(&out.stdout).trim().to_string()),
            _ => None,
        };
        branch.map(|branch| GitBranchInfo { name: base_name(&dir), branch })
    });
    join_all(reads).await.into_iter().flatten().collect()
}

#[derive(Serialize, Clone)]
pub struct SessionFile {
    path: String,
    // git's letter (A, M, D, T), or U for a file created this session that git doesn't track
    status: String,
    added: Option<i64>,
    removed: Option<i64>,
}

#[derive(Serialize)]
pub struct Commit {
    hash: String,
    subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChanges {
    repo: String,
    name: String,
    branch: String,
    has_baseline: bool,
    commits: Vec<Commit>,
    files: Vec<SessionFile>,
    truncated: bool,
}

#[derive(Clone)]
pub struct Baseline {
    commit: String,
    head: String,
    untracked: HashSet<String>,
}

const MAX_FILES: usize = 1000;
const MAX_COMMITS: usize = 50;

// Agents run git at the same time: no optional locks, or polling collides with their index.lock.
// fsmonitor and external diff would run commands from the repo's own config.
async fn git(repo: &str, args: &[&str], ok_codes: &[i32]) -> Result<String, String> {
    let run = command("git")
        .args(["--no-optional-locks", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.quotepath=false"])
        .args(args)
        .current_dir(repo)
        .output();
    let out = timeout(Duration::from_secs(15), run).await.map_err(|_| "git timed out".to_string())?.map_err(|e| e.to_string())?;
    if out.status.code().is_some_and(|c| ok_codes.contains(&c)) {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

fn split_nul(output: &str) -> Vec<&str> {
    output.split('\0').filter(|s| !s.is_empty()).collect()
}

async fn list_untracked(repo: &str) -> Result<Vec<String>, String> {
    let out = git(repo, &["ls-files", "-z", "--others", "--exclude-standard"], &[0]).await?;
    Ok(split_nul(&out).into_iter().map(String::from).collect())
}

async fn capture_baseline(repo: String) -> Option<Baseline> {
    let head = git(&repo, &["rev-parse", "HEAD"], &[0]).await.ok()?.trim().to_string();
    // A commit of the dirty tree with no ref: touches neither the files, the index nor the stash list.
    // Empty when the tree is clean, and it refuses during a merge; HEAD is the baseline then.
    let dirty = git(&repo, &["stash", "create"], &[0]).await.unwrap_or_default().trim().to_string();
    let untracked = list_untracked(&repo).await.ok()?.into_iter().collect();
    Some(Baseline { commit: if dirty.is_empty() { head.clone() } else { dirty }, head, untracked })
}

#[derive(Default)]
pub struct GitSession {
    baselines: Mutex<HashMap<String, Arc<OnceCell<Option<Baseline>>>>>,
}

impl GitSession {
    fn cell(&self, repo: &str) -> Arc<OnceCell<Option<Baseline>>> {
        self.baselines.lock().unwrap().entry(repo.to_string()).or_default().clone()
    }

    fn known(&self, repo: &str) -> bool {
        self.baselines.lock().unwrap().contains_key(repo)
    }

    pub async fn ensure_baseline(&self, repo: &str) -> Option<Baseline> {
        self.cell(repo).get_or_init(|| capture_baseline(repo.to_string())).await.clone()
    }

    // None for a repo no terminal or card has opened; Some(has_baseline) otherwise.
    pub async fn reset(&self, repo: &str) -> Option<bool> {
        if self.baselines.lock().unwrap().remove(repo).is_none() {
            return None;
        }
        Some(self.ensure_baseline(repo).await.is_some())
    }

    async fn list_files(repo: &str, base: &Baseline) -> Result<Vec<SessionFile>, String> {
        let diff = |flag| ["diff", "--no-ext-diff", "--no-renames", "-z", flag, base.commit.as_str()];
        let (status_args, numstat_args) = (diff("--name-status"), diff("--numstat"));
        let (statuses, numstat, untracked) = tokio::join!(git(repo, &status_args, &[0]), git(repo, &numstat_args, &[0]), list_untracked(repo));
        let (statuses, numstat, untracked) = (statuses?, numstat?, untracked?);

        let mut counts: HashMap<String, (Option<i64>, Option<i64>)> = HashMap::new();
        for line in split_nul(&numstat) {
            let mut parts = line.split('\t');
            let (added, removed) = (parts.next().unwrap_or("-"), parts.next().unwrap_or("-"));
            // Binary files report "-" instead of line counts
            counts.insert(parts.collect::<Vec<_>>().join("\t"), (added.parse().ok(), removed.parse().ok()));
        }

        let fields = split_nul(&statuses);
        let mut files: Vec<SessionFile> = fields
            .chunks_exact(2)
            .map(|pair| {
                let (added, removed) = counts.get(pair[1]).copied().unwrap_or((None, None));
                SessionFile { path: pair[1].into(), status: pair[0].into(), added, removed }
            })
            .collect();
        // shortcut: a file untracked since before the session is skipped even if edited since; a snapshot of it would be needed to diff it
        files.extend(
            untracked
                .into_iter()
                .filter(|p| !base.untracked.contains(p))
                .map(|path| SessionFile { path, status: "U".into(), added: None, removed: None }),
        );
        Ok(files)
    }

    // None for a repo no terminal or card has opened: the renderer can't reach arbitrary folders.
    pub async fn changes(&self, repo: &str) -> Option<SessionChanges> {
        if !self.known(repo) {
            return None;
        }
        let base = self.ensure_baseline(repo).await;
        let branch = git(repo, &["rev-parse", "--abbrev-ref", "HEAD"], &[0]).await.unwrap_or_default().trim().to_string();
        let mut out = SessionChanges {
            repo: repo.into(),
            name: base_name(repo),
            branch,
            has_baseline: base.is_some(),
            commits: vec![],
            files: vec![],
            truncated: false,
        };
        let Some(base) = base else { return Some(out) };

        let range = format!("{}..HEAD", base.head);
        let max = format!("-{MAX_COMMITS}");
        let log_args = ["log", max.as_str(), "--format=%h%x09%s", range.as_str()];
        let (files, log) = tokio::join!(Self::list_files(repo, &base), git(repo, &log_args, &[0]));
        out.commits = log
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let (hash, subject) = line.split_once('\t').unwrap_or((line, ""));
                Commit { hash: hash.into(), subject: subject.into() }
            })
            .collect();
        let mut files = files.unwrap_or_default();
        out.truncated = files.len() > MAX_FILES;
        files.truncate(MAX_FILES);
        out.files = files;
        Some(out)
    }

    // Only files the current listing reports: `--no-index` would otherwise read any path on disk.
    pub async fn file_diff(&self, repo: &str, file: &str) -> Option<String> {
        if !self.known(repo) {
            return None;
        }
        let base = self.ensure_baseline(repo).await?;
        let entry = Self::list_files(repo, &base).await.ok()?.into_iter().find(|f| f.path == file)?;
        let args = ["diff", "--no-ext-diff", "--no-color", "--no-renames"];
        if entry.status == "U" {
            git(repo, &[&args[..], &["--no-index", "--", "/dev/null", file]].concat(), &[0, 1]).await.ok()
        } else {
            git(repo, &[&args[..], &[base.commit.as_str(), "--", file]].concat(), &[0]).await.ok()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    fn sh(repo: &Path, args: &[&str]) -> String {
        let out = std::process::Command::new("git").args(args).current_dir(repo).output().unwrap();
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    fn make_repo(commit: bool) -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        sh(p, &["init", "-q"]);
        for kv in [["user.email", "test@neowork.dev"], ["user.name", "test"], ["core.autocrlf", "false"]] {
            sh(p, &["config", kv[0], kv[1]]);
        }
        fs::write(p.join(".gitignore"), "ignored.log\n").unwrap();
        fs::write(p.join("a.txt"), "uno\ndos\n").unwrap();
        fs::write(p.join("b.txt"), "be\n").unwrap();
        if commit {
            sh(p, &["add", "."]);
            sh(p, &["commit", "-qm", "base"]);
        }
        let repo = p.to_string_lossy().into_owned();
        (dir, repo)
    }

    fn by_path(c: &SessionChanges) -> HashMap<String, SessionFile> {
        c.files.iter().map(|f| (f.path.clone(), f.clone())).collect()
    }
    fn path(repo: &str, f: &str) -> PathBuf {
        Path::new(repo).join(f)
    }

    #[tokio::test]
    async fn a_clean_repo_starts_with_nothing_and_reports_what_happens_after() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        assert!(s.changes(&repo).await.unwrap().files.is_empty());

        fs::write(path(&repo, "a.txt"), "uno\ncambio\ntres\n").unwrap();
        fs::remove_file(path(&repo, "b.txt")).unwrap();
        fs::write(path(&repo, "nuevo.txt"), "hola\n").unwrap();
        fs::write(path(&repo, "ignored.log"), "ruido\n").unwrap();

        let files = by_path(&s.changes(&repo).await.unwrap());
        let mut keys: Vec<_> = files.keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["a.txt", "b.txt", "nuevo.txt"]);
        assert_eq!((files["a.txt"].status.as_str(), files["a.txt"].added, files["a.txt"].removed), ("M", Some(2), Some(1)));
        assert_eq!(files["b.txt"].status, "D");
        assert_eq!(files["nuevo.txt"].status, "U");
    }

    #[tokio::test]
    async fn work_already_uncommitted_at_the_start_is_not_part_of_the_session() {
        let (_d, repo) = make_repo(true);
        fs::write(path(&repo, "a.txt"), "de antes\n").unwrap();
        fs::write(path(&repo, "previo.txt"), "de antes\n").unwrap();
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        assert!(s.changes(&repo).await.unwrap().files.is_empty());

        fs::write(path(&repo, "a.txt"), "de antes\ny de ahora\n").unwrap();
        let paths: Vec<_> = s.changes(&repo).await.unwrap().files.into_iter().map(|f| f.path).collect();
        assert_eq!(paths, ["a.txt"]);
        let diff = s.file_diff(&repo, "a.txt").await.unwrap();
        assert!(diff.lines().any(|l| l == "+y de ahora") && !diff.lines().any(|l| l == "-uno"));
    }

    #[tokio::test]
    async fn commits_made_during_the_session_stay_visible() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        fs::write(path(&repo, "a.txt"), "uno\ndos\ntres\n").unwrap();
        sh(Path::new(&repo), &["commit", "-qam", "agente: añade tres"]);
        let c = s.changes(&repo).await.unwrap();
        assert_eq!(c.files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), ["a.txt"]);
        assert_eq!(c.commits.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), ["agente: añade tres"]);
    }

    #[tokio::test]
    async fn capturing_the_baseline_leaves_the_repo_untouched() {
        let (_d, repo) = make_repo(true);
        let p = Path::new(&repo);
        fs::write(path(&repo, "a.txt"), "sin guardar\n").unwrap();
        sh(p, &["add", "a.txt"]);
        fs::write(path(&repo, "b.txt"), "sin preparar\n").unwrap();
        let before = sh(p, &["status", "--porcelain"]);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        s.changes(&repo).await;
        assert_eq!(sh(p, &["status", "--porcelain"]), before);
        assert_eq!(sh(p, &["stash", "list"]), "");
        assert_eq!(fs::read_to_string(path(&repo, "a.txt")).unwrap(), "sin guardar\n");
    }

    #[tokio::test]
    async fn a_new_session_starts_counting_again() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        fs::write(path(&repo, "a.txt"), "cambio\n").unwrap();
        assert_eq!(s.changes(&repo).await.unwrap().files.len(), 1);
        assert_eq!(s.reset(&repo).await, Some(true));
        assert_eq!(s.changes(&repo).await.unwrap().files.len(), 0);
    }

    #[tokio::test]
    async fn new_untracked_files_can_be_diffed_with_odd_names_too() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        let names = ["con espacio.txt", "ñandú.txt", "[corchete].txt"];
        for n in names {
            fs::write(path(&repo, n), "contenido\n").unwrap();
        }
        let mut got: Vec<_> = s.changes(&repo).await.unwrap().files.into_iter().map(|f| f.path).collect();
        got.sort();
        let mut want = names.map(String::from).to_vec();
        want.sort();
        assert_eq!(got, want);
        for n in names {
            assert!(s.file_diff(&repo, n).await.unwrap().lines().any(|l| l == "+contenido"), "{n}");
        }
    }

    #[tokio::test]
    async fn binary_files_carry_no_line_counts() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        fs::write(path(&repo, "a.txt"), [0u8, 1, 2, 0, 255]).unwrap();
        let f = s.changes(&repo).await.unwrap().files.remove(0);
        assert_eq!((f.added, f.removed), (None, None));
    }

    #[tokio::test]
    async fn a_repo_without_commits_reports_no_baseline_instead_of_failing() {
        let (_d, repo) = make_repo(false);
        let s = GitSession::default();
        assert!(s.ensure_baseline(&repo).await.is_none());
        let c = s.changes(&repo).await.unwrap();
        assert!(!c.has_baseline && c.files.is_empty());
        assert!(s.file_diff(&repo, "a.txt").await.is_none());
    }

    #[tokio::test]
    async fn only_files_in_the_current_listing_can_be_read() {
        let (_d, repo) = make_repo(true);
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), "secreto\n").unwrap();
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        fs::write(path(&repo, "a.txt"), "cambio\n").unwrap();
        let abs = outside.path().join("secret.txt").to_string_lossy().into_owned();
        for f in [abs.as_str(), "../secret.txt", "..\\secret.txt", "b.txt", ""] {
            assert!(s.file_diff(&repo, f).await.is_none(), "{f}");
        }
    }

    #[tokio::test]
    async fn a_folder_no_session_opened_is_out_of_reach() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        fs::write(path(&repo, "a.txt"), "cambio\n").unwrap();
        assert!(s.changes(&repo).await.is_none());
        assert!(s.file_diff(&repo, "a.txt").await.is_none());
        assert!(s.reset(&repo).await.is_none());
    }

    #[tokio::test]
    async fn polling_takes_no_lock_while_another_process_holds_the_index() {
        let (_d, repo) = make_repo(true);
        let s = GitSession::default();
        s.ensure_baseline(&repo).await;
        fs::write(path(&repo, "a.txt"), "cambio\n").unwrap();
        let lock = Path::new(&repo).join(".git").join("index.lock");
        fs::write(&lock, "").unwrap();
        assert_eq!(s.changes(&repo).await.unwrap().files.len(), 1);
        assert!(s.file_diff(&repo, "a.txt").await.is_some());
        assert!(lock.exists());
    }

    #[test]
    fn finds_repos_in_a_folder_or_one_level_down() {
        let (_d, repo) = make_repo(true);
        assert_eq!(find_repos(&repo), [repo.clone()]);
        let outer = tempfile::tempdir().unwrap();
        let inner = outer.path().join("proj");
        fs::create_dir_all(inner.join(".git")).unwrap();
        fs::create_dir_all(outer.path().join("plain")).unwrap();
        assert_eq!(find_repos(outer.path().to_str().unwrap()), [inner.to_string_lossy().into_owned()]);
        assert!(find_repos("/nonexistent/folder").is_empty());
    }
}
