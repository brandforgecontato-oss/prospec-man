import { loadBrowserConfig } from "@/integrations/browser/config";
import { captureFailureDiagnostics } from "@/integrations/browser/diagnostics";
import { sendDirectMessage } from "@/integrations/browser/dm";
import { withAgentPage } from "@/integrations/browser/session";

/**
 * prompt.MD "Testes" nível 2 (dry-run real, envio final bloqueado) for
 * `sendDirectMessage()`. Exercises the real composer against a real profile
 * — finds the "message" button, opens the composer, types the text with
 * the same human-like delay as production — but calls sendDirectMessage
 * with `dryRun: true`, so the final Enter that would actually send is
 * never pressed. On failure, saves the same screenshot/aria-snapshot
 * diagnostics production would, to help fix a selector before going live.
 *
 * Run this against your OWN test account, not a real lead — even in
 * dry-run, this opens that account's real inbox.
 *
 * Usage: pnpm dry-run:dm <usuario_do_instagram> "<mensagem>"
 */
async function main(): Promise<void> {
  const [rawUsername, ...messageParts] = process.argv.slice(2);
  const username = rawUsername?.replace(/^@/, "");
  const message = messageParts.join(" ");
  if (!username || !message) {
    console.error('Uso: pnpm dry-run:dm <usuario_do_instagram> "<mensagem>"');
    process.exit(1);
  }

  const config = loadBrowserConfig();
  console.log(`[dry-run] conectando ao Chrome via CDP em ${config.cdpUrl}...`);
  console.log("[dry-run] envio final BLOQUEADO — a mensagem será digitada, o Enter nunca será pressionado.");

  await withAgentPage(config, async (agentPage) => {
    try {
      const result = await sendDirectMessage(agentPage, username, message, { dryRun: true });
      console.log(`[dry-run] composer aberto e mensagem digitada com sucesso. sent=${result.sent} (esperado: false)`);
    } catch (error) {
      const diagnostics = await captureFailureDiagnostics({
        page: agentPage.page,
        jobId: 0,
        consoleErrors: agentPage.consoleErrors,
        networkFailures: agentPage.networkFailures,
        error,
      });
      console.error("[dry-run] falhou — diagnóstico salvo:", diagnostics);
      throw error;
    }
  });
  // The CDP connection is cached for reuse and never auto-closes — without
  // this, a one-shot script like this hangs instead of exiting.
  process.exit(0);
}

main().catch((error) => {
  console.error("[dry-run] falhou — os seletores de dm.ts podem precisar de ajuste contra o Instagram real:", error);
  process.exit(1);
});
