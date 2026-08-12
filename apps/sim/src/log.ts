const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

let threshold = LEVELS['info'] ?? 20;

export function setLogLevel(level: string): void {
  threshold = LEVELS[level] ?? 20;
}

function write(level: string, scope: string, message: string): void {
  if ((LEVELS[level] ?? 20) < threshold) return;
  process.stdout.write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}\n`);
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function logger(scope: string): Logger {
  return {
    debug: (m) => write('debug', scope, m),
    info: (m) => write('info', scope, m),
    warn: (m) => write('warn', scope, m),
    error: (m) => write('error', scope, m),
  };
}
