import { handleRequest } from '../../src/server/app';
import type { Env } from '../../src/server/types';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return handleRequest(request, env);
};
