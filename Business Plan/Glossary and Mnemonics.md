# Glossary and Mnemonics

This document provides definitions for key technical and strategic terms used across the VisualTalk Business Plan, along with simple mnemonics to help internalize the core strategy of each section.

## Glossary

*   **SFU (Selective Forwarding Unit):** A media server architecture that forwards audio/video streams from publishers to subscribers without mixing or transcoding them. It is the core infrastructure of VisualTalk's media layer (via LiveKit/mediacore).
*   **E2EE (End-to-End Encryption):** A security model where only the communicating participants can read messages. VisualTalk Pro uses E2EE for chat and file transfer, sitting above the SFU.
*   **CPaaS (Communications Platform as a Service):** Cloud-delivered APIs for embedding real-time communications (like video/audio) into applications. Examples include Twilio, Agora, and LiveKit Cloud.
*   **TCO (Total Cost of Ownership):** The total cost of purchasing and operating a solution, including licensing, hosting, support, and compliance overhead.
*   **TAM / SAM / SOM:**
    *   **TAM (Total Addressable Market):** The total revenue opportunity if every entity in the market bought the product.
    *   **SAM (Serviceable Addressable Market):** The portion of TAM targeted by the product's current capabilities (e.g., Government/Defense).
    *   **SOM (Serviceable Obtainable Market):** The realistic market share achievable in the near term.
*   **FedRAMP (Federal Risk and Authorization Management Program):** A US government-wide program that standardizes security assessment for cloud products. A key compliance target for the Government beachhead.
*   **Air-gap:** A network security measure where a computer or network is physically isolated from unsecured networks (like the internet). Critical for defense and high-security government use cases.
*   **Twirp:** A simple RPC protocol (used by LiveKit) that uses protobuf over HTTP. VisualTalk's Rust backend communicates with the SFU using Twirp.
*   **Beachhead:** The initial, specific market segment (Government/Defense) that VisualTalk targets first before expanding horizontally.

## Mnemonics

### Go-to-Market Strategy: "D.I.E."
*   **D**esign Partners: Recruit 3-5 government/defense agencies for initial deployment and feedback.
*   **I**solation (Air-gap): Emphasize the ability to run in fully isolated, sovereign environments.
*   **E**xpand: Use success in the beachhead to expand into adjacent regulated verticals (Healthcare, Legal).

### Product Strategy: "S.A.F.E."
*   **S**elf-host: The core differentiator; customers run their own media servers (mediacore).
*   **A**dmin: Enterprise-grade administrative controls (roster management, moderation, policy enforcement).
*   **F**IPS/Compliance: Built to meet strict government standards (FIPS 140-2/3, FedRAMP).
*   **E**2EE: End-to-end encryption as a baseline feature, not a premium add-on.

### Market Strategy: "C.D.M."
*   **C**ede: Explicitly cede the general consumer/SMB market to Zoom/Teams/WhatsApp.
*   **D**ominate: Achieve total dominance in the Government/Defense beachhead.
*   **M**ove: Move horizontally into other regulated industries once the beachhead is secured.

### Executive Summary: "W.B.S.W."
*   **W**hat: What is VisualTalk (Privacy-first, self-hostable video).
*   **B**eachhead: Government / Defense / Critical Infrastructure.
*   **S**elf-host: The architectural moat (mediacore).
*   **W**hy-now: Why now (Open-source SFUs + regulatory pressure against US-cloud SaaS).