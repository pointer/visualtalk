# VisualTalk Pro — Dossier de conformité export (BROUILLON)

> **Version française de `docs/export-compliance-pro.md`** (l'original en
> anglais fait foi en cas de divergence). Destinée au conseil juridique
> français et aux formalités ANSSI/DG Trésor.
>
> **Statut : brouillon interne pour le dossier Pro Edition (E2EE).** Ceci
> n'est pas un avis juridique. Les éléments marqués **TBD** attendent la
> fiche d'informations du dirigeant ; la conclusion de compétence EAR (§3)
> et la position UE/SBDU (§4) doivent être confirmées par un conseil
> qualifié en contrôle des exportations. La déclaration ANSSI française est
> **déposée et attestée** (2026-10-20, dossier n° 34842510).
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

**D'abord la compétence — conclusion probable : PAS soumis à l'EAR**
(analyse du 2026-10-20, après réception de l'attestation ANSSI) :

- VisualTalk Pro est un logiciel **d'origine française**, développé et
  compilé en France par Miradata SASU. Sa fonction cryptographique provient
  exclusivement de crates open source **publiées** (RustCrypto, publiques
  sur crates.io). En vertu du **15 CFR §734.3(b)(3)**, les logiciels
  publiés ne sont **pas** « soumis à l'EAR » ; aucune règle de produit
  direct étranger (FDPR) relative au chiffrement n'atteint un produit
  fabriqué en France à partir de sources publiées ; et sans contenu
  américain *contrôlé*, la question du de minimis est sans objet.
- Conséquence si le conseil confirme : pas d'attribution d'ECCN, pas de
  recours à la License Exception ENC, **pas de rapport
  d'auto-classification BIS**, pas d'enregistrement SNAP-R — l'appareil
  déclaratif américain ne s'applique pas du tout. Cette confirmation écrite
  devient alors l'unique condition pour la bascule Apple vers NO (§6).
- **Conclusion fragile face aux changements** : elle tombe si le produit
  intègre un jour des composants cryptographiques américains non publiés,
  si le développement/la compilation est transféré aux États-Unis, ou en
  cas d'usage de technologie américaine contrôlée. Refaire cette analyse à
  chaque changement de ce type (même esprit que la clause « cryptologie
  inchangée » de l'attestation ANSSI).

**Repli si le conseil juge le produit soumis à l'EAR :**

- Classification probable : **5D002** (logiciel de sécurité de
  l'information), éligibilité grand public au titre de la **License
  Exception ENC, §740.17(b)(1)** : code objet, cryptographie standard
  publiquement disponible, vente au détail, sans obligations de support
  post-exportation au-delà des mises à jour consommateurs ordinaires.
  L'auto-classification aboutit à **ECCN 5D992 / autorisation MMKT**.
- Mécanique du rapport — **corrigée le 2026-10-20** (les brouillons
  antérieurs de ce dossier décrivaient à tort un dépôt unique avant sortie,
  à `bisencryption@bis.doc.gov`) : selon le **Supplement No. 8 to Part
  742**, le rapport d'auto-classification grand public est un **CSV envoyé
  par e-mail à `crypt-supp8@bis.doc.gov` et `enc@nsa.gov`**, soumis
  **annuellement avant le 1er février** pour l'année civile précédente. Il
  est **rétrospectif — ce n'est PAS une condition préalable à la sortie** :
  pour un lancement en décembre 2026, le premier rapport serait dû le
  2027-02-01. Vérifier adresses/format auprès des directives BIS en vigueur
  au moment du dépôt.
- Pièces pré-rédigées, **EN ATTENTE / ne pas envoyer** tant que le conseil
  n'a pas levé l'attente (ignorées par git, riches en données
  personnelles) : `docs/bis-self-classification-report.csv` et
  `docs/bis-self-classification-email.md` (conditions d'envoi documentées
  dans le brouillon d'e-mail).
- Criblage sanctions : la conformité OFAC standard s'applique à la
  distribution via les stores (les plateformes gèrent la disponibilité
  territoriale). **TBD :** confirmer l'absence de canaux de distribution
  directe supplémentaires.

## 4. Biens à double usage — France / UE

- **Déclaration française : ACCOMPLIE.** La déclaration de moyen de
  cryptologie a été déposée auprès de l'ANSSI le 2026-10-20, qui a délivré
  l'**attestation de dépôt — dossier n° 34842510, du 20 octobre 2026**
  (PDF : `~/Downloads/attestation-dossier-34842510.pdf` ; à archiver dans
  `~/Backups/` puis hors machine). L'obligation française de « fourniture
  en France » est acquittée. Réserve : les versions futures ne restent
  couvertes **que tant que les caractéristiques cryptologiques sont
  inchangées** — toute modification de la pile cryptographique impose une
  nouvelle déclaration avant distribution (règle reprise dans
  `src-tauri/e2ee-pro/README` et
  `docs/anssi-declaration-visualtalk-pro.md`).
- **Export double usage UE — le point français/UE restant.** L'attestation
  renvoie explicitement la distribution hors UE au **SBDU** (Service des
  biens à double usage, DG Trésor) au titre du **Règlement UE 2021/821**,
  Catégorie 5 Partie 2. **TBD (conseil) :** la distribution mondiale via
  les stores de ce logiciel de cryptologie grand public requiert-elle une
  formalité/autorisation SBDU, ou relève-t-elle de la note générale
  logiciel / du traitement grand public ? C'est là — et non côté BIS (§3) —
  que se situe la question déclarative ouverte avant sortie.
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
sur l'avis écrit de classification du conseil, qui n'existe pas encore.

Questionnaire ASC (App Encryption Declaration) tant que YES :
1. « Votre application utilise-t-elle du chiffrement ? » → **Oui.**
2. « Est-il limité à des usages exemptés ? » → **Non** tant que YES est la
   posture déclarée.
3. « Utilise-t-elle du chiffrement propriétaire ou non standard ? » →
   **Non** (algorithmes standard uniquement, cf. §2).

Chemin pour basculer à **NO** avant soumission (review la plus rapide) —
**un seul** élément est requis (mis à jour le 2026-10-20) :
1. Le conseil confirme **par écrit** soit (a) que le produit n'est **pas
   soumis à l'EAR** (conclusion de compétence du §3 — issue attendue pour
   un logiciel d'origine française construit à partir de cryptographie open
   source publiée), soit (b) l'éligibilité grand public/exempte (Note de la
   Catégorie 5 Partie 2 / type 5D992).

   *L'ancienne seconde condition — « rapport d'auto-classification BIS
   déposé » — est SUPPRIMÉE : selon le §3, ce rapport est rétrospectif, ne
   s'applique que si le produit est soumis à l'EAR, et ne conditionne ni la
   sortie ni la déclaration Apple.*

Alors : mettre `Info-pro.plist` à NO, répondre « Oui — exempt grand
public » à la Q2, et recompiler. **Ne pas basculer sans la confirmation
écrite du conseil.** Si la soumission intervient avant l'avis du conseil,
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
      la formalité française est **accomplie** (attestation ANSSI,
      dossier n° 34842510, 2026-10-20) ; les conditions restantes avant
      la première mise à disposition dans TOUT territoire sont la
      confirmation par le conseil de la position EAR (§3) et de la
      position UE/SBDU (§4).
- [x] Déclaration de moyen de cryptologie ANSSI déposée et **attestation
      reçue** (dossier n° 34842510, du 2026-10-20). Ne couvre les versions
      futures que tant que les caractéristiques cryptologiques sont
      inchangées ; distribution hors UE renvoyée au SBDU (§4). À faire
      (dirigeant) : archiver le PDF de l'attestation dans `~/Backups/`
      puis hors machine.
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
- [ ] Engagement d'un conseil pour : la confirmation de la compétence EAR
      (§3), la position export UE/SBDU (§4) et la bascule Apple vers NO
      (§6). La déclaration française est déjà déposée et attestée ; les
      pièces d'auto-classification BIS sont pré-rédigées et EN ATTENTE
      (§3) dans l'attente de la décision du conseil sur la compétence.
      E-mails prêts à envoyer (FR + EN) avec le périmètre à prix
      forfaitaire, les questions de filtrage, l'échéance de fin novembre
      et la checklist d'envoi : `docs/counsel-engagement-email.md`
      (périmètre mis à jour le 2026-10-20). Premiers contacts : CCI /
      guichet Team France Export, puis 2–3 cabinets spécialisés en
      contrôle des exportations.
- [x] Point de décision YES vs NO : **YES pour l'instant** (dirigeant,
      2026-10-19, retour sur le NO du même jour). Bascule vers NO avant
      soumission uniquement avec la confirmation écrite du conseil en main
      (chemin au §6) ; sinon soumettre avec YES.

## 8. Références

- 15 CFR §734.3(b)(3) (logiciels publiés non soumis à l'EAR), §740.17
  (License Exception ENC, grand public), §742.15, Supplement No. 8 to
  Part 742 (rapport d'auto-classification grand public), Supp. 1 to
  Part 740.
- Règlement UE 2021/821 (biens à double usage), Catégorie 5 Partie 2.
- Apple : documentation développeur « Export Compliance — App Encryption
  Declaration ».
- Ce dépôt : `src-tauri/e2ee-pro/e2ee.rs` (privé, ignoré par git),
  `src-tauri/Info-pro.plist`, `src-tauri/tauri.pro.conf.json`,
  `EULA-PRO` §8 (clause de conformité export présentée aux utilisateurs).

