//! Host system introspection.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PerformanceStats {
    pub cpu_usage: f32,
    pub memory_usage_bytes: u64,
}

/// Detect the OS system locale.
///
/// Reads LANG / LC_ALL / LANGUAGE environment variables (set by macOS and Linux)
/// and returns the language tag (e.g. "en_US.UTF-8" → "en").
/// Returns an empty string if no locale can be detected — the frontend falls
/// back to `navigator.language` and then to "en".
#[tauri::command]
pub fn get_system_locale() -> String {
    for var in &["LC_ALL", "LANG", "LANGUAGE"] {
        if let Ok(val) = std::env::var(var) {
            if !val.is_empty() && val != "C" && val != "POSIX" {
                return val;
            }
        }
    }
    String::new()
}

/// Per-process energy-efficiency stats (Pro, mobile-only).
///
/// Android measures via `sysinfo`; iOS via the Mach `task_info` API because
/// sysinfo's Apple backend is macOS-only and does not compile for iOS.
/// Desktop builds compile the command but refuse at runtime.
///
/// Battery is deliberately absent: both mobile OSes already surface it in the
/// status bar, and the 2026-11-12 product decision keeps the overlay to CPU +
/// resident memory. If battery sampling is ever wanted for measurements, add
/// it to this payload (iOS: `UIDevice.batteryLevel` via an objc bridge;
/// Android: `BatteryManager`) rather than to the overlay UI.
#[cfg(feature = "pro")]
#[tauri::command]
pub fn get_energy_efficiency_stats() -> Result<PerformanceStats, String> {
    #[cfg(target_os = "android")]
    {
        return android_energy_stats();
    }
    #[cfg(target_os = "ios")]
    {
        return ios_energy_stats();
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        Err("Only available on mobile platforms".to_string())
    }
}

/// Android: per-process CPU % and resident memory via sysinfo.
#[cfg(all(feature = "pro", target_os = "android"))]
fn android_energy_stats() -> Result<PerformanceStats, String> {
    use sysinfo::{RefreshKind, System};

    let mut sys = System::new_with_specifics(RefreshKind::everything());
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let pid = sysinfo::Pid::from(std::process::id() as usize);
    let process = sys.process(pid);

    Ok(PerformanceStats {
        cpu_usage: process.map(|p| p.cpu_usage()).unwrap_or(0.0),
        memory_usage_bytes: process.map(|p| p.memory()).unwrap_or(0),
    })
}

/// iOS: per-task resident memory and CPU % via Mach `task_info`.
///
/// `MACH_TASK_BASIC_INFO` returns resident bytes plus cumulative user/system
/// CPU time in one call; CPU % is the delta of that time over the wall-clock
/// delta between two samples (100.0 = one core fully busy). The first sample
/// of a session therefore reports 0.0. The struct mirrors XNU's
/// `struct mach_task_basic_info` (pragma pack(4), field order as in libc).
#[cfg(all(feature = "pro", target_os = "ios"))]
mod ios_energy {
    use std::sync::Mutex;
    use std::time::Instant;

    extern "C" {
        /// libSystem global holding the task's own send right (mach_init.h).
        static mach_task_self_: u32;
        fn task_info(
            target_task: u32,
            flavor: u32,
            task_info_out: *mut i32,
            task_info_count: *mut u32,
        ) -> i32;
    }

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct TimeValue {
        seconds: i32,
        microseconds: i32,
    }

    #[repr(C, packed(4))]
    #[derive(Default, Clone, Copy)]
    struct MachTaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: TimeValue,
        system_time: TimeValue,
        policy: i32,
        suspend_count: i32,
    }

    const MACH_TASK_BASIC_INFO: u32 = 20;
    const INFO_COUNT: u32 =
        (core::mem::size_of::<MachTaskBasicInfo>() / core::mem::size_of::<i32>()) as u32;

    /// (instant, cumulative CPU microseconds) of the previous sample.
    static LAST_SAMPLE: Mutex<Option<(Instant, u64)>> = Mutex::new(None);

    pub fn stats() -> Result<super::PerformanceStats, String> {
        let mut info = MachTaskBasicInfo::default();
        let mut count = INFO_COUNT;
        let kr = unsafe {
            task_info(
                mach_task_self_,
                MACH_TASK_BASIC_INFO,
                &mut info as *mut MachTaskBasicInfo as *mut i32,
                &mut count,
            )
        };
        if kr != 0 {
            return Err(format!(
                "task_info(MACH_TASK_BASIC_INFO) failed: kern_return_t {kr}"
            ));
        }

        let cpu_micros = (info.user_time.seconds as u64 * 1_000_000
            + info.user_time.microseconds as u64)
            .saturating_add(
                info.system_time.seconds as u64 * 1_000_000
                    + info.system_time.microseconds as u64,
            );
        let now = Instant::now();
        let cpu_usage = match LAST_SAMPLE.lock() {
            Ok(mut slot) => {
                let prev = *slot;
                *slot = Some((now, cpu_micros));
                match prev {
                    Some((then, earlier)) if now > then && cpu_micros >= earlier => {
                        let wall_secs = now.duration_since(then).as_secs_f32();
                        if wall_secs > 0.0 {
                            ((cpu_micros - earlier) as f32 / 1_000_000.0) / wall_secs * 100.0
                        } else {
                            0.0
                        }
                    }
                    _ => 0.0,
                }
            }
            Err(_) => 0.0,
        };

        Ok(super::PerformanceStats {
            cpu_usage,
            memory_usage_bytes: info.resident_size,
        })
    }
}

#[cfg(all(feature = "pro", target_os = "ios"))]
fn ios_energy_stats() -> Result<PerformanceStats, String> {
    ios_energy::stats()
}
