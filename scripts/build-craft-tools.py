"""Editable, metre-scale working tools. Run with Blender --background --python.

Profiles encode construction: hollow coiled vat, rolled rim and attached lugs;
drawn bamboo barrel and bundled tapered brush hairs; forged, honed iron strip;
wire-cut, folded clay billets. No random surface noise is used as geometry.
Source texture appearance is assigned in the Web material library.
"""
import bpy, bmesh, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, rough=.8, metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    return m

bamboo=mat('craft_bamboo',(.39,.26,.11),.65)
hair=mat('brush_animal_hair',(.21,.15,.09),.88)
ink=mat('brush_wet_point',(.018,.026,.026),.36)
iron=mat('craft_forged_iron',(.16,.17,.16),.64,1)
edge=mat('honed_cutting_edge',(.38,.39,.37),.29,1)
clay=mat('craft_wet_kaolin',(.29,.30,.26),.65)
stone=mat('craft_coiled_stoneware',(.29,.20,.125),.9)
thread=mat('craft_fiber_binding',(.27,.21,.12),.95)

def empty(name):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); return o

def mesh(name, verts, faces, material, parent, uv=None, bevel=0):
    # Authoring coordinates match the Three.js y-up scene.
    me=bpy.data.meshes.new(name)
    me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); me.update()
    bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.parent=parent
    me.materials.append(material)
    layer=me.uv_layers.new(name='SurfaceUV')
    for p in me.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            v=me.loops[li].vertex_index
            layer.data[li].uv=uv[v] if uv else (verts[v][0]*4,verts[v][2]*4)
    if bevel:
        b=o.modifiers.new('Forged edge radius','BEVEL'); b.width=bevel; b.segments=3
        b.limit_method='ANGLE'; b.angle_limit=.3
    return o

def lathe(name, profile, material, parent, n=128, axis='y', offset=(0,0,0), coil=False):
    verts=[]; uv=[]; faces=[]
    for j,(r,h) in enumerate(profile):
        for i in range(n+1):
            a=2*math.pi*i/n
            # Coils are tied to a 22mm hand-building course, not arbitrary noise.
            rr=r+(math.sin(h/.022*2*math.pi)*.00065 if coil and r>.02 else 0)
            x=rr*math.cos(a); z=rr*math.sin(a)
            p=(x,h,z) if axis=='y' else (x,z,h)
            verts.append(tuple(p[k]+offset[k] for k in range(3)))
            uv.append((i/n,h/.42))
    for j in range(len(profile)-1):
        for i in range(n):
            a=j*(n+1)+i; faces.append((a,a+1,a+n+2,a+n+1))
    return mesh(name,verts,faces,material,parent,uv)

def tube(name, points, radius, material, parent, sides=8, taper=False):
    verts=[]; uv=[]; faces=[]
    for j,p in enumerate(points):
        tangent=Vector(points[min(len(points)-1,j+1)])-Vector(points[max(0,j-1)])
        tangent.normalize(); normal=tangent.cross(Vector((0,1,0)))
        if normal.length<.01: normal=tangent.cross(Vector((1,0,0)))
        normal.normalize(); binormal=tangent.cross(normal)
        r=radius*(1-.96*j/(len(points)-1)) if taper else radius
        for i in range(sides+1):
            a=2*math.pi*i/sides; v=Vector(p)+(normal*math.cos(a)+binormal*math.sin(a))*r
            verts.append(tuple(v)); uv.append((i/sides,j/max(1,len(points)-1)))
    for j in range(len(points)-1):
        for i in range(sides):
            a=j*(sides+1)+i; faces.append((a,a+1,a+sides+2,a+sides+1))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(points)-1)*(sides+1)+i for i in range(sides)))
    return mesh(name,verts,faces,material,parent,uv)

# Brush origin is at its balance point; the wet tip is local -Z.
brush=empty('brush')
profile=[(0,.133),(.0035,.133),(.0048,.129)]
profile += [(.0058-.0011*t/60, .126-.226*t/60) for t in range(61)]
profile += [(.0047,-.101),(.0045,-.102),(0,-.102)]
lathe('bamboo_barrel',profile,bamboo,brush,96,'z')
lathe('bamboo_node',[(.0049,.061),(.0055,.062),(.0058,.064),(.0055,.066),(.0049,.067)],bamboo,brush,96,'z')
for turn in range(8):
    z=-.098+turn*.0008
    tube('brush_binding_%02d'%turn,[(.0049*math.cos(a),.0049*math.sin(a),z) for a in [2*math.pi*i/72 for i in range(73)]],.00046,thread,brush,6)
lathe('bundled_brush_core',[(.0046*(1-t/80)**.58,-.102-.046*t/80) for t in range(81)],hair,brush,96,'z')
for i in range(160):
    a=i*math.pi*(3-math.sqrt(5)); r=.0046*math.sqrt((i+.5)/160)
    points=[]
    for j in range(19):
        t=j/18; spread=(1-t)**.62
        points.append((r*math.cos(a)*spread+.0012*t*t,r*math.sin(a)*spread,-.102-.047*t))
    tube('brush_hair_%03d'%i,points,.00010,ink if i%3 else hair,brush,4,True)

# Traditional all-iron trimming blade: wide working toe, thin honed bevel.
knife=empty('knife')
sections=[(.125,.0055,.0018,0),(.10,.006,.0018,0),(.04,.0065,.0018,0),(-.025,.008,.0017,-.002),(-.064,.014,.0016,-.005),(-.105,.022,.00135,-.008),(-.151,.024,.00065,-.009),(-.166,.021,.00018,-.009)]
verts=[]; uvs=[]; faces=[]
for j,(z,w,t,y) in enumerate(sections):
    for x,dy in [(-w,-t),(w,-t),(w,t),(-w,t)]:
        verts.append((x,y+dy,z)); uvs.append(((x+.025)/.05,(z+.17)/.3))
for j in range(len(sections)-1):
    for i in range(4): faces.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
faces.extend([(3,2,1,0),(28,29,30,31)])
o=mesh('forged_trimming_knife',verts,faces,iron,knife,uvs,.00055)
o.data.materials.append(edge)
for p in o.data.polygons:
    if p.index>=24: p.material_index=1

vat=empty('glaze_vat')
profile=[(0,.012),(.13,.012),(.222,.012),(.235,.018)]
for i in range(101):
    t=i/100; profile.append((.235+.057*math.sin(t*math.pi*.63),.025+.325*t))
# Rolled lip seamlessly joins the outside and inner wall.
for i in range(33):
    a=math.pi*i/32; profile.append((.281+.012*math.cos(a),.350+.012*math.sin(a)))
for i in range(101):
    t=1-i/100; profile.append((.213+.056*math.sin(t*math.pi*.63),.04+.31*t))
profile.extend([(.19,.035),(.10,.034),(0,.034)])
lathe('hollow_glaze_vat',profile,stone,vat,192,coil=True)
for side in [-1,1]:
    points=[]
    for i in range(49):
        a=math.pi*i/48
        points.append((side*(.273+.065*math.sin(a)),.265+.047*math.cos(a),0))
    tube('coiled_lug_handle',points,.018,stone,vat,16)

clayroot=empty('supply_clay')
for k,(cx,cz,length,width,angle) in enumerate([(-.09,.025,.27,.15,-.22),(.11,-.035,.25,.14,.36)]):
    verts=[]; uv=[]; faces=[]; n=128; rings=65
    for j in range(rings):
        t=j/(rings-1); z=(t-.5)*length
        end=1-.075*abs(2*t-1)**8
        for i in range(n+1):
            a=2*math.pi*i/n
            # Squared billet with rounded cut corners and a deliberate folding ridge.
            x=math.copysign(abs(math.cos(a))**.48,math.cos(a))*width*.5*end
            yy=math.copysign(abs(math.sin(a))**.58,math.sin(a))*.055*end
            seam=.008*math.exp(-((t-.56)/.075)**2)*max(0,math.sin(a))**6
            y=.061+yy+seam-.006*math.cos(a)**2*(1-(2*t-1)**2)
            verts.append((cx+x*math.cos(angle)+z*math.sin(angle),y,cz+z*math.cos(angle)-x*math.sin(angle)))
            uv.append((i/n*1.3,t*.8))
    for j in range(rings-1):
        for i in range(n):
            a=j*(n+1)+i; faces.append((a,a+1,a+n+2,a+n+1))
    # Flat wire-cut end caps, subdivided into concentric rings for smooth contact shading.
    for j in [0,rings-1]:
        center=Vector((0,0,0))
        for i in range(n): center+=Vector(verts[j*(n+1)+i])/n
        idx=len(verts); verts.append(tuple(center)); uv.append((.5,.5))
        for i in range(n): faces.append((idx,j*(n+1)+i,j*(n+1)+i+1))
    mesh('folded_clay_billet_%d'%k,verts,faces,clay,clayroot,uv)

for obj in bpy.context.scene.objects:
    if obj.type=='MESH':
        for mod in list(obj.modifiers):
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
# Batch connected fibres by material while keeping each tool an independent root.
for root in [brush,knife,vat,clayroot]:
    groups={}
    for o in list(root.children):
        if o.type=='MESH': groups.setdefault(o.data.materials[0].name,[]).append(o)
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1: bpy.ops.object.join()
        objects[0].name=root.name+'_'+name
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/craft-tools.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/craft-tools.glb'),export_format='GLB',export_yup=True,export_animations=False)
print('CRAFT_TOOLS_COMPLETE')
