# VisualTalk Pro — Live Translation Architecture & Store Policy

VisualTalk Pro offers live speech translation. To comply with strict App Store sandboxing rules (Apple App Store, Google Play, Microsoft Store) and maintain a lightweight (~17 MB) client binary, the translation architecture is segmented by distribution channel:

## 1. App Store Distributions (iOS, Android, macOS App Store, Windows Store)
- **Supported Strategy:** **Strategy 1 (Cloud API Relay)**.
- **How it works:** The user provides their own API key (OpenAI, Gemini, Deepgram) in **Settings → Translation**. Audio is streamed securely via WebSockets from the client directly to the chosen cloud provider.
- **Sandboxing & Compliance:** Fully compliant with mobile/desktop app store guidelines. No sidecar processes, no bundled model weights, no local server dependencies.

## 2. Self-Hosted / Direct Distributions (macOS DMG direct, Linux, Windows Installer)
- **Supported Strategies:** **Strategy 1 (Cloud)** + **Strategy 2 (Self-Hosted Docker Stack)**.
- **How it works:** For power users and organizations requiring 100% data sovereignty, the companion local stack (`docker/`) can optionally spin up a local Whisper container (`docker compose --profile translation up -d`), allowing audio translation to remain entirely within the organization's local network or private server infrastructure.
