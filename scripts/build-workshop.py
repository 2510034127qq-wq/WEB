"""Editable Blender source. Metres; world x/east, y/up, z/south in game.
Run: blender --background --python scripts/build-workshop.py
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
random.seed(1743)
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; OUT.mkdir(exist_ok=True,parents=True)
(ROOT/'art').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def xyz(p): return (p[0],-p[2],p[1])
def mat(name,color,rough=0.8,texture=None):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes; p=next((v for v in n if v.type=='BSDF_PRINCIPLED'),None) or n.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    if texture:
        for channel,inputname in [('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal')]:
            f=(OUT/'craft-surfaces' if texture=='solidwood' else OUT/'textures'/'realism')/f'{texture}_{channel}.jpg'
            if f.exists():
                t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(f),check_existing=True)
                if channel!='diff':t.image.colorspace_settings.name='Non-Color'
                if channel=='nor_gl':
                    normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=0.55;m.node_tree.links.new(t.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs[0],p.inputs[inputname])
                else:m.node_tree.links.new(t.outputs['Color'],p.inputs[inputname])
    return m
wood=mat('weathered_wood',(0.25,0.16,0.09),texture='solidwood')
wall=mat('lime_plaster',(0.73,0.71,0.62),texture='wall')
ground=mat('courtyard_stone',(0.38,0.38,0.34),texture='ground')
brick=mat('kiln_firebrick',(0.4,0.22,0.12),texture='brick')
roof=mat('grey_fired_roof_tiles',(0.035,0.045,0.042),0.92)
clay=mat('unglazed_stoneware',(0.37,0.23,0.14),0.92)
porcelain=mat('ivory_porcelain',(0.64,0.61,0.52),0.93)
water=mat('still_water',(0.16,0.24,0.2),0.12)
iron=mat('forged_iron',(0.075,0.08,0.073),0.48);next(v for v in iron.node_tree.nodes if v.type=='BSDF_PRINCIPLED').inputs['Metallic'].default_value=0.6
linen=mat('undyed_linen',(0.47,0.44,0.33),0.95)
leaf=mat('bamboo_leaves',(0.15,0.23,0.11),0.82)
charcoal=mat('charcoal',(0.06,0.045,0.025),1)
def finish(o,name,m):
    o.name=name;o.data.materials.append(m)
    return o
def box(name,p,size,m,bevel=0.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    # Project UV in real-world metres, avoiding stretched tabletop grain.
    uv=o.data.uv_layers.active
    for face in o.data.polygons:
        normal=face.normal; axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            if m == wood:
                # Grain follows the longest timber dimension, including vertical posts.
                longaxis=max(axes,key=lambda a:o.dimensions[a]); crossaxis=next(a for a in axes if a!=longaxis)
                uv.data[li].uv=(co[longaxis]/1.4,co[crossaxis]/1.4+0.052)
            else: uv.data[li].uv=(co[axes[0]]/1.4,co[axes[1]]/1.4)
    if bevel:
        mod=o.modifiers.new('soft worn edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
        o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
    return finish(o,name,m)
def cyl(name,p,r,depth,m,r2=None,verts=32):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=xyz(p));o=bpy.context.object
    for f in o.data.polygons:f.use_smooth=abs(f.normal.z)<0.9
    if m == wood:
        for q in o.data.uv_layers.active.data: q.uv=(q.uv[1]*depth/1.4,q.uv[0]*r*2*math.pi/1.4+0.052)
    return finish(o,name,m)
def beam(name,a,b,r,m):
    va,vb=Vector(xyz(a)),Vector(xyz(b));o=cyl(name,tuple((a[i]+b[i])/2 for i in range(3)),r,(vb-va).length,m,verts=12);o.rotation_euler=(vb-va).to_track_quat('Z','Y').to_euler();return o
def vessel(name,p,profile,m):
    vertices=[];faces=[];N=48
    for r,h in profile:
        for j in range(N):vertices.append((r*math.cos(j/N*math.tau)+p[0],r*math.sin(j/N*math.tau)-p[2],h+p[1]))
    for i in range(len(profile)-1):
        for j in range(N):faces.append((i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);finish(o,name,m)
    uv=mesh.uv_layers.new()
    for f in mesh.polygons:
        f.use_smooth=True
        for li in f.loop_indices:
            idx=mesh.loops[li].vertex_index;uv.data[li].uv=(idx%N/N,idx//N/(len(profile)-1))
    return o
def table(x,z,w=2.4,d=1.15,h=0.92):
    for i in range(5):box('table_plank',(x,h,z+(i-2)*d/5),(w,0.085,d/5-0.008),wood,0.012)
    for dx in [-w/2+0.16,w/2-0.16]:
        for dz in [-d/2+0.14,d/2-0.14]:box('table_leg',(x+dx,h/2,z+dz),(0.10,h,0.10),wood)
        box('table_stretcher',(x+dx,0.27,z),(0.07,0.08,d),wood)
    box('table_apron',(x,h-0.14,z),(w-0.1,0.18,d-0.14),wood)
def roof_shed(cx,cz,w,d,h):
    columns=[cx-w/2+0.18,cx-w/6,cx+w/6,cx+w/2-0.18] if w>10 else [cx-w/2+0.18,cx+w/2-0.18]
    for x in columns:
        for z in [cz-d/2+0.15,cz+d/2-0.15]:box('timber_post',(x,h/2,z),(0.18,h,0.18),wood,0.025)
        for side in [-1,1]:
            beam('roof_rafter',(x,h+0.72,cz),(x,h-0.14,cz+side*(d/2+0.34)),0.07,wood)
            beam('diagonal_brace',(x,h-0.65,cz+side*(d/2-0.15)),(x+0.6 if x<cx else x-0.6,h-0.1,cz+side*(d/2-0.15)),0.05,wood)
    for z in [cz-d/2,cz+d/2]:box('long_lintel',(cx,h-0.12,z),(w,0.20,0.18),wood)
    # Rows of individual shallow curved clay tiles, with visible overlap.
    for side in [-1,1]:
        rows=math.ceil((d/2+0.42)/0.26);cols=math.ceil((w+0.6)/0.24)
        verts=[];faces=[]
        for i in range(cols):
            for j in range(rows):
                x=cx-(w+0.6)/2+i*0.24;z=cz+side*j*0.26;y=h+0.73-j*0.26*0.86/(d/2+0.34)
                base=len(verts)
                for k in range(5):
                    for t in range(2):
                        xx=x+k*0.06;zz=z+side*t*0.32;yy=y-t*0.32*0.86/(d/2+0.34)*0.78+math.sin(k/4*math.pi)*0.035
                        verts.append(xyz((xx,yy,zz)))
                for k in range(4):faces.append((base+k*2,base+k*2+1,base+k*2+3,base+k*2+2))
        mesh=bpy.data.meshes.new('roof_tiles');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('overlapping_roof_tiles',mesh);bpy.context.collection.objects.link(o);finish(o,'overlapping_roof_tiles',roof)
    beam('roof_ridge',(cx-w/2-0.35,h+0.77,cz),(cx+w/2+0.35,h+0.77,cz),0.1,roof)

import importlib.util
spec=importlib.util.spec_from_file_location('craft_structure',ROOT/'scripts/structural-meshes.py')
structure=importlib.util.module_from_spec(spec);spec.loader.exec_module(structure);structure.install(globals())

box('ground',(0,-0.1,0),(20,0.2,20),ground,0)
box('north_wall_lower',(0,.64,-8),(18,1.28,.36),wall)
box('north_wall_upper',(0,2.94,-8),(18,.72,.36),wall)
for xx,ww in [(-7.85,2.3),(-4.5,1.6),(0,4.6),(4.5,1.6),(7.85,2.3)]:box('window_pier',(xx,1.93,-8),(ww,1.3,.36),wall)
for x in [-9,9]:box('side_wall',(x,1.45,0),(0.3,2.9,16),wall)
for x in [-6,6]:box('south_wall',(x,1.45,8),(6,2.9,0.3),wall)
for x in [-9,9]:box('wall_coping',(x,2.94,0),(0.46,0.15,16.4),roof)
for x in [-6,6]:box('wall_coping',(x,2.94,8),(6.4,0.15,0.46),roof)
box('north_coping',(0,3.34,-8),(18.4,0.15,0.5),roof)
roof_shed(0,-6.3,17.7,3.2,3.1)
roof_shed(-7.25,0,3,6.6,2.8)
roof_shed(7.1,-0.2,3.2,4.1,2.85)
roof_shed(5.8,5.7,5.6,4.8,3.4)
roof_shed(-5.8,5.7,4.3,3.1,2.85)
roof_shed(0,6.5,3.6,2.1,2.8)
for x in [-5.6,5.4]:table(x,-5.6)
table(7.2,-0.2,1.35,2.0,0.92);table(-6,5,2.8,1.3,0.9);table(0,5.8,2.8,1.1,0.92)
# Include the same detailed wheel in offline lighting; the runtime animates its
# separate delivery asset. The old double discs/spokes are intentionally removed.
with bpy.data.libraries.load(str(ROOT/'art/potters-wheel.blend'),link=False) as (src,dst):dst.objects=src.objects
for ob in dst.objects:
 if ob:
  bpy.context.collection.objects.link(ob);ob['deliveryExternal']='potters-wheel'
for ob in dst.objects:
 if ob and ob.parent is None:ob.location=xyz((0,.78,-5.6))
box('wheel_bench',(0,0.40,-4.62),(0.9,0.10,0.32),wood)
for x in [-0.32,0.32]:box('bench_leg',(x,0.2,-4.62),(0.08,0.4,0.22),wood)
# Drying shelves and porcelain blanks.
for x in [-8,-6.9]:
    for z in [-2,1.6]:box('drying_rack_upright',(x,1.17,z),(0.085,2.3,0.085),wood)
for y in [0.42,0.98,1.54,2.08]:
    for z in [-1.8,-1.1,-0.4,0.3,1.0]:
        box('drying_board',(-7.45,y,z),(1.2,0.045,0.58),wood,0.005)
        if y>1.2:
            for x in [-7.72,-7.15]:vessel('drying_bowl',(x,y+0.025,z),[(0,0),(0.05,0),(0.05,0.015),(0.12,0.1),(0.12,0.11),(0.111,0.105),(0.04,0.025),(0,0.025)],porcelain)
# Water jars, wash trough, glaze jar; these have real interior walls.
for x,z in [(-6.9,-5.5),(-4.1,-6),(7.4,1.0),(-5.7,6.4)]:
    outer=[(0.285+0.135*math.sin(t/32*math.pi*.94),0.04+t/32*.70) for t in range(33)]
    inner=[(r-0.025,y) for r,y in reversed(outer)]
    vessel('water_jar',(x,0.02,z),[(0,0),(0.25,0)]+outer+[(0.325,.77),(.300,.77)]+inner+[(0,.07)],clay)
    cyl('water_surface',(x,0.65,z),0.346,0.006,water,verts=64)
for x in [-5.95,-5.18]:vessel('wash_basin',(x,0.97,-5.6),[(0,0),(0.18,0),(0.23,0.12),(0.23,0.14),(0.215,0.14),(0.17,0.02),(0,0.02)],clay)
for i in range(9):box('clay_brick',(-6.8+(i%3)*0.37,1.0+(i//3)*0.13,5.15),(0.31,0.12,0.26),clay,.018)
for x in [4.7,4.95,5.85,6.15]:vessel('pigment_dish',(x,1.01,-5.8),[(0,0),(0.05,0),(0.065,0.025),(0.055,0.032),(0,0.012)],porcelain)
box('pattern_book',(4.8,1.02,-5.3),(0.36,0.03,0.3),linen,0.003)
# Shared kiln: a walkable-size vaulted brick body with an open arched front.
cx,cz=6,5.8
box('kiln_hearth',(cx,0.15,cz),(3.25,0.3,3.8),brick)
box('kiln_back',(cx,1.0,7.65),(3.2,2.0,0.22),brick)
for side in [-1,1]:box('kiln_side',(cx+side*1.53,0.67,cz),(0.30,1.0,3.8),brick)
kiln_vault(cx,cz)
box('chimney',(6,3.0,7.3),(0.72,3.6,0.7),brick)
for i in range(8):
    x=5.1+(i%3)*0.64;z=5.0+(i//3)*0.8
    vessel('stacked_sagger',(x,0.32,z),[(0,0),(0.27,0),(0.28,0.35),(0.25,0.36),(0.24,0.04),(0,0.04)],clay)
for i in range(18):
    a=random.random()*math.tau;r=random.random()*0.9
    o=box('charred_coal',(6+math.cos(a)*r,0.35,4.15+math.sin(a)*0.25),(0.18,0.09,0.11),charcoal);o.rotation_euler[2]=random.random()*3
# Loom-like paper windows and restrained architectural details.
for x in [-6,-3,3,6]:
    box('window_sill',(x,1.30,-7.94),(1.42,.08,.49),wood,.009)
    box('window_lintel',(x,2.63,-7.94),(1.42,.09,.42),wood,.006)
    for dx in [-0.63,0,0.63]:box('window_lattice',(x+dx,2,-7.77),(0.04,1.32,0.04),wood,0.004)
    for dy in [-0.65,-0.22,0.22,0.65]:box('window_lattice',(x,2+dy,-7.77),(1.3,0.035,0.04),wood,0.004)
# Bamboo garden, stepping stones and bundled straw.
for i in range(13):
    x=-8.3+random.random()*0.8;z=2.7+random.random()*0.8;h=2.4+random.random()*1.7
    beam('bamboo_stem',(x,0,z),(x+0.13,h,z+0.08),0.022,leaf)
    for j in range(5):
        y=1+j*0.45
        for side in [-1,1]:
            tip=(x+side*(0.25+random.random()*0.3),y+0.17,z+0.1)
            beam('bamboo_branch',(x,y,z),tip,0.006,leaf)
            for k in range(3):
                verts=[xyz((tip[0],tip[1],tip[2])),xyz((tip[0]+side*0.16,tip[1]+0.04,tip[2]+0.04+k*0.06)),xyz((tip[0]+side*0.32,tip[1]-0.12,tip[2]+0.1+k*0.06))]
                me=bpy.data.meshes.new('leaf');me.from_pydata(verts,[],[(0,1,2)]);ob=bpy.data.objects.new('leaf',me);bpy.context.collection.objects.link(ob);finish(ob,'leaf',leaf)
for i in range(20):
    x=-.95+random.uniform(-.12,.12);z=5.8+random.uniform(-.04,.04);beam('packaging_straw',(x,.976,z),(x+.08,.981,z+.36),0.002,linen)

production_racks()

# Preserve the named components and joins before the delivery mesh is combined.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/workshop-components.blend'))

# Join by material for a low draw-call, editable asset; apply modifiers first.
for material in list(bpy.data.materials):
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials) and o.data.materials[0]==material]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True);bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):
            try:bpy.ops.object.modifier_apply(modifier=mod.name)
            except:pass
        # Joining by material otherwise creates UVMap + SurfaceUV, leaving one
        # layer empty on each family of components and shifting LightUV to slot 2.
        if o.data.uv_layers:o.data.uv_layers[0].name='SurfaceUV'
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='workshop_'+material.name
for image in bpy.data.images:
    if image.source=='FILE': image.filepath=bpy.path.relpath(bpy.path.abspath(image.filepath),start=str(ROOT/'art'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/workshop.blend'))
# PBR maps are external, shared runtime assets. Avoid repacking them into a second
# copy in GLB; Blender source retains the complete connected material graphs.
for m in bpy.data.materials:
    if m.use_nodes:
        for node in list(m.node_tree.nodes):
            if node.type=='TEX_IMAGE':m.node_tree.nodes.remove(node)
bpy.ops.export_scene.gltf(filepath=str(OUT/'workshop.glb'),export_format='GLB',export_yup=True,export_apply=True)
print('WORKSHOP_COMPLETE',flush=True)

