import * as it from "@effect/vitest"
import { Array, Config, Effect, Layer, Option, pipe, Record } from "effect"
import { describe, expect } from "vitest"
import { GcpProvider } from "../src/index.js"
import { layerWithEnvFallback } from "../src/layers.js"

const FAILING_SECRET_NAME = "FAILING_SECRET"
const SUCCESSFUL_SECRET_NAME = "SUCCESSFUL_SECRET"
const FAILING_SECRET_ENV_VALUE = "FAILING_SECRET_ENV_VALUE"
const SUCCESSFUL_SECRET_ENV_VALUE = "SUCCESSFUL_SECRET_ENV_VALUE"
const SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE = "SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE"

const setupTestEnvironment = (envVars: Record<string, string>) => {
  Object.entries(envVars).forEach(([key, value]) => {
    process.env[key] = value
  })
}

const cleanupTestEnvironment = (envVars: Record<string, string>) => {
  Object.keys(envVars).forEach((key) => {
    delete process.env[key]
  })
}

const retrieveSecrets = (
  secretNames: Array<string>,
  layer: Layer.Layer<never, never, never>
) =>
  pipe(
    secretNames,
    Array.map((name) =>
      [
        name,
        Config.string(name).pipe(Effect.provide(layer))
      ] as const
    ),
    Record.fromEntries,
    Effect.all
  )

describe("GcpProvider", () => {
  describe("layerWithEnvFallback", () => {
    it.effect("falls back to env for failing secrets while using Secret Manager for successful ones", () =>
      Effect.gen(function*() {
        const envVars = {
          [FAILING_SECRET_NAME]: FAILING_SECRET_ENV_VALUE,
          [SUCCESSFUL_SECRET_NAME]: SUCCESSFUL_SECRET_ENV_VALUE
        }
        setupTestEnvironment(envVars)

        const layer = pipe(
          layerWithEnvFallback({ secrets: [FAILING_SECRET_NAME, SUCCESSFUL_SECRET_NAME] }),
          Layer.provide(GcpProvider.layerFactory({
            getSecret: (name) =>
              Effect.succeed(
                Option.fromNullable(
                  name === SUCCESSFUL_SECRET_NAME ? SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE : undefined
                )
              )
          }))
        )

        const secrets = yield* retrieveSecrets(
          [FAILING_SECRET_NAME, SUCCESSFUL_SECRET_NAME],
          layer
        )

        expect(secrets).toEqual({
          [FAILING_SECRET_NAME]: FAILING_SECRET_ENV_VALUE,
          [SUCCESSFUL_SECRET_NAME]: SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE
        })

        cleanupTestEnvironment(envVars)
      }))
  })
})
