"""Bake a rigged/animated glTF into 2D sprite frames at the D2 overhead angle.

Run headless via Blender:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/bake_sprites.py -- \
      <glb> <outdir> <res> <nframes> <ndirs>

Renders an orthographic ~30-degree-elevation view, transparent background, low-res
(retro). With ndirs>1 the camera orbits to produce directional frames. Output:
  <outdir>/dir<d>_<frame>.png
"""
import bpy, sys, os, math, mathutils

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB = argv[0]
OUT = argv[1]
RES = int(argv[2]) if len(argv) > 2 else 128
NFR = int(argv[3]) if len(argv) > 3 else 10
NDIR = int(argv[4]) if len(argv) > 4 else 1
os.makedirs(OUT, exist_ok=True)

# --- clean scene ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# --- import the model ---
try:
    bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
except Exception:
    pass
bpy.ops.import_scene.gltf(filepath=GLB)
bpy.context.view_layer.update()

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)

# Drop helper/junk meshes (Meshy ships a stray unit 'Icosphere' that blows up the
# bbox and shrinks the character). Keep only skinned character meshes when present.
def _is_char(o):
    return any(m.type == 'ARMATURE' for m in o.modifiers) or len(o.vertex_groups) > 0
_chars = [o for o in meshes if _is_char(o)]
if _chars and len(_chars) < len(meshes):
    for o in list(meshes):
        if o not in _chars:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = _chars
    print("dropped non-character meshes; kept:", [o.name for o in meshes])

# --- animation frame range (so we frame the POSED mesh, not the wide T-pose) ---
_af0, _af1 = 1, 1
if arm and arm.animation_data and arm.animation_data.action:
    _fr = arm.animation_data.action.frame_range
    _af0, _af1 = int(round(_fr[0])), int(round(_fr[1]))
_samples = sorted(set(int(round(_af0 + (_af1 - _af0) * i / 4.0)) for i in range(5))) if _af1 > _af0 else [_af0]

# --- world-space bbox from the DEFORMED mesh, max extent over the walk cycle ---
mn = mathutils.Vector((1e9, 1e9, 1e9))
mx = mathutils.Vector((-1e9, -1e9, -1e9))
for _fr in _samples:
    bpy.context.scene.frame_set(_fr)
    deps = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        oe = o.evaluated_get(deps)
        me = oe.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            mn = mathutils.Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = mathutils.Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
        oe.to_mesh_clear()
center = (mn + mx) / 2.0
size = mx - mn
diag = size.length

# --- camera (orthographic, D2 three-quarter overhead) ---
target = bpy.data.objects.new("target", None)
bpy.context.scene.collection.objects.link(target)
target.location = center

cam_data = bpy.data.cameras.new("cam")
cam_data.type = 'ORTHO'
_E = math.radians(32)
_h = size.z
_w = max(size.x, size.y)
cam_data.ortho_scale = max(_w, _h * math.cos(_E) + _w * math.sin(_E)) * 1.12  # fill the frame at the angled view
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
con = cam.constraints.new('TRACK_TO')
con.target = target
con.track_axis = 'TRACK_NEGATIVE_Z'
con.up_axis = 'UP_Y'

ELEV = math.radians(32)   # D2-ish downward tilt
R = diag * 3 + 5

def place_camera(d):
    az = 2 * math.pi * d / NDIR
    horiz = math.cos(ELEV) * R
    cam.location = center + mathutils.Vector((horiz * math.sin(az), -horiz * math.cos(az), math.sin(ELEV) * R))

# --- lighting ---
sun_d = bpy.data.lights.new("sun", 'SUN'); sun_d.energy = 4.0
sun = bpy.data.objects.new("sun", sun_d); bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(55), 0, math.radians(40))
world = bpy.data.worlds.new("w"); bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.5

# --- render settings ---
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 16
sc.render.film_transparent = True
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'

# --- animation frame range ---
f0, f1 = 1, 1
if arm and arm.animation_data and arm.animation_data.action:
    fr = arm.animation_data.action.frame_range
    f0, f1 = int(round(fr[0])), int(round(fr[1]))
frames = [int(round(f0 + (f1 - f0) * i / max(1, NFR))) for i in range(NFR)] if f1 > f0 else [f0]
print("anim frames %d..%d, sampling %d -> %s" % (f0, f1, len(frames), frames))

# --- render ---
n = 0
for d in range(NDIR):
    place_camera(d)
    for i, f in enumerate(frames):
        sc.frame_set(f)
        sc.render.filepath = os.path.join(OUT, "dir%d_%02d" % (d, i))
        bpy.ops.render.render(write_still=True)
        n += 1
print("baked %d frames to %s" % (n, OUT))
