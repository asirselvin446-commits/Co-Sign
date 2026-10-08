import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError, renderError } from '../lib/errors.js';
import { requestLang } from './auth.js';

export function installErrorHandling(app: FastifyInstance, timeZone: string): void {
  const send = (req: FastifyRequest, reply: FastifyReply, err: AppError) => {
    const lang = req.lang ?? requestLang(req);
    // Detailed reasons only for enrolled, authenticated devices (and staff on the dashboard).
    const trusted = req.auth !== null && req.auth !== undefined;
    const { status, body } = renderError(err, lang, trusted, timeZone);
    if (typeof err.extra.retryAfterSeconds === 'number') reply.header('retry-after', String(err.extra.retryAfterSeconds));
    return reply.status(status).send(body);
  };

  app.setErrorHandler((error: FastifyError | AppError | Error, req, reply) => {
    if (error instanceof AppError) {
      if (error.http >= 500) req.log.error({ err: error }, 'app error');
      return send(req, reply, error);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields = error.validation.map((v) => v.instancePath || v.params?.issue?.path?.join('.') || '').filter(Boolean);
      return send(req, reply, new AppError('INVALID_INPUT', {}, { fields }));
    }
    if (isResponseSerializationError(error)) {
      req.log.error({ err: error }, 'response did not match schema');
      return send(req, reply, new AppError('INTERNAL_ERROR'));
    }
    const fe = error as FastifyError;
    if (fe.statusCode === 429) {
      return send(req, reply, new AppError('TOO_MANY_ATTEMPTS', {}, { retryAfterSeconds: 60 }));
    }
    if (fe.validation || fe.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || fe.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || fe.statusCode === 400) {
      return send(req, reply, new AppError('INVALID_INPUT'));
    }
    if (fe.statusCode === 413) return send(req, reply, new AppError('INVALID_INPUT'));
    if (fe.statusCode === 404) return send(req, reply, new AppError('NOT_FOUND'));
    req.log.error({ err: error }, 'unhandled error');
    return send(req, reply, new AppError('INTERNAL_ERROR'));
  });
}
