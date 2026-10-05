// Keep Node's disposable acceptance tests with their own runner and fixtures.
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'scripts/acceptance/**'] },
})
