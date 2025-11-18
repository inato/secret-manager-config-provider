import type { Effect, Option } from "effect"
import { Context } from "effect"

/**
 * Generic interface for secret manager services.
 * Any secret manager implementation (GCP, AWS, etc.) should implement this interface.
 */
export interface SecretManager {
  /**
   * Retrieves a secret by name.
   * Returns None if the secret is not found or if there's an error accessing it.
   * @param name - The name of the secret to retrieve
   */
  readonly getSecret: (name: string) => Effect.Effect<Option.Option<string>, never>
}

export const SecretManager = Context.GenericTag<SecretManager>("@inato/SecretManagerConfigProvider/SecretManager")
