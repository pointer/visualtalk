# Store-listing drafts — How-to, Pro and battery mentions

Status: **drafts for owner review**, not yet pasted into App Store Connect or
Play Console. Three sentences per locale below (sentence 3 = battery &
efficiency, mobile-first); everything else in the listings stays as-is.

## Compliance guardrails (read first)

- **Apple (CE listing):** must keep "no In-App Purchase, no subscription"
  wording (Guidelines 2.1(b)/3.1.1). Naming a separate app and linking to its
  App Store page is ordinary cross-promotion and is fine; never link to a
  *web* purchase flow.
- **Google Play:** external links are allowed as long as they don't circumvent
  Play billing; `visualtalk.app` documentation/marketing links are fine.
  Data-safety answers are unaffected (the site collects nothing).
- **Claims stay inside the shipped set:** E2EE = chat messages and files only
  (never "encrypted video/audio"); streaming = organizer RTMP from your own
  server. Mirror the wording of <https://visualtalk.app/pro/>.
- **Battery/efficiency claims stay architecture-based and user-verifiable:**
  the manifest declares no service, no receiver, no push SDK and a single
  media-session `WAKE_LOCK`; the app renders in the system webview. Never put a
  benchmark percentage ("X% more battery") in a listing field — the claim must
  be checkable by the user in their own battery settings, same rule as
  <https://visualtalk.app/why-tauri/>.
- **Timing:** the *How-to* sentence can go in now. The *Pro* sentence goes in
  on Pro ship-night only (same night as the `site/pro-ship-flip` branch merge),
  because advertising an app that is not yet public invites rejection.

## Sentence 1 — How-to guide (paste now, append to FULL DESCRIPTION)

- **en-US:** Plain-words setup guide, including how to connect your own server: https://visualtalk.app/how-to/ (also in French: /how-to/fr/).
- **fr:** Guide d'installation en langage simple, y compris brancher votre propre serveur : https://visualtalk.app/how-to/fr/ (aussi en anglais : /how-to/).
- **es:** Guía de configuración en lenguaje sencillo, incluida la conexión de tu propio servidor: https://visualtalk.app/how-to/ (también en francés: /how-to/fr/).
- **de:** Ausführliche Anleitung in einfacher Sprache, inklusive Verbindung zum eigenen Server: https://visualtalk.app/how-to/ (auch auf Französisch: /how-to/fr/).
- **it:** Guida all'installazione in parole semplici, incluso il collegamento al tuo server: https://visualtalk.app/how-to/ (anche in francese: /how-to/fr/).
- **nl:** Installatiegids in gewone taal, inclusief je eigen server koppelen: https://visualtalk.app/how-to/ (ook in het Frans: /how-to/fr/).
- **pl:** Przewodnik konfiguracji prostym językiem, w tym podłączenie własnego serwera: https://visualtalk.app/how-to/ (także po francusku: /how-to/fr/).
- **pt:** Guia de configuração em linguagem simples, incluindo ligar o seu próprio servidor: https://visualtalk.app/how-to/ (também em francês: /how-to/fr/).
- **ar:** دليل الإعداد بلغة مبسطة، بما فيه ربط خادمك الخاص: https://visualtalk.app/how-to/ (ومتوفر بالفرنسية: /how-to/fr/).

## Sentence 2 — Pro cross-promotion (SHIP-NIGHT only, append after sentence 1)

- **en-US:** A separate paid edition, VisualTalk Pro, adds end-to-end encrypted chat and file sharing plus organizer streaming: https://visualtalk.app/pro/.
- **fr:** Une édition payante séparée, VisualTalk Pro, ajoute le chiffrement de bout en bout des messages et des fichiers ainsi que la diffusion par l'organisateur : https://visualtalk.app/pro/.
- **es:** Una edición de pago aparte, VisualTalk Pro, añade cifrado de extremo a extremo en chat y archivos y retransmisión por el organizador: https://visualtalk.app/pro/.
- **de:** Eine separate kostenpflichtige Edition, VisualTalk Pro, ergänzt Ende-zu-Ende-verschlüsselten Chat und Dateitransfer sowie Organizer-Streaming: https://visualtalk.app/pro/.
- **it:** Un'edizione a pagamento separata, VisualTalk Pro, aggiunge chat e condivisione file cifrate end-to-end e lo streaming dell'organizzatore: https://visualtalk.app/pro/.
- **nl:** Een aparte betaalde editie, VisualTalk Pro, voegt end-to-end versleutelde chat en bestandsdeling plus organizer-streaming toe: https://visualtalk.app/pro/.
- **pl:** Osobna płatna edycja VisualTalk Pro dodaje szyfrowanie end-to-end czatu i plików oraz streaming prowadzącego: https://visualtalk.app/pro/.
- **pt:** Uma edição paga separada, VisualTalk Pro, acrescenta chat e partilha de ficheiros com cifragem ponta-a-ponta e transmissão pelo organizador: https://visualtalk.app/pro/.
- **ar:** إصدار مدفوع منفصل، VisualTalk Pro، يضيف تشفيرًا تامًا للدردشة والملفات وبث المنظم: https://visualtalk.app/pro/.

## Sentence 3 — battery & efficiency (paste now, append after sentence 1)

Architecture-based and user-verifiable only (see guardrails): no benchmark
percentages. Every fact is checkable by the user — Android: Settings → Apps →
VisualTalk → Battery; the manifest declares no service, no receiver, no push
SDK and a single media-session wake lock.

- **en-US:** Easy on your phone's battery: no bundled browser engine (the system webview renders the app), no background service, receiver or push SDK, and the wake lock is held only while a meeting is live. Details: https://visualtalk.app/why-tauri/
- **fr:** Économe en batterie : aucun moteur de navigateur embarqué (le webview système affiche l'application), aucun service d'arrière-plan, aucun récepteur ni SDK de push, et le verrou d'éveil n'est actif que pendant un appel. Détails : https://visualtalk.app/why-tauri/
- **es:** Ligero con la batería de tu teléfono: sin motor de navegador incluido (el webview del sistema muestra la app), sin servicio en segundo plano, receptor ni SDK de push, y el wake lock solo se mantiene durante una llamada. Detalles: https://visualtalk.app/why-tauri/
- **de:** Schont den Akku deines Telefons: keine mitgelieferte Browser-Engine (das System-WebView zeichnet die App), kein Hintergrunddienst, kein Receiver, kein Push-SDK, und der Wake-Lock gilt nur während eines Meetings. Details: https://visualtalk.app/why-tauri/
- **it:** Leggero sulla batteria del telefono: nessun motore browser incluso (è il webview di sistema a mostrare l'app), nessun servizio in background, receiver o SDK push, e il wake lock resta attivo solo durante una riunione. Dettagli: https://visualtalk.app/why-tauri/
- **nl:** Zuinig met de batterij van je telefoon: geen meegeleverde browser-engine (de systeem-webview tekent de app), geen achtergrondservice, receiver of push-SDK, en de wake lock geldt alleen tijdens een gesprek. Details: https://visualtalk.app/why-tauri/
- **pl:** Oszczędny dla baterii telefonu: bez wbudowanego silnika przeglądarki (interfejs renderuje systemowy webview), bez usługi w tle, odbiornika i SDK push, a wake lock działa tylko podczas spotkania. Szczegóły: https://visualtalk.app/why-tauri/
- **pt:** Leve para a bateria do seu telemóvel: sem motor de browser incluído (é o webview do sistema que mostra a app), sem serviço em segundo plano, receiver ou SDK de push, e o wake lock só vigora durante uma chamada. Detalhes: https://visualtalk.app/why-tauri/
- **ar:** لطيف على بطارية هاتفك: لا محرك متصفح مضمّن (يعرض التطبيق عبر webview الخاص بالنظام)، ولا خدمة خلفية ولا مستقبِل ولا SDK للدفع، ولا يُحتفظ بقفل الإيقاظ إلا أثناء المكالمة. التفاصيل: https://visualtalk.app/why-tauri/

## Short-form fields (en only, owner review — optional)

- **Play short description (≤80):** `Private meetings on your own server, light on your phone's battery.` (67 chars) — replaces the current privacy-only line if the owner wants the battery lead on the store card itself.
- **App Store promotional text (≤170):** `No bundled browser, no background service, no push SDK: VisualTalk wakes your phone only during a call. Private video meetings on your own LiveKit server.` (154 chars)

## Where to paste

- **App Store Connect:** each locale's listing → *Description* field (append at
  the end). Optionally repeat sentence 1 in *What's New* at the next CE update.
- **Play Console:** Grow → Store presence → Main store listing → *Full
  description*, per language (the nine locales already exist).
- After pasting, record the date here and in the Play dossier
  (`docs/play-store-submission.md`) progress log.
