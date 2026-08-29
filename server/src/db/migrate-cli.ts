import { close, migrate } from "./pool"

/** Aplica o schema manualmente. O index.js também faz isso na subida. */
migrate()
  .then(() => {
    console.log("Schema aplicado.")
    return close()
  })
  .catch((error) => {
    console.error("Falha ao migrar:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
