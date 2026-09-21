import { loginBodySchema, registerBodySchema } from '@chacara/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { apiFieldErrors, formErrorMessage, validateForm } from './form';

describe('validateForm', () => {
  it('devolve os dados já normalizados quando passa', () => {
    const result = validateForm(loginBodySchema, {
      email: '  ANA@Exemplo.COM ',
      password: 'senha-123',
    });

    expect(result.errors).toBeNull();
    expect(result.data).toEqual({ email: 'ana@exemplo.com', password: 'senha-123' });
  });

  it('aponta o campo que falhou, com a mensagem em pt-BR', () => {
    const result = validateForm(loginBodySchema, { email: 'ana@', password: '' });

    expect(result.data).toBeNull();
    expect(result.errors).toMatchObject({
      email: expect.stringContaining('válido'),
      password: expect.any(String),
    });
  });

  // Mostrar duas mensagens no mesmo campo só confunde.
  it('guarda só o primeiro erro de cada campo', () => {
    const result = validateForm(registerBodySchema, {
      name: '',
      email: 'nao-e-email',
      password: 'x',
      acceptTerms: false,
    });

    for (const message of Object.values(result.errors ?? {})) {
      expect(typeof message).toBe('string');
    }
    expect(result.errors?.acceptTerms).toContain('aceitar os termos');
  });
});

describe('apiFieldErrors', () => {
  function validationError(fields: { field: string; message: string }[]) {
    return new ApiError('VALIDATION_ERROR', 400, 'Confira os campos destacados.', {
      context: 'body',
      fields,
    });
  }

  it('traduz o details.fields da §11.1', () => {
    const errors = apiFieldErrors(
      validationError([
        { field: 'email', message: 'Informe um e-mail válido.' },
        { field: 'password', message: 'A senha precisa ter pelo menos 8 caracteres.' },
      ]),
    );

    expect(errors).toEqual({
      email: 'Informe um e-mail válido.',
      password: 'A senha precisa ter pelo menos 8 caracteres.',
    });
  });

  it('ignora erro que não é de validação', () => {
    expect(apiFieldErrors(new ApiError('DATE_UNAVAILABLE', 409, 'Data ocupada.'))).toEqual({});
  });

  it('não quebra com details fora do formato', () => {
    expect(apiFieldErrors(new ApiError('VALIDATION_ERROR', 400, 'x'))).toEqual({});
    expect(apiFieldErrors(new ApiError('VALIDATION_ERROR', 400, 'x', { fields: 'nada' }))).toEqual(
      {},
    );
    expect(apiFieldErrors(new Error('erro comum'))).toEqual({});
  });
});

describe('formErrorMessage', () => {
  it('mostra a mensagem dos erros que não pertencem a um campo', () => {
    const error = new ApiError('INVALID_CREDENTIALS', 401, 'E-mail ou senha incorretos.');

    expect(formErrorMessage(error)).toBe('E-mail ou senha incorretos.');
  });

  // Os campos já ficam marcados; repetir "confira os campos" acima deles é ruído.
  it('cala quando os campos já carregam o erro', () => {
    const error = new ApiError('VALIDATION_ERROR', 400, 'Confira os campos destacados.', {
      fields: [{ field: 'email', message: 'Informe um e-mail válido.' }],
    });

    expect(formErrorMessage(error)).toBeNull();
  });

  it('mostra a mensagem de validação quando não há campo identificado', () => {
    const error = new ApiError('VALIDATION_ERROR', 400, 'Confira os campos destacados.');

    expect(formErrorMessage(error)).toBe('Confira os campos destacados.');
  });

  it('devolve nulo para quem não é erro da API', () => {
    expect(formErrorMessage(new Error('falha qualquer'))).toBeNull();
    expect(formErrorMessage(null)).toBeNull();
  });
});
