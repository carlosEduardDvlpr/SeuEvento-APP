import { describe, expect, it } from 'vitest';
import { whatsappUrl } from './whatsapp';

describe('whatsappUrl', () => {
  /*
   * O dono digita o número como fala, com parênteses e traço. O `wa.me` só aceita
   * dígitos e abriria uma conversa vazia, sem avisar, com qualquer outra coisa.
   */
  it('tira a pontuação que o dono digitou', () => {
    expect(whatsappUrl('(11) 99999-0000')).toBe('https://wa.me/5511999990000');
  });

  it('acrescenta o DDI quando falta', () => {
    expect(whatsappUrl('11999990000')).toBe('https://wa.me/5511999990000');
    // Fixo com 10 dígitos também é número de WhatsApp em muitas cidades.
    expect(whatsappUrl('1133334444')).toBe('https://wa.me/551133334444');
  });

  it('não duplica o DDI de quem já escreveu completo', () => {
    expect(whatsappUrl('+55 11 99999-0000')).toBe('https://wa.me/5511999990000');
  });

  it('leva a mensagem pronta, com os acentos escapados', () => {
    const url = whatsappUrl('11999990000', 'Olá! Pedido para 5 de dezembro.');

    expect(url).toBe(
      'https://wa.me/5511999990000?text=Ol%C3%A1!%20Pedido%20para%205%20de%20dezembro.',
    );
  });

  it('não põe query quando não há mensagem', () => {
    expect(whatsappUrl('11999990000')).not.toContain('?');
  });
});
