"""Render the Pool Lab scene as relightable layers (Blender 5.3 as the `bpy` module).

For every pool type and light group it renders the scene twice, with all tile albedo 0 ("black")
and 0.5 ("white"), plus one "uv" pass: tile surfaces emit (u, v, zone) in metres and are seen
through refractive water. The browser rebuilds any tile choice as  black + tex(uv) * (white-black)/0.5.

Usage: python render_scene.py OUT_DIR [--res 1600x1000] [--samples 160] [--variants skimmer,overflow]
"""
import argparse, json, math, os, sys
import bpy, bmesh
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--res', default='1600x1000')
ap.add_argument('--samples', type=int, default=160)
ap.add_argument('--variants', default='skimmer,overflow')
ap.add_argument('--groups', default='sun,pool,house')
ap.add_argument('--passes', default='uv,black,white')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
os.makedirs(args.out, exist_ok=True)
RES = tuple(map(int, args.res.split('x')))

PX, PY, DEPTH = 4.0, 2.0, 1.5          # pool interior half-size and depth, metres
UV0 = 20.0                              # keeps tile coordinates positive in the float pass
WHITE = 0.5                             # albedo of the "white" pass; low to limit tile-to-tile bounce error
ZONES = {'deck': 1, 'bowl': 2, 'coping': 3}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.render.resolution_x, s.render.resolution_y = RES
    s.render.resolution_percentage = 100
    s.cycles.max_bounces = 8
    s.cycles.transmission_bounces = 8
    s.cycles.transparent_max_bounces = 8
    s.cycles.caustics_reflective = False
    s.cycles.caustics_refractive = False
    s.cycles.sample_clamp_indirect = 8
    return s


class Mesh:
    """Collects quads with metre UVs and a material slot per zone/material name."""
    def __init__(self, name):
        self.name, self.bm, self.mats = name, bmesh.new(), []
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.area = {}

    def quad(self, pts, uvs, mat):
        if mat not in self.mats: self.mats.append(mat)
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self.mats.index(mat)
        for loop, uv in zip(f.loops, uvs): loop[self.uv].uv = uv
        self.area[mat] = self.area.get(mat, 0) + f.calc_area()
        return f

    def build(self, materials, smooth=False):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(materials[m])
        if smooth: me.shade_smooth()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def rect_h(m, x0, y0, x1, y1, z, mat, up=True):
    """Horizontal rectangle; UV = world xy (tiles stay aligned across faces)."""
    pts = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    if not up: pts.reverse()
    m.quad(pts, [(p[0] + UV0, p[1] + UV0) for p in pts], mat)


def rect_v(m, a, b, z0, z1, mat):
    """Vertical rectangle from a to b (xy); normal points to the left of a→b. UV = (along, z)."""
    (ax, ay), (bx, by) = a, b
    along = (lambda x, y: y) if abs(ax - bx) < 1e-9 else (lambda x, y: x)
    pts = [(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)]
    m.quad(pts, [(along(p[0], p[1]) + UV0, p[2] + UV0) for p in pts], mat)


def ring(m, inner, outer, z, mat, up=True):
    (ix0, iy0, ix1, iy1), (ox0, oy0, ox1, oy1) = inner, outer
    rect_h(m, ox0, oy0, ox1, iy0, z, mat, up); rect_h(m, ox0, iy1, ox1, oy1, z, mat, up)
    rect_h(m, ox0, iy0, ix0, iy1, z, mat, up); rect_h(m, ix1, iy0, ox1, iy1, z, mat, up)


def box(name, x0, y0, z0, x1, y1, z1, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.object; ob.name = name
    ob.scale = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = ob.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = 3
        ob.data.shade_smooth()
    ob.data.materials.append(mat)
    return ob


def node_mat(name):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def principled(name, color, rough=0.5, emission=None, strength=0.0):
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*emission, 1)
        p.inputs['Emission Strength'].default_value = strength
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def tile_material(name, roughness, water_level):
    """Tile surface whose albedo is driven by the 'albedo' value node; caustics below the waterline."""
    m, nt, out = node_mat(name)
    N, L = nt.nodes.new, nt.links.new
    p = N('ShaderNodeBsdfPrincipled'); p.inputs['Roughness'].default_value = roughness
    albedo = N('ShaderNodeValue'); albedo.name = 'albedo'
    caust = N('ShaderNodeValue'); caust.name = 'caustic'
    geo = N('ShaderNodeNewGeometry')
    sep = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], sep.inputs[0])
    under = N('ShaderNodeMath'); under.operation = 'LESS_THAN'; under.inputs[1].default_value = water_level - 0.02
    L(sep.outputs['Z'], under.inputs[0])
    noise = N('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.2
    mix = N('ShaderNodeVectorMath'); mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = (0.5, 0.5, 0.5)
    L(noise.outputs['Color'], mix.inputs[0]); L(geo.outputs['Position'], mix.inputs[2])
    vor = N('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 4.0
    L(mix.outputs[0], vor.inputs['Vector'])
    edge = N('ShaderNodeMapRange'); edge.inputs['From Min'].default_value = 0.0; edge.inputs['From Max'].default_value = 0.05
    edge.inputs['To Min'].default_value = 1.0; edge.inputs['To Max'].default_value = 0.0
    L(vor.outputs['Distance'], edge.inputs['Value'])
    pw = N('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.0; L(edge.outputs[0], pw.inputs[0])
    k = N('ShaderNodeMath'); k.operation = 'MULTIPLY'; L(pw.outputs[0], k.inputs[0]); L(under.outputs[0], k.inputs[1])
    k2 = N('ShaderNodeMath'); k2.operation = 'MULTIPLY_ADD'; L(k.outputs[0], k2.inputs[0]); L(caust.outputs[0], k2.inputs[1])
    k2.inputs[2].default_value = 1.0
    col = N('ShaderNodeMath'); col.operation = 'MULTIPLY'; L(k2.outputs[0], col.inputs[0]); L(albedo.outputs[0], col.inputs[1])
    L(col.outputs[0], p.inputs['Base Color'])
    surf = N('ShaderNodeMixShader'); surf.name = 'uvswitch'
    uvn = N('ShaderNodeUVMap'); sepuv = N('ShaderNodeSeparateXYZ'); L(uvn.outputs[0], sepuv.inputs[0])
    comb = N('ShaderNodeCombineXYZ'); L(sepuv.outputs['X'], comb.inputs['X']); L(sepuv.outputs['Y'], comb.inputs['Y'])
    comb.inputs['Z'].default_value = ZONES[name]
    em = N('ShaderNodeEmission'); L(comb.outputs[0], em.inputs['Color'])
    L(p.outputs[0], surf.inputs[1]); L(em.outputs[0], surf.inputs[2])
    L(surf.outputs[0], out.inputs['Surface'])
    return m


def water_material(uv_pass):
    m, nt, out = node_mat('water')
    N, L = nt.nodes.new, nt.links.new
    if uv_pass:
        r = N('ShaderNodeBsdfRefraction'); r.inputs['IOR'].default_value = 1.333; r.inputs['Roughness'].default_value = 0
        L(r.outputs[0], out.inputs['Surface'])
        return m
    p = N('ShaderNodeBsdfPrincipled')
    p.inputs['Transmission Weight'].default_value = 1.0
    p.inputs['Roughness'].default_value = 0.0
    p.inputs['IOR'].default_value = 1.333
    L(p.outputs[0], out.inputs['Surface'])
    v = N('ShaderNodeVolumeAbsorption')
    v.inputs['Color'].default_value = (0.42, 0.86, 0.93, 1)  # clear pool water: red absorbed first
    v.inputs['Density'].default_value = 1.3
    L(v.outputs[0], out.inputs['Volume'])
    return m


def build(variant, uv_pass):
    s = reset()
    overflow = variant == 'overflow'
    W = -0.015 if overflow else -0.14                   # water level
    band = 0.25 if overflow else 0.30                   # grate or coping width
    mats = {
        'deck': tile_material('deck', 0.55, W), 'bowl': tile_material('bowl', 0.3, W),
        'coping': tile_material('coping', 0.5, W),
        'grate': principled('grate', (0.82, 0.82, 0.8), 0.45), 'grate_slot': principled('slot', (0.02, 0.025, 0.03), 0.6),
        'concrete': principled('concrete', (0.55, 0.53, 0.5), 0.8), 'plaster': principled('plaster', (0.6, 0.57, 0.52), 0.85),
        'wood': principled('wood', (0.23, 0.14, 0.08), 0.55), 'fabric': principled('fabric', (0.72, 0.7, 0.66), 0.95),
        'cushion': principled('cushion', (0.86, 0.86, 0.84), 0.9), 'metal': principled('metal', (0.05, 0.05, 0.05), 0.35),
        'leaf': principled('leaf', (0.05, 0.13, 0.03), 0.6), 'lawn': principled('lawn', (0.06, 0.15, 0.035), 0.9),
        'glass': principled('glass', (0.02, 0.025, 0.03), 0.05, emission=(1.0, 0.72, 0.42), strength=0.0),
        'lamp': principled('lamp', (0.9, 0.9, 0.9), 0.2, emission=(1, 1, 1), strength=0.0),
        'sconce': principled('sconce', (0.9, 0.9, 0.9), 0.2, emission=(1.0, 0.75, 0.45), strength=0.0),
    }

    # --- pool bowl, step shelf in the +x/+y corner -------------------------------------------------
    b = Mesh('bowl'); F = -DEPTH
    rect_h(b, -PX, -PY, 1.0, PY, F, 'bowl'); rect_h(b, 1.0, -PY, PX, 0.4, F, 'bowl')
    treads = [(1.0, 1.4, -1.1), (1.4, 1.8, -0.75), (1.8, PX, -0.4)]
    for x0, x1, z in treads: rect_h(b, x0, 0.4, x1, PY, z, 'bowl')
    rect_v(b, (1.0, PY), (1.0, 0.4), F, -1.1, 'bowl'); rect_v(b, (1.4, PY), (1.4, 0.4), -1.1, -0.75, 'bowl')
    rect_v(b, (1.8, PY), (1.8, 0.4), -0.75, -0.4, 'bowl')
    for (x0, x1, z) in treads: rect_v(b, (x0, 0.4), (x1, 0.4), F, z, 'bowl')
    top = -0.03 if overflow else 0.0
    rect_v(b, (-PX, -PY), (PX, -PY), F, top, 'bowl'); rect_v(b, (PX, PY), (-PX, PY), F, top, 'bowl')
    rect_v(b, (-PX, PY), (-PX, -PY), F, top, 'bowl'); rect_v(b, (PX, -PY), (PX, PY), F, top, 'bowl')
    if not overflow:  # tread risers under the shelf meet the right wall above floor already handled by wall
        pass
    b.build(mats)

    # --- edge band: coping (skimmer) or overflow grate --------------------------------------------
    e = Mesh('edge')
    o = band
    if overflow:
        z = -0.035
        corners = [(-PX, -PY), (PX, -PY), (PX, PY), (-PX, PY)]
        # grate made of slats: alternating light bars and dark gaps across the band
        n = 22
        for i in range(n):
            t0, t1 = i / n * o, (i + 0.62) / n * o
            for (x0, y0, x1, y1) in [(-PX - o, -PY - t1, PX + o, -PY - t0), (-PX - o, PY + t0, PX + o, PY + t1)]:
                rect_h(e, x0, y0, x1, y1, z, 'grate')
            for (x0, y0, x1, y1) in [(-PX - t1, -PY, -PX - t0, PY), (PX + t0, -PY, PX + t1, PY)]:
                rect_h(e, x0, y0, x1, y1, z, 'grate')
        ring(e, (-PX, -PY, PX, PY), (-PX - o, -PY - o, PX + o, PY + o), z - 0.04, 'grate_slot')
        rect_v(e, (-PX - o, -PY - o), (PX + o, -PY - o), z - 0.04, 0.0, 'deck')
        rect_v(e, (PX + o, PY + o), (-PX - o, PY + o), z - 0.04, 0.0, 'deck')
        rect_v(e, (-PX - o, PY + o), (-PX - o, -PY - o), z - 0.04, 0.0, 'deck')
        rect_v(e, (PX + o, -PY - o), (PX + o, PY + o), z - 0.04, 0.0, 'deck')
    else:
        h, ov = 0.025, 0.03  # coping stands 2.5 cm proud and overhangs the wall by 3 cm
        # each side: tiles run along the edge, so UV = (along, across)
        sides = [((-PX - o, -PY - o), (PX + o, -PY + ov), 'x'), ((-PX - o, PY - ov), (PX + o, PY + o), 'x'),
                 ((-PX - o, -PY + ov), (-PX + ov, PY - ov), 'y'), ((PX - ov, -PY + ov), (PX + o, PY - ov), 'y')]
        for (x0, y0), (x1, y1), axis in sides:
            pts = [(x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h)]
            uv = [((p[0], p[1]) if axis == 'x' else (p[1], p[0])) for p in pts]
            e.quad(pts, [(u + UV0, v + UV0) for u, v in uv], 'coping')
        ix0, iy0, ix1, iy1 = -PX + ov, -PY + ov, PX - ov, PY - ov
        rect_v(e, (ix0, iy0), (ix1, iy0), -0.015, h, 'coping'); rect_v(e, (ix1, iy1), (ix0, iy1), -0.015, h, 'coping')
        rect_v(e, (ix0, iy1), (ix0, iy0), -0.015, h, 'coping'); rect_v(e, (ix1, iy0), (ix1, iy1), -0.015, h, 'coping')
        ring(e, (ix0, iy0, ix1, iy1), (-PX, -PY, PX, PY), -0.015, 'coping', up=False)
        ox0, oy0, ox1, oy1 = -PX - o, -PY - o, PX + o, PY + o
        rect_v(e, (ox0, oy0), (ox1, oy0), 0, h, 'coping'); rect_v(e, (ox1, oy1), (ox0, oy1), 0, h, 'coping')
        rect_v(e, (ox0, oy1), (ox0, oy0), 0, h, 'coping'); rect_v(e, (ox1, oy0), (ox1, oy1), 0, h, 'coping')
    e.build(mats)

    # --- deck ring ----------------------------------------------------------------------------------
    d = Mesh('deck'); DX0, DX1, DY0, DY1 = -10.5, 9.0, -9.0, 6.0
    ix0, ix1, iy0, iy1 = -PX - o, PX + o, -PY - o, PY + o
    ring(d, (ix0, iy0, ix1, iy1), (DX0, DY0, DX1, DY1), 0, 'deck')
    rect_v(d, (DX0, DY0), (DX1, DY0), -0.3, 0, 'deck'); rect_v(d, (DX0, DY1), (DX0, DY0), -0.3, 0, 'deck')
    d.build(mats)
    g = Mesh('lawn'); ring(g, (DX0, DY0, DX1, DY1), (-40, -40, 40, 40), -0.3, 'lawn'); g.build(mats)

    # --- water: closed volume, top face rippled; sides sit just behind the bowl walls ----------------
    reach = o * 0.45 if overflow else 0.02
    wx, wy = PX + reach, PY + reach
    wm = bmesh.new()
    nx, ny = 200, 100
    grid = [[wm.verts.new((-wx + 2 * wx * i / nx, -wy + 2 * wy * j / ny, W)) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx): wm.faces.new([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]])
    waves = [(1.6, 0.3, 0.0040, 0.0), (0.9, 1.9, 0.0030, 1.3), (0.55, -0.8, 0.0018, 2.1), (0.33, 2.6, 0.0012, 0.7),
             (0.21, 1.1, 0.0007, 4.0), (0.13, -2.2, 0.0004, 5.5)]
    for row in grid:
        for v in row:
            v.co.z = W + sum(a * math.sin((v.co.x * math.cos(t) + v.co.y * math.sin(t)) * 2 * math.pi / lam + ph)
                             for lam, t, a, ph in waves)
    bottom = [wm.verts.new((x, y, F - 0.05)) for x, y in [(-wx, -wy), (wx, -wy), (wx, wy), (-wx, wy)]]
    wm.faces.new(list(reversed(bottom)))
    edges = [[grid[0][i] for i in range(nx + 1)], [grid[j][nx] for j in range(ny + 1)],
             [grid[ny][i] for i in range(nx, -1, -1)], [grid[j][0] for j in range(ny, -1, -1)]]
    for k, chain in enumerate(edges):
        b0, b1 = bottom[k], bottom[(k + 1) % 4]
        wm.faces.new([b0, b1] + list(reversed(chain)))
    # winding above already faces outward (top +z, sides out); recalc flips it on the wavy n-gons
    wme = bpy.data.meshes.new('water'); wm.to_mesh(wme); wm.free(); wme.shade_smooth()
    water = bpy.data.objects.new('water', wme); s.collection.objects.link(water)
    wme.materials.append(water_material(uv_pass))
    water.visible_shadow = False  # sun reaches the floor; caustics are drawn in the tile shader instead

    # --- surroundings -------------------------------------------------------------------------------
    box('house', -12, 6.0, 0, 12, 9.5, 4.2, mats['plaster'])
    for k, x in enumerate([-8.5, -4.5, -0.5, 3.5]):
        box(f'window{k}', x, 5.98, 0.05, x + 3.4, 6.02, 3.0, mats['glass'])
    box('roof', -12, 3.2, 3.6, 12, 9.5, 3.9, mats['plaster'])
    for k, x in enumerate([-11.6 + i * 0.55 for i in range(43)]):
        box(f'slat{k}', x, 3.2, 3.42, x + 0.12, 6.0, 3.6, mats['wood'])
    for k, x in enumerate([-11.8, 11.6]):
        box(f'col{k}', x, 3.2, 0, x + 0.2, 3.4, 3.6, mats['plaster'])
    for k, x in enumerate([-7.2, -5.6]):  # loungers
        box(f'lf{k}', x, 3.2, 0.0, x + 0.75, 5.3, 0.28, mats['wood'], bevel=0.02)
        box(f'lc{k}', x + 0.04, 3.25, 0.28, x + 0.71, 4.6, 0.38, mats['cushion'], bevel=0.04)
        bk = box(f'lb{k}', x + 0.04, 4.55, 0.28, x + 0.71, 5.25, 0.38, mats['cushion'], bevel=0.04)
        bk.rotation_euler.x = math.radians(38); bk.location.z += 0.25
    box('sofa_a', 3.3, 3.6, 0, 8.3, 4.5, 0.42, mats['fabric'], bevel=0.06)
    box('sofa_b', 7.4, -0.6, 0, 8.3, 3.6, 0.42, mats['fabric'], bevel=0.06)
    box('sofa_back', 3.3, 4.3, 0.42, 8.3, 4.6, 0.78, mats['fabric'], bevel=0.06)
    box('sofa_back2', 8.0, -0.6, 0.42, 8.3, 4.3, 0.78, mats['fabric'], bevel=0.06)
    box('table', 5.0, 1.6, 0, 6.6, 2.6, 0.32, mats['wood'], bevel=0.02)
    for k, (x, y) in enumerate([(-9.6, -2.6), (-9.6, 1.4), (7.9, -7.9), (-2.0, -8.4)]):
        box(f'planter{k}', x, y, 0, x + 0.9, y + 0.9, 0.7, mats['concrete'], bevel=0.01)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.62, location=(x + 0.45, y + 0.45, 1.05))
        bush = bpy.context.object; bush.data.materials.append(mats['leaf']); bush.data.shade_smooth()
        tex = bpy.data.textures.new(f'bt{k}', 'CLOUDS'); tex.noise_scale = 0.18
        dm = bush.modifiers.new('d', 'DISPLACE'); dm.texture = tex; dm.strength = 0.35
    for k, (x, y) in enumerate([(-6.0, 5.95), (-2.0, 5.95), (2.0, 5.95), (6.0, 5.95)]):
        box(f'sconce{k}', x - 0.08, y - 0.08, 2.2, x + 0.08, y, 2.45, mats['sconce'])
    pool_lamps = []
    for k, x in enumerate([-2.6, 0.0, 2.6]):  # underwater lamps on the near long wall
        box(f'lampfx{k}', x - 0.12, -PY - 0.005, -0.62, x + 0.12, -PY + 0.012, -0.38, mats['lamp'])
        L = bpy.data.lights.new(f'pool{k}', 'POINT'); L.energy = 180; L.shadow_soft_size = 0.1
        lo = bpy.data.objects.new(f'pool{k}', L); lo.location = (x, -PY + 0.12, -0.5); s.collection.objects.link(lo)
        pool_lamps.append(lo)
    for k, (x, y) in enumerate([(-6.0, 5.6), (-2.0, 5.6), (2.0, 5.6), (6.0, 5.6)]):
        L = bpy.data.lights.new(f'wall{k}', 'SPOT'); L.energy = 120; L.spot_size = math.radians(110); L.color = (1, 0.75, 0.45)
        lo = bpy.data.objects.new(f'wall{k}', L); lo.location = (x, y, 2.3); lo.rotation_euler = (math.radians(0), 0, 0)
        s.collection.objects.link(lo); pool_lamps.append(lo)
    for k, x in enumerate([-8.5, -4.5, -0.5, 3.5]):  # interior glow seen through the glazing
        L = bpy.data.lights.new(f'room{k}', 'AREA'); L.energy = 260; L.size = 3.0; L.color = (1, 0.72, 0.42)
        lo = bpy.data.objects.new(f'room{k}', L); lo.location = (x + 1.7, 6.3, 1.6); lo.rotation_euler = (math.radians(-90), 0, 0)
        s.collection.objects.link(lo); pool_lamps.append(lo)

    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.2; sun.angle = math.radians(0.6); sun.color = (1, 0.95, 0.88)
    so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(40), 0, math.radians(90))  # light travels to -x: shadows fall left, pool stays sunlit
    s.collection.objects.link(so)
    w = bpy.data.worlds.new('world'); s.world = w
    nt = w.node_tree; nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_disc = False
    sky.sun_elevation = math.radians(48); sky.sun_rotation = math.radians(62)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.name = 'bg'; bg.inputs['Strength'].default_value = 0.35
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], nt.nodes.new('ShaderNodeOutputWorld').inputs['Surface'])

    cam = bpy.data.cameras.new('cam'); cam.lens = 24; cam.sensor_width = 36
    co = bpy.data.objects.new('cam', cam); s.collection.objects.link(co); s.camera = co
    co.location = Vector((-4.6, -7.4, 6.9))
    co.rotation_euler = (Vector((0.9, 0.5, -0.9)) - co.location).to_track_quat('-Z', 'Y').to_euler()

    lights = {'sun': [so], 'pool': [o for o in pool_lamps if o.name.startswith('pool')],
              'house': [o for o in pool_lamps if not o.name.startswith('pool')]}
    geometry = {
        'pool': {'length': 2 * PX, 'width': 2 * PY, 'depth': DEPTH, 'waterLevel': W, 'type': variant},
        'areas': {'bowl': round(b.area.get('bowl', 0), 2), 'deck': round(d.area.get('deck', 0), 2),
                  'coping': round(e.area.get('coping', 0), 2) if not overflow else 0,
                  'copingLength': round(2 * (2 * PX + 2 * PY) + 8 * o, 2) if not overflow else 0},
    }
    return s, mats, lights, geometry


def configure(s, mats, lights, mode, group):
    tiles = [mats[k] for k in ZONES]
    for m in tiles:
        m.node_tree.nodes['uvswitch'].inputs[0].default_value = 1.0 if mode == 'uv' else 0.0
        m.node_tree.nodes['albedo'].outputs[0].default_value = WHITE if mode == 'white' else 0.0
        m.node_tree.nodes['caustic'].outputs[0].default_value = 0.75 if group == 'sun' else 0.0
    for name, objs in lights.items():
        for o in objs: o.hide_render = mode == 'uv' or name != group
    s.world.node_tree.nodes['bg'].inputs['Strength'].default_value = 0.35 if (mode != 'uv' and group == 'sun') else 0.0
    emit = {'glass': 1.0 if group == 'house' else 0, 'sconce': 30 if group == 'house' else 0, 'lamp': 60 if group == 'pool' else 0}
    for k, v in emit.items():
        mats[k].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0 if mode == 'uv' else v
    if mode == 'uv':  # everything that is not tile shows as zone 0
        for k, m in mats.items():
            if k in ZONES or k == 'water': continue
            p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (0, 0, 0, 1)
            p.inputs['Specular IOR Level'].default_value = 0; p.inputs['Emission Strength'].default_value = 0
    c = s.cycles
    c.samples = 6 if mode == 'uv' else args.samples
    c.use_denoising = mode != 'uv'
    if mode != 'uv': c.denoiser = 'OPENIMAGEDENOISE'
    c.use_adaptive_sampling = mode != 'uv'
    c.filter_width = 0.01 if mode == 'uv' else 1.2
    c.pixel_filter_type = 'BOX' if mode == 'uv' else 'BLACKMAN_HARRIS'
    st = s.render.image_settings
    st.file_format = 'OPEN_EXR'; st.color_depth = '32' if mode == 'uv' else '16'; st.exr_codec = 'ZIP'


meta = {}
for variant in args.variants.split(','):
    for mode in args.passes.split(','):
        groups = ['-'] if mode == 'uv' else args.groups.split(',')
        s, mats, lights, geometry = build(variant, mode == 'uv')
        meta[variant] = geometry
        for group in groups:
            configure(s, mats, lights, mode, group)
            path = os.path.join(args.out, f'{variant}-{mode}' + ('' if mode == 'uv' else f'-{group}') + '.exr')
            s.render.filepath = path
            bpy.ops.render.render(write_still=True)
            print('wrote', path, flush=True)
with open(os.path.join(args.out, 'scene.json'), 'w') as f:
    json.dump({'resolution': RES, 'white': WHITE, 'uvOffset': UV0, 'variants': meta}, f, indent=2)
