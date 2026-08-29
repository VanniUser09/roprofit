/**
 * Logger estruturado, sem dependência de Cloud Functions.
 *
 * Mesma API do `scoped` do backend antigo, para que as 19 camadas puras
 * copiadas (sources, collectors, analytics…) não precisem mudar nenhum import.
 * Emite JSON por linha — o formato que o journald/Docker capturam bem e que dá
 * para filtrar com `grep scope=collector.market` nos logs da VPS.
 */
type Fields = Record<string, unknown>

const LEVEL = (process.env.LOG_LEVEL ?? "info").toLowerCase()
const ORDER = ["debug", "info", "warn", "error"]
const MIN = Math.max(0, ORDER.indexOf(LEVEL))

function emit(level: string, scope: string, message: string, fields?: Fields) {
  if (ORDER.indexOf(level) < MIN) return
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    scope,
    message,
    ...fields,
  })
  // stderr para warn/error, stdout para o resto: deixa o operador separar.
  if (level === "error" || level === "warn") process.stderr.write(line + "\n")
  else process.stdout.write(line + "\n")
}

export function scoped(scope: string, base: Fields = {}) {
  const merge = (fields?: Fields) => ({ ...base, ...fields })
  return {
    debug: (msg: string, fields?: Fields) => emit("debug", scope, msg, merge(fields)),
    info: (msg: string, fields?: Fields) => emit("info", scope, msg, merge(fields)),
    warn: (msg: string, fields?: Fields) => emit("warn", scope, msg, merge(fields)),
    error: (msg: string, error?: unknown, fields?: Fields) =>
      emit("error", scope, msg, merge({ ...fields, error: describeError(error) })),
    child: (childScope: string, childBase?: Fields) =>
      scoped(`${scope}.${childScope}`, { ...base, ...childBase }),
  }
}

export type Logger = ReturnType<typeof scoped>

export function describeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }
  if (error === undefined) return undefined
  return { message: String(error) }
}
