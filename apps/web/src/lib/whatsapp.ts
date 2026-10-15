/**
 * Link de conversa no WhatsApp (§13.1, §13.2).
 *
 * O MVP não manda mensagem automática (§22): o que existe é um link para a pessoa
 * abrir a conversa já com um texto pronto, que é o que evita o "oi" solto e o dono
 * ter de perguntar de qual reserva se trata.
 *
 * O número é guardado como o dono digitou (com parênteses, espaços e traços), mas
 * o `wa.me` só aceita dígitos. O DDI entra quando falta: um número brasileiro de
 * 10 ou 11 dígitos é o que o dono escreve naturalmente, e sem o 55 o link abre
 * uma conversa vazia sem avisar que o número não existe.
 */
export function whatsappUrl(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';

  return `https://wa.me/${withCountry}${text}`;
}
