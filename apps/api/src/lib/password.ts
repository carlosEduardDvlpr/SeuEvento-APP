import argon2 from 'argon2';

/**
 * Senha (§10.1): `argon2id` com os parâmetros recomendados pela própria
 * biblioteca. Um único lugar decide o algoritmo, para o seed, o cadastro, o
 * login e a redefinição nunca divergirem.
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, plain);
  } catch {
    // Hash corrompido ou de outro algoritmo é senha inválida, não erro 500.
    return false;
  }
}
