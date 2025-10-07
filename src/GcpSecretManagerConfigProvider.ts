import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import type { Array } from "effect"
import { ConfigProvider, Context, Effect, flow, Layer, Option, pipe } from "effect"

export class SecretMap extends Context.Reference<SecretMap>()(
  "@inato/GcpSecretManagerConfigProvider/SecretMap",
  { defaultValue: () => new Map<string, string>() }
) {}

const fromSecretManager = Effect.fn(function*({
  projectId,
  secrets
}: {
  projectId: string
  secrets: Array.NonEmptyReadonlyArray<
    string | { nameInSecretManager: string; nameInConfig: string }
  >
}) {
  const secretManagerClient = yield* Effect.acquireRelease(
    Effect.sync(() => new SecretManagerServiceClient()),
    (client) => Effect.promise(() => client.close())
  )

  const secretMap = yield* SecretMap

  const getSecret = (name: string) =>
    pipe(
      Effect.tryPromise(() =>
        secretManagerClient.accessSecretVersion({
          name: `projects/${projectId}/secrets/${name}/versions/latest`
        })
      ),
      Effect.flatMap(([secret]) => Option.fromNullable(secret.payload?.data?.toString())),
      Effect.orDie
    )

  yield* Effect.forEach(secrets, (name) =>
    Effect.gen(function*() {
      const nameInConfig = typeof name === "string" ? name : name.nameInConfig
      if (!secretMap.has(nameInConfig)) {
        const nameInSecretManager = typeof name === "string" ? name : name.nameInSecretManager
        secretMap.set(nameInConfig, yield* getSecret(nameInSecretManager))
      }
    }))

  return ConfigProvider.fromMap(secretMap)
})

export const layerGcp = flow(
  fromSecretManager,
  Effect.map(Layer.setConfigProvider),
  Layer.unwrapScoped
)

export const layerGcpWithEnvFallback = flow(
  fromSecretManager,
  Effect.map(ConfigProvider.orElse(() => ConfigProvider.fromEnv())),
  Effect.map(Layer.setConfigProvider),
  Layer.unwrapScoped
)
