// Seconds since the last keyboard or mouse input, or None when this system can't say
// (the clock then keeps counting, which is the safe side).

#[cfg(windows)]
pub fn seconds() -> Option<u64> {
    use windows_sys::Win32::{System::SystemInformation::GetTickCount, UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO}};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: `info` is a valid LASTINPUTINFO with cbSize set, as the API requires.
    (unsafe { GetLastInputInfo(&mut info) } != 0).then(|| u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime)) / 1000)
}

#[cfg(target_os = "macos")]
pub fn seconds() -> Option<u64> {
    let out = std::process::Command::new("ioreg").args(["-c", "IOHIDSystem", "-d", "4"]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let nanos: u64 = text.lines().find(|l| l.contains("HIDIdleTime"))?.split('=').nth(1)?.trim().parse().ok()?;
    Some(nanos / 1_000_000_000)
}

// GNOME reports milliseconds, KDE's ScreenSaver reports seconds.
#[cfg(all(unix, not(target_os = "macos")))]
pub fn seconds() -> Option<u64> {
    let bus = zbus::blocking::Connection::session().ok()?;
    let gnome: Option<u64> = bus
        .call_method(Some("org.gnome.Mutter.IdleMonitor"), "/org/gnome/Mutter/IdleMonitor/Core", Some("org.gnome.Mutter.IdleMonitor"), "GetIdletime", &())
        .ok()
        .and_then(|m| m.body().deserialize::<u64>().ok());
    if let Some(ms) = gnome {
        return Some(ms / 1000);
    }
    let kde = bus
        .call_method(Some("org.freedesktop.ScreenSaver"), "/org/freedesktop/ScreenSaver", Some("org.freedesktop.ScreenSaver"), "GetSessionIdleTime", &())
        .ok()?;
    kde.body().deserialize::<u32>().ok().map(u64::from)
}
