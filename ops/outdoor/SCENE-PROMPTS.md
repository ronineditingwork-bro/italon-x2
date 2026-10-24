# Новые сцены X2 Outdoor Lab: промпты для генерации исходных картинок

Общие требования к каждой картинке (иначе зоны не получится разметить честно):
- ясный день, мягкое дневное солнце, камера на уровне глаз (≈1,2–1,6 м), угол 3/4, ландшафтный кадр 3:2 (≥ 2000 px по ширине), без людей, машин, надписей и водяных знаков;
- **зоны под покрытие — без плитки и без рисунка**: ровный нейтральный серо-бежевый бетон/щебень цвета RAL 7032 без швов, без плиточной сетки: терраса у дома, дорожка к входу, площадка;
- зоны хорошо видны целиком, ничем не перекрыты (без мебели на полу посреди зоны, ярких бликов, луж);
- газон и гравий по краям — отдельными полосами, чтобы край покрытия был чётким.

1. Кирпичный домик
   «Photorealistic exterior, small cozy house of red clay brick, windows with anthracite grey frames RAL 7024, picket-style "comb" fence (vertical slats, wooden or metal, painted RAL 7024) along the plot, lawn, clean flat neutral grey concrete terrace in front of the entrance and a straight path to the gate (no tiles, no seams, no pattern), sunny day, eye-level 3/4 view, 3:2, no people, no text».
2. Белый дом, американский кантри
   «Photorealistic exterior, white American country (farmhouse) style house, gabled dark roof, wide covered porch with white columns, black window frames, lawn, clean flat neutral grey concrete porch floor, terrace and a curved path to the porch (no tiles, no seams, no pattern), sunny day, eye-level 3/4 view, 3:2, no people, no text».
3. Индустриальный дом
   «Photorealistic exterior, industrial-style house: raw board-formed concrete walls, rusty corten steel panels, charred black wood (shou sugi ban) cladding, large black steel-framed windows, flat roof, gravel strip and sparse grass, clean flat neutral grey concrete terrace and straight path to the entrance (no tiles, no seams, no pattern), sunny day, eye-level 3/4 view, 3:2, no people, no text».

Когда картинки готовы: положить в `public/media/outdoor/<id>.webp` (+ `-thumb.webp` 480×320) и написать в сессию — камера и контуры зон добавляются в `site/shared/outdoor/scenes.mjs`.
