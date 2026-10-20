# VisualTalk Pro — Dossier de conformité export (BROUILLON)

> **Version française de `docs/export-compliance-pro.md`** (l'original en
> anglais fait foi en cas de divergence). Destinée au conseil juridique
> français et aux formalités ANSSI/DG Trésor.
>
> **Statut : brouillon interne pour le dossier Pro Edition (E2EE).** Ceci
> n'est pas un avis juridique. Les éléments marqués **TBD** attendent la
> fiche d'informations du dirigeant ; l'auto-classification BIS et toute
> déclaration française/UE de biens à double usage doivent être revues par
> un conseil qualifié en contrôle des exportations avant dépôt.
>
> Périmètre : VisualTalk **Pro Edition** uniquement
> (`com.katebg.visualtalk.pro`). La Community Edition ne contient **aucune**
> implémentation cryptographique propriétaire (l'E2EE y est un stub de
> compilation) ; ses dossiers stores ne déclarent donc aucun usage de
> chiffrement non exempt.

## 1. Résumé du produit

- Produit : VisualTalk Pro — application de visioconférence « apportez votre
  propre serveur », desktop et mobile (Tauri v2 ; backend Rust, frontend
  web).
- Éditeur : Miradata SASU, RCS Bobigny 849 735 311, TVA FR64849735311,
  [address], France.
- Fonction cryptographique : **chiffrement de bout en bout des messages de
  conversation et des transferts de fichiers** entre participants d'une
  réunion. L'audio/vidéo est transporté par le serveur LiveKit exploité par
  le client via les standards WebRTC DTLS-SRTP/TLS — aucun module
  cryptographique personnalisé n'intervient.
- Distribution : grand public, au détail, via Apple App Store / Google Play
  (code objet uniquement ; aucune source du module E2EE Pro n'est
  distribuée).
- Le chiffrement n'est utilisé **ni** pour de la DRM, **ni** pour du calcul
  généraliste, **ni** pour du stockage dissimulé au-delà de la
  fonctionnalité E2EE visible par l'utilisateur.

## 2. Description cryptographique (faits issus du code livré)

| Fonction | Algorithme | Paramètres | Norme | Implémentation (version) |
|---|---|---|---|---|
| Établissement de clé | ECDH | NIST P-256 (256 bits) | SP 800-56A | RustCrypto `p256` 0.14, Rust pur |
| Dérivation de clé | HKDF | SHA-256, info `visualtalk-e2ee-v1` | RFC 5869 | HMAC-SHA256 manuel via `sha2` 0.11 |
| Hachage / MAC | SHA-256, HMAC-SHA256 | empreinte 256 bits | FIPS 180-4, RFC 2104 | RustCrypto `sha2` 0.11 |
| Chiffrement du contenu | AES-256-GCM | clé 256 bits, IV 96 bits, tag 128 bits | FIPS 197, SP 800-38D | RustCrypto `aes-gcm` 0.11.1 |
| Génération aléatoire | CSPRNG | amorçage par entropie de l'OS | — | RustCrypto `rand` 0.10 |
| Transport (non personnalisé) | TLS 1.2/1.3, DTLS-SRTP | selon plateforme / LiveKit | IETF | valeurs par défaut plateforme et bibliothèques |

Notes pour l'argumentaire de classification :
- Tous les algorithmes sont des primitives **standard et publiquement
  documentées** du NIST/IETF ; il n'existe **aucun algorithme
  cryptographique propriétaire ou non standard**.
- L'implémentation est en Rust pur, issue de crates open source publiques
  (RustCrypto). Aucun module validé FIPS 140 n'est utilisé ni revendiqué.
- La fonctionnalité E2EE est conditionnée à la compilation
  (`--features e2ee`) ; le binaire Community Edition ne contient aucune
  implémentation de chiffrement.
- Vérification `cargo tree --features e2ee` (2026-10-19) : `p256` et
  `aes-gcm` sont des dépendances directes de l'application uniquement ;
  toutes les autres crates cryptographiques du graphe sont des composants
  RustCrypto standard (aes, ghash, hmac, hkdf, sha2, rand/rand_chacha).
  `ring` n'apparaît que comme dépendance TLS transitive (rustls via la pile
  LiveKit) — sécurité du transport, pas de cryptographie personnalisée.

## 3. Analyse EAR américaine (brouillon — à confirmer par le conseil)

- ECCN probable : **5D002** (logiciel de sécurité de l'information),
  éligibilité grand public au titre de la **License Exception ENC,
  §740.17(b)(1)** : code objet, cryptographie standard publiquement
  disponible, vente au détail, sans obligations de support post-exportation
  au-delà des mises à jour consommateurs ordinaires.
- Étape requise : **rapport d'auto-classification unique** au BIS
  (bisencryption@bis.doc.gov selon les directives BIS en vigueur) lorsqu'on
  s'appuie sur le §740.17 grand public pour du 5D002 ; conserver le rapport
  et toute réponse du BIS au dossier. **TBD :** confirmer l'adresse/le
  format de dépôt en vigueur au moment du dépôt.
- Contenu d'origine américaine : le code cryptographique est de l'open
  source public d'origine américaine (RustCrypto). **TBD :** analyse
  de minimis / « publiquement disponible » pour le produit assemblé, par le
  conseil.
- Criblage sanctions : la conformité OFAC standard s'applique à la
  distribution via les stores (les plateformes gèrent la disponibilité
  territoriale). **TBD :** confirmer l'absence de canaux de distribution
  directe supplémentaires.

## 4. Biens à double usage — France / UE (brouillon — à confirmer par le conseil)

- Règlement UE **2021/821**, Catégorie 5 Partie 2 (équivalents 5A002/5D002).
- Les logiciels de cryptographie grand public / « publiquement disponible »
  relèvent en général de la procédure nationale française (déclaration à
  l'ANSSI / DG Trésor via le processus Cerfa pour les moyens de
  cryptologie). **TBD :** confirmer si la déclaration générale de logiciel
  ou une exemption s'applique ; déposer avant toute première distribution
  si requis.
- Date de première mise à disposition et liste des territoires de
  distribution (décision du dirigeant, 2026-10-19) : **mise à disposition
  mondiale simultanée** sur tous les territoires des stores, cible : la
  **semaine suivant l'approbation App Review** — le plus tôt possible (la
  Phase 3 du calendrier de lancement vise une soumission dans la fenêtre de
  décembre 2026). Règle de séquencement : toute formalité française/UE
  requise doit être accomplie **avant** cette date de première mise à
  disposition ; la sortie en dépend, et non l'inverse.

## 5. Chine continentale et territoires soumis à restrictions

**Chine continentale — EXCLURE de la mise à disposition initiale
(recommandé ; à confirmer par le dirigeant).** Un lancement en Chine est un
projet juridique distinct, pas une case à cocher :

- **Loi chinoise sur la cryptographie** (en vigueur depuis le 2020-01-01)
  et **Règlement révisé sur la cryptographie commerciale** (en vigueur
  depuis le 2023-07-01) : les produits de cryptographie commerciale sont
  soumis aux régimes de certification/homologation de l'OSCCA, et
  l'import/export d'articles de cryptographie commerciale est contrôlé par
  listes. L'applicabilité à une application E2EE grand public étrangère
  n'est pas éprouvée, et les services de messagerie E2EE (WhatsApp, Signal)
  sont de fait bloqués en Chine.
- **La boutique chinoise d'Apple exige un dépôt ICP** (MIIT) pour chaque
  application depuis octobre 2023 — ce qui suppose une entité juridique
  chinoise et un hébergement domestique. Ni l'une ni l'autre n'existe pour
  une application « apportez votre propre serveur » comme VisualTalk : la
  boutique chinoise est donc hors de portée dans ce calendrier.
- **Google Play n'est pas disponible en Chine continentale** ; la
  distribution Android passerait par des stores locaux avec leurs propres
  exigences de déclaration/certification.
- La **PIPL** (protection des données) et des obligations de localisation
  des données s'attacheraient à toute opération visant la Chine.

Chemin de décision : désélectionner la Chine continentale dans la
disponibilité territoriale d'App Store Connect à la soumission. N'y
revenir qu'avec un conseil dédié en droit chinois et un dossier
économique (entité locale, ICP, certification OSCCA, programme PIPL).

**Russie / Biélorussie :** depuis 2022, le BIS a restreint la disponibilité
de la License Exception ENC pour de nombreux articles de chiffrement vers la
Russie et la Biélorussie ; la distribution grand public via les plateformes
se trouve dans une zone grise. **TBD (conseil) :** confirmer s'il faut
désélectionner ces territoires à la sortie initiale — recommandé : oui.

**Destinations sous embargo** (Cuba, Iran, Corée du Nord, Syrie et les
régions ukrainiennes couvertes) : bloquées par les plateformes de stores
elles-mêmes ; aucune action au-delà du respect strict des contrôles
territoriaux des plateformes, sans jamais les contourner.

## 6. App Store Connect — réponses chiffrement (dossier Pro)

Déclaration du build actuel (définie dans `src-tauri/Info-pro.plist`) :
`ITSAppUsesNonExemptEncryption = YES` — posture **conservatoire** (décision
du dirigeant du 2026-10-19, revenant sur le passage à NO du même jour).
Justification : cette clé affirme une position juridique. YES est toujours
véridique et ne bloque jamais l'approbation — il n'ajoute que des questions
de questionnaire. NO est une *revendication* d'exemption qui doit s'appuyer
sur l'avis de classification et le rapport d'auto-classification BIS —
aucun des deux n'existe encore.

Questionnaire ASC (App Encryption Declaration) tant que YES :
1. « Votre application utilise-t-elle du chiffrement ? » → **Oui.**
2. « Est-il limité à des usages exemptés ? » → **Non** tant que YES est la
   posture déclarée.
3. « Utilise-t-elle du chiffrement propriétaire ou non standard ? » →
   **Non** (algorithmes standard uniquement, cf. §2).

Chemin pour basculer à **NO** avant soumission (review la plus rapide) —
les **deux** éléments sont requis :
1. Le conseil confirme l'éligibilité grand public/exempte (Note de la
   Catégorie 5 Partie 2 / type 5D992 — issue attendue, l'application
   n'utilisant que des algorithmes standard publiés, cf. §2).
2. Le rapport d'auto-classification BIS (unique) est déposé.
Alors : mettre `Info-pro.plist` à NO, répondre « Oui — exempt grand
public » à la Q2, et recompiler. **Ne pas basculer sans ces deux
éléments.** Si la soumission intervient avant l'avis du conseil,
soumettre avec YES — état parfaitement livrable en l'état.

Dossier Community Edition : conserver `ITSAppUsesNonExemptEncryption = NO`
— le binaire CE ne contient aucune cryptographie personnalisée ; la sécurité
du transport provient du TLS/DTLS de la plateforme (exemption Apple :
limité au chiffrement de l'OS / usage exempt).

## 7. Fiche d'informations du dirigeant — éléments encore requis (TBD)

- [x] Date de première mise à disposition prévue (dirigeant, 2026-10-19) :
      sortie mondiale simultanée, la semaine suivant l'approbation App
      Review — le plus tôt possible (soumission visée dans la fenêtre
      Phase 3 de décembre 2026), **sous réserve des exclusions
      territoriales du §5** (Chine continentale recommandée exclue ;
      Russie/Biélorussie TBD via le conseil). Condition bloquante :
      auto-classification BIS et formalité française/UE (ou exemption
      confirmée) accomplies avant la première mise à disposition dans
      TOUT territoire.
- [ ] Exclusions territoriales confirmées à la soumission :
      désélectionner la Chine continentale dans la disponibilité ASC
      (recommandation §5 — à confirmer par le dirigeant) ; décision
      Russie/Biélorussie par le conseil.
- [x] Confirmation que les crates RustCrypto sont les seuls composants
      cryptographiques du binaire Pro (vérifié via `cargo tree`, cf. §2 ;
      `ring` présent uniquement comme TLS transitive).
- [ ] Prévisions annuelles de volumes/chiffre d'affaires (certains
      formulaires le demandent ; les plateformes fournissent aussi les
      données de ventes).
- [ ] Engagement d'un conseil pour l'auto-classification BIS + la
      déclaration française. E-mails prêts à envoyer (FR + EN) avec le
      périmètre à prix forfaitaire, les questions de filtrage, l'échéance
      de fin novembre et la checklist d'envoi :
      `docs/counsel-engagement-email.md`. Premiers contacts : CCI /
      guichet Team France Export, puis 2–3 cabinets spécialisés en
      contrôle des exportations.
- [x] Point de décision YES vs NO : **YES pour l'instant** (dirigeant,
      2026-10-19, retour sur le NO du même jour). Bascule vers NO avant
      soumission uniquement avec les deux éléments en main —
      confirmation du conseil + rapport d'auto-classification BIS déposé
      (chemin au §6) ; sinon soumettre avec YES.

## 8. Références

- 15 CFR §740.17 (License Exception ENC, grand public), §742.15, Supp. 1
  to Part 740.
- Règlement UE 2021/821 (biens à double usage), Catégorie 5 Partie 2.
- Apple : documentation développeur « Export Compliance — App Encryption
  Declaration ».
- Ce dépôt : `src-tauri/e2ee-pro/e2ee.rs` (privé, ignoré par git),
  `src-tauri/Info-pro.plist`, `src-tauri/tauri.pro.conf.json`,
  `EULA-PRO` §8 (clause de conformité export présentée aux utilisateurs).

