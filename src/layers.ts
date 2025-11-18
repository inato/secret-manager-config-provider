import type { Array } from "effect"
import { ConfigProvider, Context, Effect, Layer, Option, pipe } from "effect"
import type { SecretInput } from "./common/SecretInput.js"
import { SecretManager } from "./common/SecretManager.js"

class SecretMap extends Context.Reference<SecretMap>()(
  "@inato/SecretManagerConfigProvider/SecretMap",
  { defaultValue: () => new Map<string, string>() }
) {}

const fromSecretManager = (secrets: Array.NonEmptyReadonlyArray<SecretInput>) =>
  Effect.gen(function*() {
    const secretMap = yield* SecretMap
    const secretManager = yield* SecretManager

    yield* Effect.forEach(
      secrets,
      (secretInput) =>
        Effect.gen(function*() {
          const nameInConfig = typeof secretInput === "string" ? secretInput : secretInput.nameInConfig
          const nameInSecretManager = typeof secretInput === "string" ? secretInput : secretInput.nameInSecretManager

          const maybeSecretValue = yield* secretManager.getSecret(nameInSecretManager)

          if (Option.isSome(maybeSecretValue)) {
            secretMap.set(nameInConfig, maybeSecretValue.value)
          }
        }),
      { concurrency: "unbounded" }
    )

    return ConfigProvider.fromMap(secretMap)
  })

interface SecretsConfig {
  readonly secrets: Array.NonEmptyReadonlyArray<SecretInput>
}

/**
 * Creates a Layer that provides configuration from any SecretManager implementation.
 * Secrets that cannot be retrieved will be omitted from the configuration.
 * Requires a SecretManager to be provided via Layer.provide().
 */
export const layer = (config: SecretsConfig) =>
  pipe(
    fromSecretManager(config.secrets),
    Effect.map(Layer.setConfigProvider),
    Layer.unwrapScoped
  )

/**
 * Creates a Layer that provides configuration from any SecretManager implementation,
 * falling back to environment variables if a secret fails to load.
 * Requires a SecretManager to be provided via Layer.provide().
 */
export const layerWithEnvFallback = (config: SecretsConfig) =>
  pipe(
    fromSecretManager(config.secrets),
    Effect.map(ConfigProvider.orElse(() => ConfigProvider.fromEnv())),
    Effect.map(Layer.setConfigProvider),
    Layer.unwrapScoped
  )

/**
 * Creates a Layer that provides configuration from any SecretManager implementation,
 * falling back to a JSON object if a secret fails to load.
 * Requires a SecretManager to be provided via Layer.provide().
 */
export const layerWithJsonFallback = (
  config: SecretsConfig & { json: unknown }
) =>
  pipe(
    fromSecretManager(config.secrets),
    Effect.map(ConfigProvider.orElse(() => ConfigProvider.fromJson(config.json))),
    Effect.map(Layer.setConfigProvider),
    Layer.unwrapScoped
  )
