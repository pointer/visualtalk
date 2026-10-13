import { createSignal, createResource } from "solid-js";

// Single source of truth: the same PRIVACY.md that ships alongside the
// installer is bundled verbatim at build time (Vite `?raw`), so the in-app
// copy can never drift from it. At ~11 KB it needs no lazy loading, unlike
// the third-party notices corpus.
import PRIVACY_POLICY from "../../PRIVACY.md?raw";

// Compile-time edition detection
const IS_PRO =
  typeof __E2EE_ENABLED__ !== "undefined" && __E2EE_ENABLED__ === true;

const COMMUNITY_EULA =
  "VISUALTALK COMMUNITY EDITION \u2014 END USER LICENSE AGREEMENT\n" +
  "Last Updated: October 4, 2026\n\n" +
  "IMPORTANT: This EULA is a legal agreement between you and Miradata SASU for the Community Edition. By using this Software, you agree to these terms.\n\n" +
  "1. LICENSE GRANT \u2014 Non-exclusive, non-transferable license for Noncommercial Purposes only.\n\n" +
  "2. EDITION \u2014 Community Edition: video conferencing, chat, screen sharing, file transfer. NO End-to-End Encryption (E2EE).\n\n" +
  "3. PERMITTED USE:\n" +
  "  a) Personal, non-commercial communication\n" +
  "  b) Educational and academic purposes\n" +
  "  c) Non-profit and charitable organizations\n" +
  "  d) Community groups and volunteer organizations\n" +
  "  e) Evaluation and testing\n\n" +
  "4. PROHIBITED USE:\n" +
  "  a) Commercial business operations or corporate communications\n" +
  "  b) Providing paid services or managed hosting\n" +
  "  c) Internal operations of for-profit entities\n" +
  "  d) Revenue-generating activities\n" +
  "  e) Redistributing or selling the Software\n" +
  "  f) Reverse engineering or decompiling\n\n" +
  "5. INTELLECTUAL PROPERTY \u2014 Licensed, not sold. All rights remain with Licensor.\n\n" +
  "6. DATA & PRIVACY \u2014 Messages are NOT end-to-end encrypted. You supply your own LiveKit server \u2014 no default server, no embedded credentials. See the Privacy tab.\n\n" +
  "7. WARRANTY \u2014 PROVIDED \"AS IS\" WITHOUT WARRANTY OF ANY KIND.\n\n" +
  "8. LIABILITY \u2014 Licensor not liable for indirect, incidental, or consequential damages.\n\n" +
  "9. TERMINATION \u2014 Automatic if you violate any term.\n\n" +
  "10. COMMERCIAL LICENSE \u2014 Purchase VisualTalk Pro Edition for commercial use.\n\n" +
  "11. ENTIRE AGREEMENT \u2014 This EULA supersedes all prior communications.\n\n" +
  "Source: PolyForm Noncommercial License 1.0.0\n" +
  "Full text: https://polyformproject.org/licenses/noncommercial/1.0.0/";

const PRO_EULA =
  "VISUALTALK PRO EDITION \u2014 END USER LICENSE AGREEMENT\n" +
  "Last Updated: October 13, 2026\n\n" +
  "IMPORTANT: This EULA covers the Pro Edition with End-to-End Encryption (E2EE). By using this Software, you agree to these terms.\n\n" +
  "1. LICENSE GRANT \u2014 Non-exclusive, non-transferable license for personal AND commercial use.\n\n" +
  "2. EDITION \u2014 Pro Edition: all Community features + E2EE for chat and file transfers.\n" +
  "   Crypto Stack: ECDH P-256 | HKDF-SHA-256 | AES-256-GCM\n\n" +
  "3. PERMITTED USE:\n" +
  "  a) Business meetings and corporate communications\n" +
  "  b) Client and customer-facing conferences\n" +
  "  c) Internal operations of for-profit entities\n" +
  "  d) Paid consulting, coaching, professional services\n" +
  "  e) All Community Edition uses\n\n" +
  "4. PROHIBITED USE:\n" +
  "  a) Redistributing or selling E2EE as a standalone service\n" +
  "  b) Reverse engineering or decompiling, except as permitted for LGPL-licensed components or as required by applicable law\n" +
  "  c) Circumventing or disabling E2EE encryption\n" +
  "  d) Sharing license keys to bypass licensing\n" +
  "  e) Using as a managed service without a hosting license\n\n" +
  "5. INTELLECTUAL PROPERTY \u2014 Licensed, not sold. All rights remain with Licensor.\n\n" +
  "6. DATA & PRIVACY \u2014 E2EE protects chat and file transfers; audio/video use your LiveKit server's transport security. You supply your own server \u2014 no default server, no embedded credentials. See the Privacy tab.\n\n" +
  "7. OPEN-SOURCE COMPONENTS \u2014 The Software bundles third-party open-source components, which are licensed to you under their own terms and not under this EULA. Your rights under those licenses \u2014 including the GNU LGPL-2.1-or-later and file-scoped MPL-2.0 components \u2014 are not limited by this EULA, and include the right to obtain, modify, and re-link that source. The complete list and license texts are in the \u201COpen Source\u201D tab and in THIRD_PARTY_NOTICES.md.\n\n" +
  "8. EXPORT COMPLIANCE \u2014 The Software contains cryptographic functionality and is subject to export control and sanctions laws. You may not export or re-export it in violation of those laws. Encryption details and the export-control classification are in the \u201COpen Source\u201D tab.\n\n" +
  "9. WARRANTY \u2014 PROVIDED \"AS IS\". No guarantee E2EE is vulnerability-free. Mandatory French statutory warranties (garantie légale de conformité, garantie des vices cachés) cannot be excluded.\n\n" +
  "10. LIABILITY \u2014 Total liability capped at amount paid in preceding 12 months, except for willful misconduct, gross negligence, fraud or personal injury.\n\n" +
  "11. TERMINATION \u2014 Automatic if you violate any term. Sections 7 and 8 survive.\n\n" +
  "12. REFUNDS \u2014 Apple and Google are the merchant of record, so your contract of sale and any refund are with the platform. The Licensor remains responsible for the Software itself and for warranty claims.\n\n" +
  "13. GOVERNING LAW \u2014 Governed by the laws of France. Disputes fall under the jurisdiction of the courts of Bobigny, subject to any mandatory consumer protections in your country of residence.\n\n" +
  "14. ENTIRE AGREEMENT \u2014 This EULA supersedes all prior communications.\n\n" +
  "This is a summary. The complete, authoritative text is supplied as EULA-PRO with the Software.";

const SOURCE_LICENSE =
  "POLYFORM NONCOMMERCIAL LICENSE 1.0.0\n\n" +
  "Source: https://polyformproject.org/licenses/noncommercial/1.0.0/\n\n" +
  "Summary:\n" +
  "  \u2705 Free for personal, educational, non-profit, and community use\n" +
  "  \u2705 Free for evaluation and testing\n" +
  "  \u274C Commercial use requires a VisualTalk Pro Edition license\n" +
  "  \u274C No sublicensing or redistribution for commercial purposes\n\n" +
  "For commercial licensing: contact Miradata SASU at <kghemari@yahoo.com>.";

/**
 * LicenseScreen component — displays EULA and source license
 * with tabbed document switching and edition-aware content.
 */
export function LicenseScreen(props) {
  const [activeDoc, setActiveDoc] = createSignal("eula");

  // The third-party notice corpus is large (~145 KB), so it lives in its own
  // generated module and is pulled in only when this tab is actually opened.
  // Generated by `pnpm notices` (scripts/generate-notices.py).
  const [notices] = createResource(
    () => activeDoc() === "opensource",
    async (active) => {
      if (!active) return null;
      const mod = await import("../lib/thirdPartyNotices");
      return mod.THIRD_PARTY_NOTICES;
    }
  );

  const editionLabel = IS_PRO ? "Pro Edition (E2EE)" : "Community Edition";
  const badgeClass = IS_PRO
    ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
    : "bg-blue-600/20 text-blue-400 border-blue-600/30";

  const docs = [
    { key: "eula", label: IS_PRO ? "Pro EULA" : "EULA" },
    { key: "source", label: "Source License" },
    { key: "privacy", label: "Privacy" },
    { key: "opensource", label: "Open Source" },
  ];

  const currentText = () => {
    if (activeDoc() === "source") return SOURCE_LICENSE;
    if (activeDoc() === "privacy") return PRIVACY_POLICY;
    if (activeDoc() === "opensource") {
      if (notices.error) {
        return (
          "OPEN SOURCE NOTICES UNAVAILABLE\n\n" +
          "The third-party license notices could not be loaded in-app.\n" +
          "They are shipped as THIRD_PARTY_NOTICES.md alongside the installer " +
          "and are available in the VisualTalk source repository."
        );
      }
      return notices() || "Loading third-party notices\u2026";
    }
    return IS_PRO ? PRO_EULA : COMMUNITY_EULA;
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">License Information</h3>
        <span class={"text-xs px-2.5 py-1 rounded-full border " + badgeClass}>
          {editionLabel}
        </span>
      </div>

      <div class="flex gap-2">
        {docs.map((doc) => (
          <button
            onClick={() => setActiveDoc(doc.key)}
            class={
              "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all " +
              (activeDoc() === doc.key
                ? "bg-blue-600/20 text-blue-400 border-blue-600/40"
                : "bg-[#1a1a1a] text-gray-400 border-[#2a2a2a] hover:border-gray-600")
            }
          >
            {doc.label}
          </button>
        ))}
      </div>

      <div class="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-4 max-h-[50vh] overflow-y-auto">
        <pre class="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
          {currentText()}
        </pre>
      </div>

      <div class="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-[#2a2a2a]">
        <span>{"\u00A9 2026 VisualTalk. All rights reserved."}</span>
        <span>v{props.version || "3.3.33"}</span>
      </div>
    </div>
  );
}