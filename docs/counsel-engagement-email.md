# Counsel Engagement Email — Export Control (ready-to-send drafts)

Companion to `docs/export-compliance-pro.md`. Send with the packet attached.
Fill the bracketed fields before sending. French version first (Paris firms),
English version second (US / bilingual firms).

---

## Version française

**Objet :** Contrôle des exportations — mission ponctuelle (forfait) :
classification logicielle grand public avec chiffrement E2EE (EAR/BIS +
Règlement UE 2021/821 / ANSSI)

Madame, Monsieur,

Je dirige **Miradata SASU** (RCS Bobigny 849 735 311, Les Lilas, France),
éditrice de **VisualTalk Pro**, une application de visioconférence
(multiplateforme : macOS, Windows, iOS, Android) dont la fonction de
chiffrement de bout en bout (messages et transferts de fichiers entre
participants) repose exclusivement sur des algorithmes standard publiés :
ECDH P-256, HKDF-SHA-256, AES-256-GCM — implémentation en Rust pur issue de
bibliothèques open source publiques (RustCrypto), sans module validé FIPS,
sans algorithme propriétaire. Distribution : code objet uniquement, via
Apple App Store et Google Play, **mise à disposition mondiale simultanée**,
cible : la semaine suivant l'approbation App Review (soumission visée en
décembre 2026). La mise à disposition sera conditionnée à l'achèvement des
formalités applicables — c'est l'objet de cette consultation.

**Périmètre souhaité (devis à prix forfaitaire) :**

1. **Avis écrit de classification** : (a) droit américain — **le produit
   est-il soumis à l'EAR** (15 CFR §734.3(b)(3) : logiciel d'origine
   française, cryptographie issue exclusivement d'open source publié) et,
   si oui, ECCN 5D002 « mass market » / éligibilité à la License Exception
   ENC §740.17(b)(1) ; (b) droit UE/français — Règlement 2021/821 Cat. 5
   Part 2 : formalités d'**exportation hors UE** (voir point 3).
2. **BIS self-classification — uniquement si soumis à l'EAR** : relecture
   du rapport d'auto-classification (Supp. No. 8 to Part 742, CSV annuel
   avant le 1er février, rétrospectif) ; brouillons déjà préparés et en
   attente de votre décision de compétence.
3. **Formalité française : déjà accomplie** — déclaration ANSSI déposée,
   **attestation reçue** (dossier n° 34842510, du 2026-10-20). Question
   restante : la distribution mondiale via les stores (hors UE) exige-t-elle
   une formalité auprès du **SBDU** (DG Trésor) au titre du Règlement
   2021/821, ou relève-t-elle de la note générale logiciel / du traitement
   grand public ? À défaut, note motivée.
4. **Recommandation App Store Connect** : réponse à la déclaration de
   chiffrement (`ITSAppUsesNonExemptEncryption` YES/NO), avec justification.
5. **Exclusions territoriales** : confirmation du périmètre de mise à
   disposition initiale — Chine continentale exclue (régime OSCCA/loi sur
   la cryptographie, exigence de dépôt ICP depuis 2023) ; décision pour
   Russie/Biélorussie au vu des restrictions ENC depuis 2022.

**Trois questions préalables** (pour cadrer rapidement) :
- Pouvez-vous rendre un avis de **compétence EAR** (§734.3) pour un logiciel
  grand public d'origine française construit à partir de cryptographie open
  source publiée ?
- Avez-vous déjà déposé des rapports de self-classification BIS
  « mass market » (§740.17) pour des applications grand public ?
- Traitez-vous les questions **SBDU / double usage UE** (Règlement 2021/821)
  pour l'exportation de logiciels de cryptologie grand public ? (La
  déclaration ANSSI est déjà déposée et attestée — dossier n° 34842510.)

**Échéancier :** formalités engagées **avant fin novembre 2026** ; la date
de mise à disposition mondiale en dépend directement.

Vous trouverez en pièce jointe un dossier préparatoire (description
cryptographique complète issue du code livré, analyses EAR/UE pré-rédigées,
questions en suspens). Je reste disponible pour tout complément et vous
serais reconnaissant de m'indiquer votre **proposition d'honoraires
forfaitaires** et vos disponibilités.

Cordialement,
[Prénom Nom] — Miradata SASU
[téléphone] · [email]· [adresse postale]

---

## English version

**Subject:** Export control — fixed-fee one-off: mass-market classification
for a consumer E2EE app (EAR/BIS + EU Reg. 2021/821 / French ANSSI)

Dear Sir or Madam,

I run **Miradata SASU** (RCS Bobigny 849 735 311, Les Lilas, France),
publisher of **VisualTalk Pro**, a cross-platform video-conferencing
application (macOS, Windows, iOS, Android). Its end-to-end encryption
feature (chat messages and file transfers between meeting participants)
uses only standard, published algorithms: ECDH P-256, HKDF-SHA-256,
AES-256-GCM — pure-Rust implementation built on publicly available
open-source crates (RustCrypto), no FIPS-validated module, no proprietary
algorithm. Distribution: object code only, via the Apple App Store and
Google Play, **worldwide simultaneous release**, targeted for the week
following App Review approval (submission planned for December 2026).
Availability will be gated on completion of the applicable filings — which
is the purpose of this consultation.

**Requested scope (fixed-fee quote):**

1. **Written classification opinion**: (a) US — **is the product subject to
   the EAR at all** (15 CFR §734.3(b)(3): French-origin software built
   solely from published open-source crypto) and, if so, ECCN 5D002
   mass-market eligibility under License Exception ENC §740.17(b)(1);
   (b) EU/French — Regulation 2021/821 Category 5 Part 2: **extra-EU
   export** formalities (see item 3).
2. **BIS self-classification — only if subject to the EAR**: review of the
   self-classification report (Supp. No. 8 to Part 742, annual CSV due
   Feb 1, retrospective); drafts already prepared and on hold pending your
   jurisdiction call.
3. **French formality: already completed** — ANSSI declaration filed,
   **attestation received** (dossier n° 34842510, dated 2026-10-20).
   Remaining question: does worldwide store distribution (outside the EU)
   require any formality with the **SBDU** (DG Trésor) under Regulation
   2021/821, or is it covered by the general software note / mass-market
   treatment? Otherwise, a reasoned memo.
4. **App Store Connect recommendation**: the encryption declaration answer
   (`ITSAppUsesNonExemptEncryption` YES/NO), with rationale.
5. **Territory exclusions**: confirmation of the initial-release territory
   list — mainland China excluded (OSCCA / PRC Cryptography Law regime,
   ICP filing requirement since 2023); Russia/Belarus decision in light of
   the post-2022 ENC restrictions.

**Three screening questions:**
- Can you issue an **EAR-jurisdiction opinion** (§734.3) for French-origin
  consumer software built from published open-source cryptography?
- Have you filed BIS mass-market self-classification reports (§740.17) for
  consumer applications before?
- Do you handle **SBDU / EU dual-use** matters (Regulation 2021/821) for
  exports of mass-market cryptology software? (The ANSSI declaration is
  already filed and attested — dossier n° 34842510.)

**Timeline:** filings must be in motion **before the end of November 2026**;
the worldwide availability date depends directly on this.

Attached is a preparatory packet (full cryptographic description taken from
the shipped code, pre-drafted EAR/EU analyses, open questions). I would be
grateful for your **fixed-fee proposal** and availability, and remain at
your disposal for any further information.

Kind regards,
[First Name Last Name] — Miradata SASU
[phone] · [email@yahoo.com] · [postal address]

---

## Sending checklist

- [ ] Attach `docs/export-compliance-pro.md` (PDF or MD) — or its French
      translation `docs/export-compliance-pro.fr.md` for French firms.
- [ ] Fill bracketed identity fields; consider adding a phone number.
- [ ] First contacts: CCI Seine-Saint-Denis / Team France Export advisory
      desk (free orientation), then 2–3 firms from the Paris Bar directory
      or Chambers/Legal 500 "International Trade — France" listings.
- [ ] Track responses; target a signed scope by mid-November 2026.
- [ ] Log the outcome back into `docs/export-compliance-pro.md` §6.
