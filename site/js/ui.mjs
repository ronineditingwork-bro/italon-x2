// Мелкие общие помощники интерфейса: выбор элементов, диалоги, уведомление, корень сайта.
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const html = document.documentElement;

/** Относительный путь к корню сайта («./», «../», «../../») — для шаблонов. */
export const rootRel = html.dataset.root || './';
/** Абсолютный URL корня сайта (работает и на домене, и под /italon-x2/). */
export const ROOT = new URL(rootRel, document.baseURI);
export const siteUrl = path => new URL(String(path).replace(/^\//, ''), ROOT).href;
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Открыть <dialog> модально; повторный вызов безопасен. Возвращает элемент. */
export function openDialog(dialog) {
  if (typeof dialog === 'string') dialog = document.getElementById(dialog);
  if (!dialog) return null;
  if (!dialog.open) {
    for (const other of $$('dialog[open]')) if (other !== dialog && !other.contains(dialog)) other.close();
    dialog.showModal();
  }
  return dialog;
}
export function closeDialog(dialog) {
  if (typeof dialog === 'string') dialog = document.getElementById(dialog);
  if (dialog?.open) dialog.close();
}

// класс has-dialog на <html> (блокировка прокрутки фона; работает и без :has())
function syncDialogs() { html.classList.toggle('has-dialog', $$('dialog').some(d => d.open)); }
export function setupDialogs() {
  document.addEventListener('click', event => {
    const closer = event.target.closest('[data-dialog-close]');
    if (closer) { closer.closest('dialog')?.close(); return; }
    const dialog = event.target;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      // клик по подложке (вне прямоугольника диалога)
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    }
  });
  if (window.MutationObserver) for (const d of $$('dialog')) new MutationObserver(syncDialogs).observe(d, { attributes: true, attributeFilter: ['open'] });
}

let toastTimer;
export function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3800);
}
