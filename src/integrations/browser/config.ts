export interface OperatingWindow {
  startHour: number;
  endHour: number;
}

export interface BrowserConfig {
  cdpUrl: string;
  profileDir: string;
  maxDmsPerDay: number;
  minSecondsBetweenDms: number;
  maxSecondsBetweenDms: number;
  operatingHours: OperatingWindow;
  operatingTimezone: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseOperatingHours(raw: string): OperatingWindow {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    throw new Error(`OPERATING_HOURS inválido: "${raw}" (formato esperado "HH:MM-HH:MM")`);
  }
  const [, startH, startM, endH, endM] = match;
  const startHour = Number(startH) + Number(startM) / 60;
  const endHour = Number(endH) + Number(endM) / 60;
  if (endHour <= startHour) {
    throw new Error(`OPERATING_HOURS inválido: "${raw}" (fim deve ser depois do início)`);
  }
  return { startHour, endHour };
}

/** Reads Chrome/CDP connection and pacing limits from env — see prompt.MD "Ritmo humano". */
export function loadBrowserConfig(): BrowserConfig {
  return {
    cdpUrl: requireEnv("CHROME_CDP_URL"),
    profileDir: requireEnv("CHROME_PROFILE_DIR"),
    maxDmsPerDay: readIntEnv("MAX_DMS_PER_DAY", 30),
    minSecondsBetweenDms: readIntEnv("MIN_SECONDS_BETWEEN_DMS", 90),
    maxSecondsBetweenDms: readIntEnv("MAX_SECONDS_BETWEEN_DMS", 240),
    operatingHours: parseOperatingHours(process.env.OPERATING_HOURS ?? "09:00-20:00"),
    operatingTimezone: process.env.OPERATING_TIMEZONE ?? "America/Sao_Paulo",
  };
}
