# Research: LiveKit Cloud Transcription & Translation Capability

## Recommendation
**Defer.** 

LiveKit does not offer a single "translation transcription agent" that translates speech in realtime as a single-node operation. Translation must be implemented as a pipeline: Speech-to-Text (STT) -> Large Language Model (LLM) -> Text-to-Speech (TTS). 

Given that the local Whisper implementation is English-only and a translation hop requires significant infrastructure (OpenAI/ElevenLabs/Deepgram keys), we should market the current feature as "Captions" rather than "Live Translation" to align with our current capabilities. Building a robust, multi-language translation feature would require a second machine-translation hop using an LLM, which adds latency and dependency on third-party provider API keys.

## Evidence

### 1. Managed Transcription vs. Translation
LiveKit Cloud's managed transcription ("LiveKit Inference") is primarily for STT (Speech-to-Text). Translation is achieved via a pipeline of models.
*   **Source:** [LiveKit STT Models Overview](https://docs.livekit.io/agents/models/stt/)
*   **Mechanism:** [Pipeline Translator Example](https://docs.livekit.io/reference/recipes/pipeline_translator) demonstrates that translation requires three distinct steps (STT -> LLM -> TTS).

### 2. User Infrastructure & API Keys
Yes, these agents run against a user's own project.
*   **Inference:** LiveKit Inference runs on LiveKit's infrastructure to minimize latency and manages billing/rate limits.
*   **Plugins:** Developers can use open-source plugins (e.g., OpenAI, Deepgram, ElevenLabs) to manage their own billing and rate limits by providing their own API keys, as documented in the "Plugins" section of the [STT Models Overview](https://docs.livekit.io/agents/models/stt/).

### 3. Pricing Model
*   **LiveKit Inference:** Pricing is per-minute based on the agent's runtime. Details are found in [Inference pricing](https://livekit.com/pricing/inference#stt).
*   **Plugins:** Costs depend on the third-party providers (e.g., OpenAI/Deepgram/ElevenLabs) used in the pipeline.

### 4. Client-Side Integration
*   The client receives transcriptions via `RoomEvent.TranscriptionReceived`.
*   [LiveKit Client SDK](https://docs.livekit.io/transport/sdk-platforms/react/) supports this event, and metadata is available in the payload.

## Unverified
*   **Latency benchmarks:** While we have observed local latency, real-world latency for a multi-hop translation pipeline (e.g., Deepgram -> OpenAI -> ElevenLabs) on the managed LiveKit Cloud infrastructure could not be measured without a deployed agent server.
*   **Cost-effectiveness for high-concurrency meetings:** The cumulative cost of three-provider APIs per minute for translation is not fully modeled.

---
**Open questions for the owner:**
*   Is an archived third-party STT image (our current local whisper implementation) an acceptable long-term dependency for the Community Edition?
*   Should we prioritize a multi-language "translation" MVP that relies on LLM pipelines, or focus on robust, source-language-only captions?
