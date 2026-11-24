// Port of src/main/shells.ts: which shells this machine offers and which one a request resolves to.
use serde::Serialize;
use std::{collections::HashMap, path::Path, process::Command};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ShellInfo {
    pub id: String,
    pub label: String,
    #[serde(skip)]
    pub path: String,
    #[serde(skip)]
    pub args: Vec<String>,
}

fn shell(id: &str, label: &str, path: &str, args: &[&str]) -> ShellInfo {
    ShellInfo { id: id.into(), label: label.into(), path: path.into(), args: args.iter().map(|a| a.to_string()).collect() }
}

pub struct Probe<'a> {
    pub windows: bool,
    pub env: &'a HashMap<String, String>,
    pub exists: &'a dyn Fn(&str) -> bool,
    pub has_wsl_distro: &'a dyn Fn(&str) -> bool,
    pub etc_shells: &'a str,
}

fn basename(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

fn windows_shells(p: &Probe) -> Vec<ShellInfo> {
    let var = |k: &str, d: &str| p.env.get(k).cloned().unwrap_or_else(|| d.to_string());
    let system32 = format!("{}\\System32", var("SystemRoot", "C:\\Windows"));
    let program_files = var("ProgramFiles", "C:\\Program Files");
    let on_path = |file: &str| -> Vec<String> {
        var("PATH", "").split(';').filter(|d| !d.is_empty()).map(|d| format!("{d}\\{file}")).collect()
    };
    let parent = |path: &str| path.rsplit_once('\\').map_or(String::new(), |(d, _)| d.to_string());

    // git.exe lives in <root>\cmd or <root>\bin; bash sits next to them
    let mut roots: Vec<String> = on_path("git.exe").into_iter().filter(|g| (p.exists)(g)).map(|g| parent(&parent(&g))).collect();
    roots.push(format!("{program_files}\\Git"));
    let bash: Vec<String> = roots.iter().flat_map(|r| [format!("{r}\\bin\\bash.exe"), format!("{r}\\usr\\bin\\bash.exe")]).collect();
    let wsl = format!("{system32}\\wsl.exe");

    let mut pwsh = on_path("pwsh.exe");
    pwsh.push(format!("{program_files}\\PowerShell\\7\\pwsh.exe"));

    let candidates: Vec<(ShellInfo, Vec<String>)> = vec![
        (shell("cmd", "Símbolo del sistema (cmd)", "", &[]), vec![var("COMSPEC", ""), format!("{system32}\\cmd.exe")]),
        (
            shell("powershell", "Windows PowerShell", "", &["-NoLogo"]),
            vec![format!("{system32}\\WindowsPowerShell\\v1.0\\powershell.exe")],
        ),
        (shell("pwsh", "PowerShell 7", "", &["-NoLogo"]), pwsh),
        (shell("git-bash", "Git Bash", "", &["--login", "-i"]), bash),
        (shell("wsl", "WSL", "", &[]), if (p.exists)(&wsl) && (p.has_wsl_distro)(&wsl) { vec![wsl] } else { vec![] }),
    ];
    candidates
        .into_iter()
        .filter_map(|(s, paths)| paths.into_iter().find(|x| !x.is_empty() && (p.exists)(x)).map(|path| ShellInfo { path, ..s }))
        .collect()
}

fn unix_shells(p: &Probe) -> Vec<ShellInfo> {
    let listed = p.etc_shells.lines().map(str::trim).filter(|l| l.starts_with('/'));
    let mut seen: Vec<(String, String)> = Vec::new();
    for path in std::iter::once(p.env.get("SHELL").map(String::as_str).unwrap_or("")).chain(listed) {
        let name = basename(path);
        if !path.is_empty() && (p.exists)(path) && !seen.iter().any(|(n, _)| n == name) {
            seen.push((name.to_string(), path.to_string()));
        }
    }
    seen.into_iter().map(|(name, path)| shell(&name, &name, &path, &[])).collect()
}

// The first entry is the default. There is always at least one, so spawning never has nothing to run.
pub fn detect_with(p: &Probe) -> Vec<ShellInfo> {
    let found = if p.windows { windows_shells(p) } else { unix_shells(p) };
    if found.is_empty() {
        vec![shell("system", "Sistema", if p.windows { "cmd.exe" } else { "/bin/sh" }, &[])]
    } else {
        found
    }
}

// wsl.exe ships with Windows even when nothing is installed behind it.
fn has_wsl_distro(wsl: &str) -> bool {
    let mut cmd = Command::new(wsl);
    cmd.args(["-l", "-q"]);
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000);
    cmd.output().map(|o| o.status.success() && !o.stdout.is_empty()).unwrap_or(false)
}

pub fn detect() -> Vec<ShellInfo> {
    let env: HashMap<String, String> = std::env::vars().collect();
    let etc = std::fs::read_to_string("/etc/shells").unwrap_or_default();
    detect_with(&Probe {
        windows: cfg!(windows),
        env: &env,
        exists: &|p| Path::new(p).exists(),
        has_wsl_distro: &has_wsl_distro,
        etc_shells: &etc,
    })
}

// Ids come from the renderer and the config: only ever matched, never used as a path.
pub fn resolve<'a>(shells: &'a [ShellInfo], requested: Option<&str>) -> &'a ShellInfo {
    shells.iter().find(|s| Some(s.id.as_str()) == requested).unwrap_or(&shells[0])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn unix_lists_env_shell_first_and_dedupes_by_name() {
        let e = env(&[("SHELL", "/usr/bin/zsh")]);
        let shells = detect_with(&Probe {
            windows: false,
            env: &e,
            exists: &|_| true,
            has_wsl_distro: &|_| false,
            etc_shells: "# c\n/bin/bash\n/usr/bin/zsh\n/bin/zsh\nnotabs\n",
        });
        let ids: Vec<&str> = shells.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["zsh", "bash"]);
        assert_eq!(shells[0].path, "/usr/bin/zsh");
    }

    #[test]
    fn falls_back_to_the_system_shell() {
        let e = env(&[]);
        let shells = detect_with(&Probe { windows: false, env: &e, exists: &|_| false, has_wsl_distro: &|_| false, etc_shells: "" });
        assert_eq!(shells, vec![shell("system", "Sistema", "/bin/sh", &[])]);
    }

    #[test]
    fn windows_skips_wsl_without_a_distro_and_finds_git_bash() {
        let e = env(&[("SystemRoot", "C:\\Windows"), ("PATH", "C:\\Git\\cmd")]);
        let present = ["C:\\Windows\\System32\\cmd.exe", "C:\\Windows\\System32\\wsl.exe", "C:\\Git\\cmd\\git.exe", "C:\\Git\\bin\\bash.exe"];
        let shells = detect_with(&Probe {
            windows: true,
            env: &e,
            exists: &|p| present.contains(&p),
            has_wsl_distro: &|_| false,
            etc_shells: "",
        });
        let ids: Vec<&str> = shells.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["cmd", "git-bash"]);
    }

    #[test]
    fn resolve_matches_ids_and_defaults_to_first() {
        let list = vec![shell("zsh", "zsh", "/z", &[]), shell("bash", "bash", "/b", &[])];
        assert_eq!(resolve(&list, Some("bash")).path, "/b");
        assert_eq!(resolve(&list, Some("../etc/passwd")).path, "/z");
        assert_eq!(resolve(&list, None).path, "/z");
    }
}
