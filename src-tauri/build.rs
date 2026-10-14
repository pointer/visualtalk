fn main() {
    // `option_env!` in src/demo.rs is expanded at compile time, and cargo does
    // not otherwise learn that these variables affect the output. Without these
    // directives, rebuilding after setting VISUALTALK_DEMO_* can reuse the cached
    // object file and silently produce a binary with NO demo credentials —
    // exactly the failure mode that would waste an App Store review cycle, since
    // the app would build fine and only fail at runtime for the reviewer.
    println!("cargo:rerun-if-env-changed=VISUALTALK_DEMO_LIVEKIT_URL");
    println!("cargo:rerun-if-env-changed=VISUALTALK_DEMO_API_KEY");
    println!("cargo:rerun-if-env-changed=VISUALTALK_DEMO_API_SECRET");

    tauri_build::build()
}
