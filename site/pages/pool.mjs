// /pool/ — Бассейн Lab: плитка Italon в чаше и X2 на террасе и бортике на фото-сценах бассейнов (день и вечер).
// Сцены и слои — data/pool-lab-scene.json и public/media/pool-lab/ (scripts/pool-lab/photo_scene.py); варианты плитки — из каталога при сборке.
import { readFileSync } from 'node:fs';
import { products } from '../data.mjs';
import { buildOptions } from '../shared/pool/model.mjs';
import { poolMarkup } from '../shared/pool/ui.mjs';

const read = p => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));

export const poolData = (root = './') => {
  const scenes = read('data/pool-lab-scene.json').variants;
  return { scenes, options: buildOptions(products, { root, originals: read('data/lab-originals.json').items }), root };
};

export default {
  path: '/pool/',
  name: 'pool',
  bodyClass: 'outdoor-body',
  title: 'Бассейн Lab — плитка для чаши, бортика и террасы',
  description: 'Подберите керамогранит Italon для чаши и X2 20 мм для террасы и бортика на готовых сценах бассейнов днём и вечером. Цвет воды меняется вместе с плиткой, расчёт упаковок — по вашим размерам.',
  styles: ['outdoor', 'pool'],
  scripts: ['pool'],
  render: ctx => {
    const data = poolData(ctx.root || './');
    return `${poolMarkup({ scenes: data.scenes, root: data.root })}
<script type="application/json" id="pool-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  },
};
