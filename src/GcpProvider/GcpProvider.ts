import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import { Context, Effect, Layer, Option, pipe } from "effect"
import { SecretManager } from "../common/SecretManager.js"

interface GcpProviderConfigProps {
  readonly projectId: string
}

class GcpProviderConfig extends Context.Tag("@inato/SecretManagerConfigProvider/GcpProviderConfig")<
  GcpProviderConfig,
  GcpProviderConfigProps
>() {}

export class GcpProvider extends Effect.Service<GcpProvider>()("@inato/SecretManagerConfigProvider/GcpProvider", {
  scoped: Effect.gen(function*() {
    const { projectId } = yield* GcpProviderConfig

    const client = yield* Effect.acquireRelease(
      Effect.sync(() => new SecretManagerServiceClient()),
      (client) => Effect.promise(() => client.close())
    )

    const getSecret = (name: string) =>
      pipe(
        Effect.tryPromise(() =>
          client.accessSecretVersion({
            name: `projects/${projectId}/secrets/${name}/versions/latest`
          })
        ),
        Effect.map(([secret]) => Option.fromNullable(secret.payload?.data?.toString())),
        Effect.catchAll(() => Effect.succeed(Option.none()))
      )

    return { getSecret } as const satisfies SecretManager
  })
}) {
  static readonly layer = ({ projectId }: GcpProviderConfigProps) =>
    pipe(
      Layer.effect(
        SecretManager,
        Effect.map(GcpProvider, (gcp) => gcp)
      ),
      Layer.provide(GcpProvider.Default),
      Layer.provide(Layer.succeed(GcpProviderConfig, GcpProviderConfig.of({ projectId })))
    )

  static readonly layerFactory = (
    { getSecret, projectId = "default-project-id" }: {
      getSecret: (name: string) => Effect.Effect<Option.Option<string>, never>
      projectId?: string
    }
  ) =>
    pipe(
      Layer.effect(SecretManager, Effect.succeed({ getSecret })),
      Layer.provide(
        Layer.succeed(GcpProviderConfig, GcpProviderConfig.of({ projectId }))
      )
    )
}
