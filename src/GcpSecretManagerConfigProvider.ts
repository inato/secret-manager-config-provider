import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import type { Array } from "effect"
import { ConfigProvider, Context, Effect, flow, Layer, Option, pipe } from "effect"

export class SecretMap extends Context.Reference<SecretMap>()(
  "@inato/GcpSecretManagerConfigProvider/SecretMap",
  { defaultValue: () => new Map<string, string>() }
) {}

export type SecretInput = string | { nameInSecretManager: string; nameInConfig: string }

export interface ConfigProviderInput {
  projectId: string
  secrets: Array.NonEmptyReadonlyArray<SecretInput>
}

const fromSecretManager = Effect.fn(function*({
  projectId,
  secrets
}: ConfigProviderInput) {
  const secretMap = yield* SecretMap

  const secretManagerClient = yield* Effect.acquireRelease(
    Effect.sync(() => new SecretManagerServiceClient()),
    (client) => Effect.promise(() => client.close())
  )

  const getSecret = (name: string) =>
    pipe(
      Effect.tryPromise(() =>
        secretManagerClient.accessSecretVersion({
          name: `projects/${projectId}/secrets/${name}/versions/latest`
        })
      ),
      Effect.flatMap(([secret]) => Option.fromNullable(secret.payload?.data?.toString()))
    )

  yield* Effect.forEach(
    secrets,
    (name) =>
      Effect.gen(function*() {
        const nameInConfig = typeof name === "string" ? name : name.nameInConfig
        const nameInSecretManager = typeof name === "string" ? name : name.nameInSecretManager
        const secretResult = yield* Effect.option(getSecret(nameInSecretManager))

        if (Option.isSome(secretResult)) {
          secretMap.set(nameInConfig, secretResult.value)
        }
      }),
    { concurrency: "unbounded" }
  )

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

export const layerGcpWithJsonFallback = ({ json, projectId, secrets }: ConfigProviderInput & { json: unknown }) =>
  pipe(
    fromSecretManager({ projectId, secrets }),
    Effect.map(ConfigProvider.orElse(() => ConfigProvider.fromJson(json))),
    Effect.map(Layer.setConfigProvider),
    Layer.unwrapScoped
  )
