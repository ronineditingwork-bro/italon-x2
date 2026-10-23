# Воркер scripts/lab-slabs-sync.mjs: безопасное чтение ZIP и конвертация исходника (TIFF/JPEG/PNG/WebP) в WebP sRGB для MATERIAL LAB.
# Запускается только из lab-slabs-sync.mjs как `python -E -P` (каталог скрипта и текущая папка не попадают в sys.path). Нужен Pillow ≥ 10 с WebP и LittleCMS.
#
#   list <archive.zip>                                 → JSON: записи архива (имя, размеры, CRC) и предупреждения
#   convert <json-параметры>                            → JSON: размеры исходника, sha256, результаты desktop/mobile
#
# Безопасность ZIP: имя записи никогда не используется как путь (распаковка во временный файл с собственным именем, zip-slip невозможен);
# зашифрованные, слишком большие и подозрительно сжатые записи (zip bomb) отклоняются; при копировании считаются байты, а не верится заголовку.
import hashlib, io, json, os, shutil, sys, tempfile, zipfile
from PIL import Image, ImageCms, ImageOps

Image.MAX_IMAGE_PIXELS = 200_000_000          # защита от «бомб» распаковки: 200 Мп заведомо больше любой текстуры 120×278
MAX_ENTRY = 1_500_000_000                     # самая большая запись, которую соглашаемся распаковать
MAX_RATIO = 200                               # распакованный / сжатый размер; несжатый TIFF даёт 1–4
MAX_ENTRIES = 20_000
IMAGE_EXT = ('.tif', '.tiff', '.jpg', '.jpeg', '.png', '.webp')


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))


def list_zip(path):
    warnings, entries = [], []
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_ENTRIES:
            raise ValueError(f'в архиве {len(infos)} записей — больше допустимого {MAX_ENTRIES}')
        for i in infos:
            if i.is_dir():
                continue
            name = i.filename
            bad = name.startswith(('/', '\\')) or ':' in name or '..' in name.replace('\\', '/').split('/')
            reason = None
            if i.flag_bits & 0x1: reason = 'запись зашифрована'
            elif i.file_size > MAX_ENTRY: reason = f'запись больше {MAX_ENTRY // 10**6} МБ'
            elif i.compress_size and i.file_size / i.compress_size > MAX_RATIO: reason = 'подозрительная степень сжатия (zip bomb)'
            elif bad: reason = 'небезопасное имя записи'
            if name.lower().endswith('.zip') and not reason: reason = 'вложенный архив — распакуйте его вручную'
            entries.append({'name': name, 'size': i.file_size, 'csize': i.compress_size, 'crc': f'{i.CRC:08x}',
                            'date': '%04d-%02d-%02d' % i.date_time[:3], 'image': name.lower().endswith(IMAGE_EXT), 'reject': reason})
    out({'entries': entries, 'warnings': warnings})


def extract(zpath, entry, tmpdir):
    """Распаковка одной записи потоком во временный файл; возвращает (путь, sha256)."""
    with zipfile.ZipFile(zpath) as z:
        info = z.getinfo(entry)
        if info.flag_bits & 0x1 or info.file_size > MAX_ENTRY or (info.compress_size and info.file_size / info.compress_size > MAX_RATIO):
            raise ValueError('запись отклонена проверкой безопасности')
        dst = os.path.join(tmpdir, 'src' + os.path.splitext(entry)[1].lower())
        h, n = hashlib.sha256(), 0
        with z.open(info) as src, open(dst, 'wb') as f:
            while True:
                chunk = src.read(1 << 20)
                if not chunk: break
                n += len(chunk)
                if n > info.file_size or n > MAX_ENTRY:
                    raise ValueError('распакованные данные больше заявленного размера')
                h.update(chunk); f.write(chunk)
    return dst, h.hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


SRGB = ImageCms.createProfile('sRGB')
SRGB_ICC = ImageCms.ImageCmsProfile(SRGB).tobytes()


def to_srgb(im):
    icc = im.info.get('icc_profile')
    if im.mode in ('I;16', 'I;16B', 'I;16L', 'I'):    # 16-бит серый: без потерь в 8 бит
        im = im.point(lambda v: v / 257).convert('L')
    if icc:
        try:
            return ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), SRGB,
                                             renderingIntent=ImageCms.Intent.PERCEPTUAL, outputMode='RGB'), 'icc'
        except Exception as e:                        # профиль битый — переводим без управления цветом и сообщаем
            return im.convert('RGB'), f'профиль не применён: {e}'
    return im.convert('RGB'), 'нет ICC — считается sRGB'


def encode(im, q0, cap, floor):
    """Наибольшее качество в [floor, q0] с шагом 2, при котором файл ≤ cap; если не уложились — q0 и пометка over."""
    for q in range(q0, floor - 1, -2):
        b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6, icc_profile=SRGB_ICC)
        if b.tell() <= cap: return q, b.getvalue(), False
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q0, method=6, icc_profile=SRGB_ICC)
    return q0, b.getvalue(), True


def convert(p):
    tmp = tempfile.mkdtemp(prefix='italon-lab-')
    try:
        if p.get('zip'):
            path, sha = extract(p['zip'], p['entry'], tmp)
        else:
            path, sha = p['file'], file_sha(p['file'])
        im = Image.open(path)
        frames = getattr(im, 'n_frames', 1)          # многостраничный TIFF: берём первую страницу (сводное изображение), число страниц — в отчёт
        im.seek(0); im.load()
        im = ImageOps.exif_transpose(im)              # ориентация из EXIF у JPEG
        src_w, src_h, mode = im.width, im.height, im.mode
        rotated = False
        if im.width > im.height:                      # плита лежит на боку: поворот на 90° (без обрезки и растяжения)
            im = im.transpose(Image.Transpose.ROTATE_270); rotated = True
        rgb, color = to_srgb(im)
        res = {'sha256': sha, 'srcWidth': src_w, 'srcHeight': src_h, 'mode': mode, 'frames': frames, 'rotated': rotated, 'color': color}
        long_cap = p['maxLong']
        if rgb.height > long_cap:                     # только уменьшение: «HD» из маленького снимка не делаем
            rgb = rgb.resize((round(rgb.width * long_cap / rgb.height), long_cap), Image.Resampling.LANCZOS)
        mob_long = min(p['mobileLong'], rgb.height)
        mob = rgb.resize((round(rgb.width * mob_long / rgb.height), mob_long), Image.Resampling.LANCZOS) if mob_long < rgb.height else rgb
        for key, img, q0, cap in (('desktop', rgb, p['desktopQ'], p['desktopBudget']), ('mobile', mob, p['mobileQ'], p['mobileBudget'])):
            q, data, over = encode(img, q0, cap, p['floorQ'])
            with open(p[key], 'wb') as f: f.write(data)
            res[key] = {'width': img.width, 'height': img.height, 'q': q, 'bytes': len(data), 'over': over, 'sha256': hashlib.sha256(data).hexdigest()}
        out(res)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    try:
        if cmd == 'list': list_zip(sys.argv[2])
        elif cmd == 'convert': convert(json.loads(sys.argv[2]))
        else: raise ValueError('команды: list <zip> | convert <json>')
    except Exception as e:
        out({'error': f'{type(e).__name__}: {e}'}); sys.exit(2)
