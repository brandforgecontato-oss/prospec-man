/** connectOverCDP failed, or the connected Chrome has no logged-in context. Never auto-launch a new Chrome to recover — see prompt.MD "Etapa 1 — Navegador". */
export class BrowserUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BrowserUnavailableError";
  }
}

/** The agent page tried to navigate outside instagram.com. */
export class DomainViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainViolationError";
  }
}
