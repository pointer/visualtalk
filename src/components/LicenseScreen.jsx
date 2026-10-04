import { createSignal } from "solid-js";

// Compile-time edition detection
const IS_PRO =
  typeof __E2EE_ENABLED__ !== "undefined" && __E2EE_ENABLED__ === true;

const COMMUNITY_EULA =
  "VISUALTALK COMMUNITY EDITION \u2014 END USER LICENSE AGREEMENT\n" +
  "Last Updated: October 4, 2026\n\n" +
  "IMPORTANT: This EULA is a legal agreement between you and the VisualTalk developers for the Community Edition. By using this Software, you agree to these terms.\n\n" +
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
  "6. DATA & PRIVACY \u2014 Messages are NOT end-to-end encrypted. You control your LiveKit server.\n\n" +
  "7. WARRANTY \u2014 PROVIDED \"AS IS\" WITHOUT WARRANTY OF ANY KIND.\n\n" +
  "8. LIABILITY \u2014 Licensor not liable for indirect, incidental, or consequential damages.\n\n" +
  "9. TERMINATION \u2014 Automatic if you violate any term.\n\n" +
  "10. COMMERCIAL LICENSE \u2014 Purchase VisualTalk Pro Edition for commercial use.\n\n" +
  "11. ENTIRE AGREEMENT \u2014 This EULA supersedes all prior communications.\n\n" +
  "Source: PolyForm Noncommercial License 1.0.0\n" +
  "Full text: https://polyformproject.org/licenses/noncommercial/1.0.0/";

const PRO_EULA =
  "VISUALTALK PRO EDITION \u2014 END USER LICENSE AGREEMENT\n" +
  "Last Updated: October 4, 2026\n\n" +
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
  "  b) Reverse engineering or decompiling\n" +
  "  c) Circumventing or disabling E2EE encryption\n" +
  "  d) Sharing license keys to bypass licensing\n" +
  "  e) Using as a managed service without a hosting license\n\n" +
  "5. INTELLECTUAL PROPERTY \u2014 Licensed, not sold. All rights remain with Licensor.\n\n" +
  "6. DATA & PRIVACY \u2014 E2EE protects chat and file transfers. Audio/video use LiveKit security.\n\n" +
  "7. WARRANTY \u2014 PROVIDED \"AS IS\". No guarantee E2EE is vulnerability-free.\n\n" +
  "8. LIABILITY \u2014 Total liability capped at amount paid in preceding 12 months.\n\n" +
  "9. TERMINATION \u2014 Automatic if you violate any term.\n\n" +
  "10. REFUNDS \u2014 Governed by your app store platform.\n\n" +
  "11. ENTIRE AGREEMENT \u2014 This EULA supersedes all prior communications.";

const SOURCE_LICENSE =
  "POLYFORM NONCOMMERCIAL LICENSE 1.0.0\n\n" +
  "Source: https://polyformproject.org/licenses/noncommercial/1.0.0/\n\n" +
  "Summary:\n" +
  "  \u2705 Free for personal, educational, non-profit, and community use\n" +
  "  \u2705 Free for evaluation and testing\n" +
  "  \u274C Commercial use requires a VisualTalk Pro Edition license\n" +
  "  \u274C No sublicensing or redistribution for commercial purposes\n\n" +
  "For commercial licensing: contact the VisualTalk developers.";

/**
 * LicenseScreen component — displays EULA and source license
 * with tabbed document switching and edition-aware content.
 */
export function LicenseScreen(props) {
  const [activeDoc, setActiveDoc] = createSignal("eula");

  const editionLabel = IS_PRO ? "Pro Edition (E2EE)" : "Community Edition";
  const badgeClass = IS_PRO
    ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
    : "bg-blue-600/20 text-blue-400 border-blue-600/30";

  const docs = [
    { key: "eula", label: IS_PRO ? "Pro EULA" : "EULA" },
    { key: "source", label: "Source License" },
  ];

  const currentText = () => {
    if (activeDoc() === "source") return SOURCE_LICENSE;
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
        <span>v{props.version || "1.0.0"}</span>
      </div>
    </div>
  );
}