const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 } as const;
type Level = keyof typeof LEVELS;

const currentLevel: Level = (process.env.LOG_LEVEL as Level) || "info";

export function createLogger(tag: string) {
  const prefix = `[${tag}]`;
  return {
    debug: (...args: unknown[]) => { if (LEVELS[currentLevel] <= 0) console.log(prefix, ...args); },
    info:  (...args: unknown[]) => { if (LEVELS[currentLevel] <= 1) console.log(prefix, ...args); },
    warn:  (...args: unknown[]) => { if (LEVELS[currentLevel] <= 2) console.warn(prefix, ...args); },
    error: (...args: unknown[]) => { if (LEVELS[currentLevel] <= 3) console.error(prefix, ...args); },
  };
}
