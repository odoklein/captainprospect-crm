// ============================================
// BROADCAST EMAIL COMPILER & BLOCK PARSER
// Compiles visual blocks into responsive bulletproof HTML
// Preserves lossless block metadata via HTML comments
// ============================================

import { EmailBlock, KeyValueItem } from "./types";

const METADATA_PREFIX = "<!-- __BROADCAST_METADATA_START__";
const METADATA_SUFFIX = "__BROADCAST_METADATA_END__ -->";

/**
 * Converts simple markdown/inline formatting to safe email HTML
 */
function formatContent(text?: string): string {
  if (!text) return "";
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold **text**
  out = out.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic *text*
  out = out.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Links [label](url)
  out = out.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">$1</a>'
  );
  // Line breaks
  out = out.replace(/\n/g, "<br />");
  return out;
}

/**
 * Compiles visual blocks into bulletproof, mobile-responsive HTML for emails.
 */
export function compileBlocksToHtml(
  subject: string,
  blocks: EmailBlock[],
  accentColor = "#4f46e5"
): string {
  const renderedBlocksHtml = blocks
    .map((block) => renderSingleBlock(block, accentColor))
    .join("\n");

  const metadataJson = JSON.stringify({
    version: 1,
    accentColor,
    blocks,
  });

  const metadataComment = `${METADATA_PREFIX}${Buffer.from(metadataJson, "utf8").toString("base64")}${METADATA_SUFFIX}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <tr>
            <td style="padding: 32px 36px 36px 36px;">
              ${renderedBlocksHtml}
            </td>
          </tr>
        </table>
        <!-- Invisible tracking/safe space -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; margin-top: 16px;">
          <tr>
            <td align="center" style="font-size: 11px; color: #94a3b8; font-family: sans-serif;">
              Message envoyé via la plateforme Captain Prospect
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${metadataComment}
</body>
</html>`;
}

/**
 * Render individual block to HTML snippet
 */
function renderSingleBlock(block: EmailBlock, accentColor: string): string {
  const align = block.props?.align || "left";

  switch (block.type) {
    case "header": {
      const subtitle = block.props?.logoSubtitle || "Plateforme Captain Prospect";
      return `
      <!-- Header Block -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
        <tr>
          <td align="${align}">
            <div style="display: inline-block;">
              <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                ⚓ Captain Prospect
              </span>
              <span style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px;">
                ${subtitle}
              </span>
            </div>
          </td>
        </tr>
      </table>`;
    }

    case "heading": {
      return `
      <!-- Heading Block -->
      <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.35; text-align: ${align};">
        ${formatContent(block.content)}
      </h1>`;
    }

    case "paragraph": {
      return `
      <!-- Paragraph Block -->
      <div style="margin: 0 0 18px 0; font-size: 15px; color: #334155; line-height: 1.65; text-align: ${align};">
        ${formatContent(block.content)}
      </div>`;
    }

    case "callout": {
      const variant = block.props?.styleVariant || "info";
      let bg = "#f1f5f9";
      let border = "#cbd5e1";
      let textColor = "#0f172a";

      if (variant === "success") {
        bg = "#f0fdf4";
        border = "#86efac";
        textColor = "#166534";
      } else if (variant === "warning") {
        bg = "#fffbeb";
        border = "#fcd34d";
        textColor = "#92400e";
      } else if (variant === "accent") {
        bg = "#eef2ff";
        border = "#c7d2fe";
        textColor = "#3730a3";
      }

      const isOtpCode = block.id?.includes("otp") || (block.content && block.content.trim().length <= 15 && block.props?.align === "center");

      return `
      <!-- Callout / Highlight Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 18px 0; background-color: ${bg}; border: 1px solid ${border}; border-radius: 12px;">
        <tr>
          <td style="padding: 16px 20px; text-align: ${align};">
            ${
              isOtpCode
                ? `<span style="display: block; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: ${textColor}; font-family: monospace;">${formatContent(block.content)}</span>`
                : `<div style="font-size: 14px; font-weight: 500; color: ${textColor}; line-height: 1.5;">${formatContent(block.content)}</div>`
            }
          </td>
        </tr>
      </table>`;
    }

    case "key_value": {
      const items: KeyValueItem[] = block.props?.items || [];
      if (items.length === 0) return "";

      const rows = items
        .map(
          (item) => `
        <tr>
          <td width="38%" style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #64748b; background-color: #f8fafc; border-bottom: 1px solid #f1f5f9; border-top-left-radius: 6px; border-bottom-left-radius: 6px;">
            ${item.icon ? `${item.icon} ` : ""}${item.label}
          </td>
          <td width="62%" style="padding: 10px 14px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
            ${item.value}
          </td>
        </tr>`
        )
        .join("");

      return `
      <!-- Key Value Table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        ${rows}
      </table>`;
    }

    case "button": {
      const btnText = block.props?.buttonText || "Accéder à mon espace";
      const btnUrl = block.props?.buttonUrl || "https://app.captainprospect.fr";
      const btnColor = block.props?.buttonColor || accentColor;

      return `
      <!-- Button CTA Block -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
        <tr>
          <td align="${align}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius: 10px; background-color: ${btnColor};">
                  <a href="${btnUrl}" target="_blank" style="display: inline-block; padding: 13px 26px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.01em;">
                    ${btnText}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    }

    case "divider": {
      return `
      <!-- Divider Block -->
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`;
    }

    case "footer": {
      return `
      <!-- Footer Block -->
      <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.6; text-align: ${align};">
        ${formatContent(block.content)}
      </div>`;
    }

    default:
      return "";
  }
}

/**
 * Extracts blocks and config from previously compiled HTML
 * If not compiled by this engine (e.g. legacy raw HTML), converts into a fallback paragraph block
 */
export function extractBlocksFromHtml(
  html: string,
  fallbackBlocks: EmailBlock[] = []
): { blocks: EmailBlock[]; accentColor?: string; isVisualCompiled: boolean } {
  if (!html) {
    return { blocks: fallbackBlocks, isVisualCompiled: false };
  }

  const startIdx = html.indexOf(METADATA_PREFIX);
  const endIdx = html.indexOf(METADATA_SUFFIX);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    try {
      const base64Data = html.slice(startIdx + METADATA_PREFIX.length, endIdx).trim();
      const jsonString = Buffer.from(base64Data, "base64").toString("utf8");
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
        return {
          blocks: parsed.blocks,
          accentColor: parsed.accentColor || "#4f46e5",
          isVisualCompiled: true,
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  // If there are fallback blocks defined, prefer them
  if (fallbackBlocks && fallbackBlocks.length > 0) {
    return { blocks: fallbackBlocks, isVisualCompiled: false };
  }

  // Otherwise convert raw content into an editable block
  return {
    blocks: [
      {
        id: "b_legacy",
        type: "paragraph",
        content: html.replace(/<[^>]*>?/gm, "").trim() || html,
      },
    ],
    isVisualCompiled: false,
  };
}

/**
 * Replaces {{variables}} in text or HTML with actual values or realistic samples
 */
export function substituteVariables(
  templateString: string,
  variablesMap: Record<string, string | null | undefined>
): string {
  if (!templateString) return "";
  let result = templateString;

  for (const [key, value] of Object.entries(variablesMap)) {
    const val = value !== undefined && value !== null ? String(value) : "";
    // Match both {{key}} and key
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, val);
  }

  return result;
}
