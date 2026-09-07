/**
 * Manual Jest mock for `@thallesp/nestjs-better-auth`, wired via `jest.moduleNameMapper` (see
 * `manifest.ts`'s `jestModuleNameMapper`) — not a transform config. The package ships ESM-only,
 * and Jest's CommonJS-based test runner cannot load a real `.mjs` file even with a transform
 * configured for it (a current, well-documented Jest limitation — see recipes/README.md). Unit
 * tests never need the real auth library anyway; this only has to satisfy the runtime (non-type)
 * imports the recipe's own code makes: `AllowAnonymous` (a no-op decorator, used on
 * app.controller.ts's health route) and `AuthModule` (referenced but never actually instantiated
 * by any unit test that merely imports a file mentioning it).
 */
export function AllowAnonymous(): MethodDecorator & ClassDecorator {
  return () => undefined;
}

export class AuthModule {
  static forRoot(): { module: typeof AuthModule } {
    return { module: AuthModule };
  }
}
