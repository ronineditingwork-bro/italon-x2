import { products } from './catalog.mjs';
import images from '../data/context-images.json' with { type: 'json' };

const groups = new Map();
const sentence = s => s.toLocaleLowerCase('ru-RU').replace(/^./u, c => c.toLocaleUpperCase('ru-RU')).replace(/[xх]2/gi, 'X2');
// «ШАРМ ДЕЛЮКС» → «Шарм делюкс», а латинские названия (SAN SIRO, DA VINCI) — «San Siro», «Da Vinci»
const collectionLabel = name => /[A-Za-z]/.test(name) && !/[А-Яа-яЁё]/.test(name)
  ? name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/x2/gi, 'X2') : sentence(name);
for (const product of products) {
  if (product.collectionId === 'packaging') continue;
  const group = groups.get(product.collectionId) || {
    id: product.collectionId,
    label: collectionLabel(product.collection),
    section: product.section,
    count: 0,
    image: images.collections[product.collectionId] || null,
  };
  group.count++;
  groups.set(product.collectionId, group);
}
export const collections = [...groups.values()];
export const collectionMap = groups;
export const layingMethods = images.laying;
export const outdoorSpaces = [
  { id: 'terrace', label: 'Терраса и патио', project: 'Терраса', collectionId: 'x2-millennium', description: 'Продолжение дома под открытым небом.' },
  { id: 'garden', label: 'Садовые дорожки', project: 'Садовые дорожки', collectionId: 'x2-magnetique', description: 'Геометрия плит в зелёном ландшафте.' },
  { id: 'pool', label: 'Зона у бассейна', project: 'Зона у бассейна', collectionId: 'x2-fossil', description: 'Материалы и специальные элементы в одной гамме.' },
];
