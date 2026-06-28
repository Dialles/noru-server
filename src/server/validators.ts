import { HttpError } from './http';

export function asString(value: unknown, field: string, options: { required?: boolean; min?: number; max?: number } = {}): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw new HttpError(400, 'validation_error', `Campo obrigatório: ${field}`);
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'validation_error', `Campo inválido: ${field}`);
  }

  const trimmed = value.trim();
  if (options.min && trimmed.length < options.min) throw new HttpError(400, 'validation_error', `${field} deve ter pelo menos ${options.min} caracteres.`);
  if (options.max && trimmed.length > options.max) throw new HttpError(400, 'validation_error', `${field} deve ter no máximo ${options.max} caracteres.`);
  return trimmed;
}

export function asInteger(value: unknown, field: string, options: { required?: boolean; min?: number; max?: number } = {}): number | undefined {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw new HttpError(400, 'validation_error', `Campo obrigatório: ${field}`);
    return undefined;
  }

  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number)) throw new HttpError(400, 'validation_error', `Campo inválido: ${field}`);
  if (options.min !== undefined && number < options.min) throw new HttpError(400, 'validation_error', `${field} deve ser maior ou igual a ${options.min}.`);
  if (options.max !== undefined && number > options.max) throw new HttpError(400, 'validation_error', `${field} deve ser menor ou igual a ${options.max}.`);
  return number;
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function assertEmail(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new HttpError(400, 'validation_error', `E-mail inválido: ${field}`);
  }
  return value.toLowerCase();
}

export function assertSlug(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(value)) {
    throw new HttpError(400, 'validation_error', 'Slug inválido. Use letras minúsculas, números e hífen.');
  }
  return value;
}

export function allowedStatus(value: string): string {
  const allowed = new Set(['new', 'needs_attention', 'contacted', 'resolved', 'archived', 'promoter']);
  if (!allowed.has(value)) throw new HttpError(400, 'validation_error', 'Status inválido.');
  return value;
}
