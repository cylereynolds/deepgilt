"""Bake a flat ground texture into a depth-shaded 2.5D ground tile.

Drives real geometric displacement from the source texture's own luminance
(painted ruts / puddles / stones become recessed/raised), lights it with a
soft angled sun so the relief self-shadows, and renders top-down. The result
reads with real surface depth instead of a flat decal.

  Blender -b -P tools/bake_ground.py -- <src.png> <out.png> [res] [strength]
"""
import bpy, sys, math

a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC, OUT = a[0], a[1]
RES = int(a[2]) if len(a) > 2 else 1024
STR = float(a[3]) if len(a) > 3 else 0.16

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()

# high-res grid so displacement has geometry to push
bpy.ops.mesh.primitive_grid_add(x_subdivisions=400, y_subdivisions=400, size=2)
plane = bpy.context.active_object
bpy.ops.object.shade_smooth()

img = bpy.data.images.load(SRC)

# displacement = the texture's own relief (dark painted lows recess, lights raise)
dtex = bpy.data.textures.new('disp', 'IMAGE'); dtex.image = img
dm = plane.modifiers.new('disp', 'DISPLACE')
dm.texture = dtex; dm.texture_coords = 'UV'; dm.strength = STR; dm.mid_level = 0.5

# matte-wet material, base colour straight from the source
mat = bpy.data.materials.new('g'); mat.use_nodes = True
plane.data.materials.append(mat)
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.5

# top-down orthographic framing of the 2x2 plane
cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 2.0
co = bpy.data.objects.new('c', cd); bpy.context.scene.collection.objects.link(co)
co.location = (0, 0, 4); co.rotation_euler = (0, 0, 0)
bpy.context.scene.camera = co

# soft angled key light reveals the relief; bright ambient keeps it readable
sd = bpy.data.lights.new('s', 'SUN'); sd.energy = 2.6; sd.angle = math.radians(10)
so = bpy.data.objects.new('s', sd); bpy.context.scene.collection.objects.link(so)
so.rotation_euler = (math.radians(48), 0, math.radians(40))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[1].default_value = 0.5

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 96
sc.render.resolution_x = RES; sc.render.resolution_y = RES
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('baked', OUT)
