import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        for (const ext of ['.ts', '.tsx']) {
          const url = new URL(specifier + ext, context.parentURL);
          if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
        }
      }
      throw err;
    }
  },
});
