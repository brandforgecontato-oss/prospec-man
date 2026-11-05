import { loadBrowserConfig } from "@/integrations/browser/config";
import { scrapeProfile } from "@/integrations/browser/profile";
import { gotoInstagram, withAgentPage } from "@/integrations/browser/session";

/**
 * prompt.MD "Testes" nível 2 (dry-run real) for `scrapeProfile()`. Read-only
 * — nothing is ever sent or changed — so unlike dry-run-dm.ts there is no
 * risk to gate: this is safe to run against any real, public profile to
 * confirm the selectors still match Instagram's current markup.
 *
 * Usage: pnpm dry-run:profile <usuario_do_instagram>
 */
async function main(): Promise<void> {
  const username = process.argv[2]?.replace(/^@/, "");
  if (!username) {
    console.error("Uso: pnpm dry-run:profile <usuario_do_instagram>");
    process.exit(1);
  }

  const config = loadBrowserConfig();
  console.log(`[dry-run] conectando ao Chrome via CDP em ${config.cdpUrl}...`);

  const profile = await withAgentPage(config, async (agentPage) => {
    await gotoInstagram(agentPage, `https://www.instagram.com/${username}/`);
    return scrapeProfile(agentPage.page);
  });

  console.log("[dry-run] perfil lido (nada foi enviado, nada foi alterado):");
  console.log(JSON.stringify(profile, null, 2));
  // The CDP connection is cached for reuse and never auto-closes — without
  // this, a one-shot script like this hangs instead of exiting.
  process.exit(0);
}

main().catch((error) => {
  console.error("[dry-run] falhou — os seletores de profile.ts podem precisar de ajuste contra o Instagram real:", error);
  process.exit(1);
});
