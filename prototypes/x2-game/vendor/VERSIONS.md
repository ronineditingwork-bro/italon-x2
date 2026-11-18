# Зависимости (зафиксированы)

- three **0.160.0** (MIT): `three.module.js` из пакета `three@0.160.0`, build/three.module.js
- `RoundedBoxGeometry.js`, `BufferGeometryUtils.js` — из `three@0.160.0/examples/jsm`, единственное изменение: импорт `'three'` заменён на `./three.module.js`.
- `RoomEnvironment.js`, `EffectComposer.js`, `RenderPass.js`, `ShaderPass.js`, `MaskPass.js`, `Pass.js`, `UnrealBloomPass.js`, `OutputPass.js`, `CopyShader.js`, `LuminosityHighPassShader.js`, `OutputShader.js` — из `three@0.160.0/examples/jsm`; изменены только пути импорта (`'three'` → `./three.module.js`, все файлы лежат в одной папке).
