# VisualTalk

**VisualTalk** is a lightweight, modern, cross-platform desktop video conferencing application inspired by Zoom. It is built with a high-performance **Rust backend (Tauri v2)** that handles all business logic, window lifecycle, authentication, and state persistence, paired with a thin **SolidJS + Tailwind CSS** frontend leveraging **LiveKit** for zero-copy, hardware-accelerated WebRTC media streaming.

---

## 🎯 Project Goals & Vision

1. **Lightweight Alternative to Electron**:
   - Replaces heavy Chromium/Node runtimes with Tauri v2's native webview and an optimized Rust backend, drastically reducing memory footprint and startup times.
2. **Native Rust Business Logic & Orchestration**:
   - Moves all non-UI logic (window management, JWT signing, state persistence, user profile, meeting scheduling, and session creation) to Rust, keeping the frontend thin, fast, and maintainable.
3. **Turnkey LiveKit Desktop Client**:
   - Delivers a robust, full-featured desktop client on top of the LiveKit WebRTC SFU infrastructure.
4. **Familiar Zoom-like Experience**:
   - Provides an intuitive interface featuring a main hub (clock, meeting actions, navigation, scheduling), pre-join device selection ("green room"), and in-call video grid with screen-sharing capabilities.
5. **macOS-Native Security & Permissions**:
   - Specifically configured for macOS camera/microphone TCC permissions, hardened runtime, and sandbox entitlements.

---

## 🏗 Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│             VisualTalk Frontend (Thin UI Layer)             │
│            (SolidJS + Tailwind CSS + LiveKit SDK)           │
├──────────────────────────────┬──────────────────────────────┤
│    Main Dashboard Window     │     Spawned Meeting View     │
│       (MainWindow.jsx)       │      (MeetingView.jsx)       │
│  - Reactive Dashboard UI     │  - Pre-join Green Room       │
│  - Clock / Calendar View     │  - VideoGrid.jsx             │
│  - Trigger Rust Actions      │  - LiveKit WebRTC Streaming  │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ Tauri IPC (invoke)           │
┌──────────────▼──────────────────────────────▼───────────────┐
│               Rust Backend Engine (Tauri v2)                │
├─────────────────────────────────────────────────────────────┤
│  • window.rs    : Native WebviewWindow lifecycle & spawner  │
│  • session.rs   : Atomic meeting session & credentials auth │
│  • token.rs     : Pure-Rust HMAC-SHA256 LiveKit JWT signer  │
│  • settings.rs  : Persistent AppData (Profile & Settings)    │
│  • meeting.rs   : Meeting scheduling, history & invitations │
│  • state.rs     : Thread-safe global AppState container     │
│  • lib.rs       : Tauri command handlers & plugin setup     │
└─────────────────────────────────────────────────────────────┘
```

### Frontend (Thin UI & WebRTC Renderer)
- **[SolidJS](https://www.solidjs.com/)**: High-performance, reactive UI framework without a virtual DOM.
- **[LiveKit Client SDK (`livekit-client`)](https://github.com/livekit/client-sdk-js)**: WebRTC media track publishing, subscriptions, and zero-copy rendering into HTML `<video>` elements.
- **[Tailwind CSS v4](https://tailwindcss.com/)**: Modern styling and dark theme.

### Backend (Rust / Tauri v2)
- **Native Window Spawner (`window.rs`)**: Controls creation, sizing, centering, and titles for meeting windows via `WebviewWindowBuilder`.
- **Session & Token Authority (`session.rs`, `token.rs`)**: Encapsulates LiveKit API keys, secrets, and JWT generation securely in Rust.
- **Persistent Storage & Settings (`settings.rs`)**: Thread-safe storage for user profile, PMI, and device preferences on disk.
- **Meeting Manager (`meeting.rs`)**: Handles meeting scheduling, history tracking, and invitation text generation.
- **Tauri IPC Bridge (`lib.rs`)**: Centralized, typed command handlers linking the frontend and backend.

---

## 📂 Project Structure

```
visualtalk/
├── public/
│   └── config.json           # Fallback configuration
├── src/
│   ├── assets/               # SVGs and static brand assets
│   ├── components/
│   │   └── VideoGrid.jsx     # Responsive participant & screen-share video grid
│   ├── App.css               # Global styling & Tailwind imports
│   ├── App.jsx               # Application entry & window mode router
│   ├── MainWindow.jsx        # Zoom-style main dashboard
│   ├── MeetingView.jsx       # Pre-join green room & active in-meeting view
│   └── index.jsx             # SolidJS DOM root mount
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json      # Tauri v2 security capabilities (wildcard window access)
│   ├── src/
│   │   ├── lib.rs            # Tauri command registry & app setup
│   │   ├── main.rs           # Native binary entry point
│   │   ├── state.rs          # Global thread-safe AppState
│   │   ├── session.rs        # Meeting session generator & credentials bridge
│   │   ├── window.rs         # Native WebviewWindow builder & manager
│   │   ├── settings.rs       # UserProfile & UserSettings disk persistence
│   │   ├── meeting.rs        # Scheduled meetings, history, & invitations
│   │   └── token.rs          # Pure-Rust HMAC-SHA256 JWT generator
│   ├── Cargo.toml            # Rust dependencies & crate configuration
│   ├── Entitlements.plist    # macOS sandbox & hardware access entitlements
│   ├── Info.plist            # macOS privacy usage descriptions (Camera & Mic)
│   └── tauri.conf.json       # Tauri application configuration
├── macOS Tauri Camera Permission Checklist.md  # Detailed macOS WebRTC TCC guide
├── package.json              # Node dependencies & Vite build scripts
└── vite.config.js            # Vite + Solid plugin configuration
```

---

## 🚀 Key Features & Rust Backend Services

### 1. Main Dashboard (`MainWindow.jsx`)
- **Real-Time Data from Rust**: Loads profile information, personal meeting ID (PMI), and scheduled meetings directly from the backend.
- **Persistent Settings**: Toggling "Start with video" or "Use PMI" immediately updates and persists configuration via Rust.
- **Meeting Scheduling**: Create and delete scheduled meetings backed by Rust disk storage (`meetings.json`).
- **One-Click Invitations**: Generates and copies formatted meeting invites from the Rust meeting service.

### 2. Pre-Join "Green Room" (`MeetingView.jsx`)
- Live local video preview before joining.
- Device selection for microphones and cameras, with user preferences saved automatically in Rust settings.
- Audio and video toggles to join muted or with camera off.

### 3. In-Meeting Experience (`MeetingView.jsx` & `VideoGrid.jsx`)
- **Single-Step Session Join**: Fetches connection credentials and tokens from `get_meeting_session` in Rust.
- **Adaptive Video Grid**: Dynamically renders local video, remote participant streams, screen shares, and participant labels.
- **In-Call Controls**:
  - Mute / Unmute Microphone
  - Start / Stop Camera
  - Share Screen / Stop Sharing
  - Leave Meeting (with confirmation modal)
- **Native Multi-Window Lifecycle**: Spawns isolated, native meeting windows (`WebviewWindow`) managed by the Rust backend.

---

## 🛠 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+) & [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (latest stable) & Cargo
- [Tauri v2 CLI prerequisites](https://v2.tauri.app/start/prerequisites/)

### Environment Variables
Create a `.env` file in the root directory (or `src-tauri/`):

```env
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
ROOM=general
IDENTITY=User1
```

### Development
```bash
# Install frontend dependencies
pnpm install

# Run the app in development mode
pnpm tauri dev
```

### Build for Production
```bash
# Build the native release package
pnpm tauri build
```

---

## 🔒 macOS Camera & Microphone Permissions
For camera and microphone access to work seamlessly inside WebViews on macOS:
1. Ensure `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` are declared in `src-tauri/Info.plist`.
2. Ensure `com.apple.security.device.camera` and `com.apple.security.device.audio-input` are in `src-tauri/Entitlements.plist`.
3. Refer to [macOS Tauri Camera Permission Checklist.md](./macOS%20Tauri%20Camera%20Permission%20Checklist.md) for full troubleshooting steps.
