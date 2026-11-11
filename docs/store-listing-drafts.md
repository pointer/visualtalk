# Store-listing drafts — How-to and Pro mentions

Status: **drafts for owner review**, not yet pasted into App Store Connect or
Play Console. Two sentences per locale below; everything else in the listings
stays as-is.

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

## Where to paste

- **App Store Connect:** each locale's listing → *Description* field (append at
  the end). Optionally repeat sentence 1 in *What's New* at the next CE update.
- **Play Console:** Grow → Store presence → Main store listing → *Full
  description*, per language (the nine locales already exist).
- After pasting, record the date here and in the Play dossier
  (`docs/play-store-submission.md`) progress log.
