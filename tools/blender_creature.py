# Blender bpy script — PIPELINE-PROOF placeholder creature for Deepgilt.
# Builds an ORIGINAL primitive-based "Gravelight Horror" (floating orb-wisp: emissive core +
# orbiting energy orbs + downward energy tether), renders it at the D2 iso angle in 16 directions
# x N frames (idle/walk/attack) to client/art/blender_gen/gravelight/, transparent 256x256 PNGs
# named to match the LoP convention so tools/crop_lop_frames.py + LopAnim consume it unchanged.
#
# NOT derived from Lords of Pain — 100% generated geometry/materials here, so it's committable.
# Run:  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender_creature.py -- [--test]
import bpy, os, math, sys, mathutils

ARGS = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
TEST = "--test" in ARGS
ROOT = os.path.join(os.path.dirname(os.path.abspath(bpy.data.filepath)) or ".", "")
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "client", "art", "blender_gen", "gravelight"))
CHAR = "gravelight"

# LoP 16 directions: name + angle (E=0, CCW)
DIRS = [("E",0),("NEE",22.5),("NE",45),("NNE",67.5),("N",90),("NNW",112.5),("NW",135),("NWW",157.5),
        ("W",180),("SWW",202.5),("SW",225),("SSW",247.5),("S",270),("SSE",292.5),("SE",315),("SEE",337.5)]
ANIMS = {"idle":1, "walk":6, "attack":4}   # game-mode -> frame count

# ---------------------------------------------------------------- scene reset
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def emat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0]*0.3, color[1]*0.3, color[2]*0.3, 1)
    if "Emission Color" in bsdf.inputs: bsdf.inputs["Emission Color"].default_value = (color[0],color[1],color[2],1)
    if "Emission Strength" in bsdf.inputs: bsdf.inputs["Emission Strength"].default_value = strength
    return m

def sphere(r, loc, mat, subd=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subd, radius=r, location=loc)
    o = bpy.context.active_object; o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def build():
    reset()
    root = bpy.data.objects.new("root", None); bpy.context.collection.objects.link(root)
    core_m = emat("core", (0.45, 0.20, 0.65), 2.2)     # dark violet core (galv)
    orb_m  = emat("orb",  (0.55, 0.85, 1.0), 6.0)      # bright cyan-violet energy orbs
    tail_m = emat("tail", (0.40, 0.55, 0.95), 3.0)
    core = sphere(0.50, (0,0,1.15), core_m, 3); core.parent = root
    core.name = "core"
    # downward energy tether (cone, point at ground) -> gives a natural ground-contact anchor
    bpy.ops.mesh.primitive_cone_add(radius1=0.22, radius2=0.0, depth=1.05, location=(0,0,0.45))
    tail = bpy.context.active_object; tail.rotation_euler[0] = math.pi  # point down
    tail.data.materials.append(tail_m); tail.parent = root; tail.name = "tail"
    orbs = []
    for i in range(3):
        o = sphere(0.13, (0,0,1.15), orb_m, 2); o.parent = root; o.name = "orb%d"%i; orbs.append(o)
    return root, core, orbs

# ---------------------------------------------------------------- camera + light + render
def setup_render():
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x = 256; scn.render.resolution_y = 256
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = "PNG"; scn.render.image_settings.color_mode = "RGBA"
    # ortho iso camera: 2:1 dimetric -> elevation atan(0.5)=26.57deg, azimuth 45 (SE-ish, fixed; model rotates)
    cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 4.2
    cam = bpy.data.objects.new("cam", cam_data); bpy.context.collection.objects.link(cam)
    elev = math.radians(26.57)
    cam.rotation_euler = (math.radians(90)-elev, 0, math.radians(45))
    R = 12
    cam.location = (R*math.cos(elev)*math.sin(math.radians(45)), -R*math.cos(elev)*math.cos(math.radians(45)), R*math.sin(elev))
    cam.location = (cam.location[0], cam.location[1], cam.location[2])
    scn.camera = cam
    # lighting: dim grimy key from top, low fill
    key = bpy.data.lights.new("key","SUN"); key.energy = 2.0; key.color=(0.8,0.82,0.95)
    ko = bpy.data.objects.new("key",key); bpy.context.collection.objects.link(ko)
    ko.rotation_euler = (math.radians(35),0,math.radians(30))
    scn.world = bpy.data.worlds.new("w"); scn.world.use_nodes=True
    bg = scn.world.node_tree.nodes.get("Background")
    if bg: bg.inputs[0].default_value=(0.02,0.02,0.03,1); bg.inputs[1].default_value=0.15

# ---------------------------------------------------------------- pose per (anim,frame)
def pose(core, orbs, anim, f, nf):
    t = f/float(max(1,nf))
    bob = 0.0; spin = 0.0; orad = 0.62; cscale = 1.0
    if anim == "walk":  bob = 0.12*math.sin(t*2*math.pi); spin = t*2*math.pi
    elif anim == "attack":
        spin = t*1.3*math.pi; orad = 0.62 + 0.9*math.sin(t*math.pi)   # orbs flare out
        cscale = 1.0 + 0.35*math.sin(t*math.pi)
    core.location = (0,0,1.15+bob); core.scale = (cscale,cscale,cscale)
    for i,o in enumerate(orbs):
        a = spin + i*(2*math.pi/3)
        o.location = (orad*math.cos(a), orad*math.sin(a), 1.15+bob+0.05*math.sin(a*2))

# ---------------------------------------------------------------- render all
def render_all():
    root, core, orbs = build(); setup_render()
    scn = bpy.context.scene
    dirs = DIRS[:1] if TEST else DIRS
    anims = {"walk":1} if TEST else ANIMS
    for anim, nf in anims.items():
        for f in range(nf):
            pose(core, orbs, anim, f, nf)
            for (dname, dang) in dirs:
                root.rotation_euler = (0,0,math.radians(dang))
                fn = "%s_default_%s_%s_%.1f_%d.png" % (CHAR, anim, dname, dang, f)
                scn.render.filepath = os.path.join(OUT, "%s_default_%s"%(CHAR,anim), dname, fn)
                bpy.ops.render.render(write_still=True)
    print("RENDER_DONE out=%s test=%s" % (OUT, TEST))

render_all()
