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

def tube(name, points, radius, material, parent, sides=8, taper=False, metric_uv=False):
    verts=[]; uv=[]; faces=[]
    arc=0
    for j,p in enumerate(points):
        if j:arc+=(Vector(p)-Vector(points[j-1])).length
        tangent=Vector(points[min(len(points)-1,j+1)])-Vector(points[max(0,j-1)])
        tangent.normalize(); normal=Vector((0,0,1)) if metric_uv else tangent.cross(Vector((0,1,0)))
        if normal.length<.01: normal=tangent.cross(Vector((1,0,0)))
        normal.normalize(); binormal=tangent.cross(normal)
        r=radius*(1-.96*j/(len(points)-1)) if taper else radius
        for i in range(sides+1):
            a=2*math.pi*i/sides; v=Vector(p)+(normal*math.cos(a)+binormal*math.sin(a))*r
            verts.append(tuple(v)); uv.append((i/sides*math.tau*radius/.2,arc/.2) if metric_uv else (i/sides,j/max(1,len(points)-1)))
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
profile=[(0,.008),(.13,.008),(.217,.008)]
# Rounded bearing foot, wall, rolled lip, inner wall and 30mm floor form one
# continuous closed section. The old profile had steps where the lip joined.
for i in range(17):
    a=-math.pi/2+math.pi/2*i/16
    profile.append((.217+.016*math.cos(a),.024+.016*math.sin(a)))
def vat_radius(h):
    t=(h-.024)/.326
    return .233+.055*math.sin(t*math.pi*.5)
for i in range(1,163):
    h=.024+.326*i/162; profile.append((vat_radius(h),h))
for i in range(1,49):
    a=math.pi*i/48; profile.append((.276+.012*math.cos(a),.350+.012*math.sin(a)))
for i in range(1,159):
    h=.350-.304*i/158; profile.append((vat_radius(h)-.024,h))
profile.extend([(.209,.039),(.204,.037),(.19,.038),(.10,.038),(0,.038)])
vat_shell=lathe('hollow_glaze_vat',profile,stone,vat,256)
# Compress the visible coil joints by paddling: broad, interrupted tool courses,
# not identical corrugations. A two-lobed drying oval is largest at the unsupported
# lip; the foot remains flat. Every perturbation has a construction cause.
for v in vat_shell.data.vertices:
    x,z,h=v.co.x,-v.co.y,v.co.z; r=math.hypot(x,z); a=math.atan2(z,x)
    if r<.02:continue
    course=.00022*math.sin(h/.027*math.tau+.18*math.sin(a*3))
    course*=max(0,min(1,(h-.04)/.08))*max(0,min(1,(.35-h)/.025))
    oval=.0022*(h/.362)**2*math.cos(2*a+.4)
    rr=r+course+oval
    v.co.x=rr*math.cos(a);v.co.y=-rr*math.sin(a)
    if h>.1:v.co.z+=.0009*((h-.1)/.262)**2*math.sin(3*a+.3)
lug_material=stone.copy();lug_material.name='vat_lug_uv_selection'
vat_shell.data.materials.append(lug_material)
for side in [-1,1]:
    points=[]
    for i in range(49):
        a=math.pi*i/48
        points.append((side*(.278+.065*math.sin(a)),.265+.047*math.cos(a),0))
    lug=tube('coiled_lug_handle',points,.018,lug_material,vat,32,metric_uv=True)
    lug.data.materials.clear();lug.data.materials.append(stone);lug.data.materials.append(lug_material)
    for face in lug.data.polygons:face.material_index=1

# Form actual clay joins at the lug roots. Exact booleans preserve the dense shell
# and circular handle section; only the intersection gets a small tooling fillet.
for ob in vat.children:
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(ob.data);bm.free()
for handle in [o for o in list(vat.children) if o is not vat_shell]:
    bpy.context.view_layer.objects.active=vat_shell
    join=vat_shell.modifiers.new('Scored slip joined lug','BOOLEAN')
    join.operation='UNION';join.solver='EXACT';join.object=handle
    bpy.ops.object.modifier_apply(modifier=join.name)
    bpy.data.objects.remove(handle,do_unlink=True)
bevel=vat_shell.modifiers.new('Compressed joining seam','BEVEL')
bevel.width=.002;bevel.segments=3;bevel.limit_method='ANGLE';bevel.angle_limit=.6
bpy.ops.object.modifier_apply(modifier=bevel.name)
# An open seam can look closed but makes unions and physical wall thickness
# unreliable. Reject it at authoring time instead of shipping disconnected shells.
bm=bmesh.new();bm.from_mesh(vat_shell.data)
assert not any(not e.is_manifold for e in bm.edges), 'Vat shell/lug join must be manifold'
bm.free()
# Metric UVs: 20cm scan. Per-face seam correction avoids a stretched stripe.
uv=vat_shell.data.uv_layers[0]
mask=vat_shell.data.color_attributes.new(name='GlazeResidue',type='FLOAT_COLOR',domain='CORNER')
for face in vat_shell.data.polygons:
    face.use_smooth=True
    angles=[math.atan2(-vat_shell.data.vertices[vat_shell.data.loops[li].vertex_index].co.y,vat_shell.data.vertices[vat_shell.data.loops[li].vertex_index].co.x) for li in face.loop_indices]
    seam=max(angles)-min(angles)>math.pi
    for li,a in zip(face.loop_indices,angles):
        v=vat_shell.data.vertices[vat_shell.data.loops[li].vertex_index].co
        x,z,h=v.x,-v.y,v.z;r=math.hypot(x,z)
        aa=a+math.tau if seam and a<0 else a
        if face.material_index==0:
            uv.data[li].uv=(aa*.276/.2,h/.2) if abs(face.normal.z)<.8 else (x/.2,z/.2)
        inner=r<vat_radius(max(.024,min(.35,h)))-.012
        def band(value,center,width):return math.exp(-((value-center)/width)**4)
        # The inner tide line follows the old fill level. Four specific over-rim
        # spills run downward; no random grunge or scratches are scattered on it.
        residue=(.82*band(h,.327,.012)+.35*band(h,.348,.006)) if inner else 0
        for angle,stop,width in [(-1.3,.19,.055),(-.75,.255,.085),(1.7,.23,.05),(2.5,.28,.075)]:
            da=math.atan2(math.sin(a-angle),math.cos(a-angle))
            fall=max(0,min(1,(h-stop)/(.354-stop)))
            stream_width=width*(.20+.80*fall**1.8)
            wetpath=math.exp(-(da/stream_width)**2)*max(0,min(1,(h-stop)/.012))*max(0,min(1,(.366-h)/.008))
            if not inner:residue=max(residue,wetpath*.83)
        damp=float(inner and h<.318)
        handling=band(h,.27,.05)*max(0,math.cos(a*2))**16 if r>.29 else 0
        mask.data[li].color=(min(1,residue),damp,handling,1)
for face in vat_shell.data.polygons:face.material_index=0
while len(vat_shell.data.materials)>1:vat_shell.data.materials.pop(index=1)

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
            uv.append((0,t*length/.2))
        # Clay006 is a 20cm scan. Follow the actual cross-section arc length,
        # including its rounded square corners, rather than a unit UV cylinder.
        start=j*(n+1);arc=0
        for i in range(1,n+1):
            arc+=(Vector(verts[start+i])-Vector(verts[start+i-1])).length
            uv[start+i]=(arc/.2,t*length/.2)
    for j in range(rings-1):
        for i in range(n):
            a=j*(n+1)+i; faces.append((a,a+1,a+n+2,a+n+1))
    # Wire-cut end faces have their own planar UVs and normals. Sharing the side
    # ring stretched the cap into a line and rounded the entire cut face.
    for j in [0,rings-1]:
        center=Vector((0,0,0))
        for i in range(n): center+=Vector(verts[j*(n+1)+i])/n
        def capuv(v):
            localx=(v[0]-cx)*math.cos(angle)-(v[2]-cz)*math.sin(angle)
            return ((localx+width*.5)/.2,v[1]/.2)
        idx=len(verts);verts.append(tuple(center));uv.append(capuv(center))
        rim=len(verts)
        for i in range(n+1):
            v=verts[j*(n+1)+i];verts.append(v);uv.append(capuv(v))
        for i in range(n):faces.append((idx,rim+i,rim+i+1))
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
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/craft-tools.glb'),export_format='GLB',export_yup=True,export_animations=False,export_vertex_color='NAME',export_vertex_color_name='GlazeResidue',export_all_vertex_colors=False)
print('CRAFT_TOOLS_COMPLETE')
