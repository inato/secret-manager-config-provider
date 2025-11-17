import * as it from "@effect/vitest"
import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import { Array, Config, Effect, pipe, Record } from "effect"
import { beforeEach, describe, expect, vi } from "vitest"
import { layerGcpWithEnvFallback } from "../src/GcpSecretManagerConfigProvider.js"

vi.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: vi.fn()
}))

const FAILING_SECRET_NAME = "FAILING_SECRET"
const SUCCESSFUL_SECRET_NAME = "SUCCESSFUL_SECRET"
const FAILING_SECRET_ENV_VALUE = "FAILING_SECRET_ENV_VALUE"
const SUCCESSFUL_SECRET_ENV_VALUE = "SUCCESSFUL_SECRET_ENV_VALUE"
const SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE = "SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE"

const createMockSecretManagerClient = () => {
  const mockClient = {
    accessSecretVersion: vi.fn().mockImplementation(({ name }: { name: string }) => {
      const secretName = name.split("/secrets/")[1]?.split("/versions/")[0]

      return FAILING_SECRET_NAME === secretName
        ? Promise.reject(new Error("Secret Manager access failed"))
        : Promise.resolve([{ payload: { data: SUCCESSFUL_SECRET_SECRET_MANAGER_VALUE } }])
    }),
    close: vi.fn().mockResolvedValue(undefined)
  }

  vi.mocked(SecretManagerServiceClient).mockImplementation(() => mockClient as any)

  return mockClient
}

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
  layer: ReturnType<typeof layerGcpWithEnvFallback>
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

describe("GcpSecretManagerConfigProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("layerGcpWithEnvFallback", () => {
    it.effect("falls back to env for failing secrets while using Secret Manager for successful ones", () =>
      Effect.gen(function*() {
        const envVars = {
          [FAILING_SECRET_NAME]: FAILING_SECRET_ENV_VALUE,
          [SUCCESSFUL_SECRET_NAME]: SUCCESSFUL_SECRET_ENV_VALUE
        }
        setupTestEnvironment(envVars)

        createMockSecretManagerClient()

        const layer = layerGcpWithEnvFallback({
          projectId: "test-project",
          secrets: [FAILING_SECRET_NAME, SUCCESSFUL_SECRET_NAME]
        })

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
