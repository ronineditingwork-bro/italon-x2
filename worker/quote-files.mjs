// PDF коммерческого предложения для Telegram — по ссылке, а не загрузкой с сервера.
// Сервер сайта не может загрузить файл в Telegram: короткие запросы (текст заявки) доходят, файл — нет.
// Поэтому в Telegram уходит только ссылка на файл, и Telegram сам скачивает его с сайта. Если Telegram до сайта
// не достанет, ту же ссылку получает менеджер в чат и скачивает PDF сам.
// Файл живёт в памяти процесса сутки (перезапуск сервера стирает всё), ссылка — 64 случайных шестнадцатеричных знака:
// её не угадать, на сайте она нигде не публикуется. В базе и на диске PDF не хранится.
export const FILE_TTL_MS = 24 * 3600 * 1000;
const MAX_FILES = 200, MAX_BYTES = 200 * 1024 * 1024;
const files = new Map();   // ключ → { bytes, name, expires }; Map хранит порядок добавления — старые первыми

function prune(now) {
  let total = 0;
  for (const [key, file] of files) if (file.expires <= now) files.delete(key); else total += file.bytes.length;
  for (const [key, file] of files) {
    if (files.size <= MAX_FILES && total <= MAX_BYTES) break;
    files.delete(key); total -= file.bytes.length;
  }
}

/** Кладёт файл на сутки. → ключ ссылки (64 hex). */
export function putFile(bytes, name, now = Date.now()) {
  const key = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  files.set(key, { bytes, name, expires: now + FILE_TTL_MS });
  prune(now);
  return key;
}

/** Файл по ключу и имени или null (нет, устарел, имя не то). */
export function getFile(key, name, now = Date.now()) {
  const file = files.get(key);
  if (!file || file.name !== name) return null;
  if (file.expires <= now) { files.delete(key); return null; }
  return file;
}
