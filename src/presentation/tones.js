// Semantic status tones derived from the palette. Color never carries the state
// alone: every badge or notice has its own text (and the exceeded state a "−").
export const TONE_CLASS = Object.freeze({
  ok: 'bg-exito text-texto',
  aviso: 'bg-acento text-texto',
  neutral: 'bg-secundario text-texto',
  excedido: 'bg-excedido text-white',
});
export const noticeClass = (tone = 'aviso') => `rounded-xl px-3 py-2 text-sm ${TONE_CLASS[tone]}`;
