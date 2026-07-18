// Tiny console logger — avoids pulling in pino/pino-pretty and their transport
// setup for this single-purpose bot. Matches the .info/.warn/.error/.debug API
// that music.ts uses.
const ts = () => new Date().toISOString();

const logger = {
  info: (m: string) => console.log(`[${ts()}] INFO  ${m}`),
  warn: (m: string) => console.warn(`[${ts()}] WARN  ${m}`),
  error: (m: string) => console.error(`[${ts()}] ERROR ${m}`),
  debug: (m: string) => console.debug(`[${ts()}] DEBUG ${m}`),
};

export default logger;
