"""Run with Blender in background mode to bake the edited FBX into the client."""

from base64 import b64encode
from hashlib import sha256
import json
from pathlib import Path
import struct
from tempfile import NamedTemporaryFile

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/models/vera-seated.fbx'
DESTINATION = ROOT / 'client/vera-mesh-data.js'
GAME_AXES = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
HEAD_PIVOT = Matrix.Translation((0, 0, -3.17))


def geometry(parts, edit=None):
    vertices, normals, colors, indices, dye_mask, seen = [], [], [], [], [], {}
    for obj, placement in parts:
        transform = GAME_AXES @ placement
        normal_transform = transform.to_3x3().inverted().transposed()
        order = (0, 2, 1) if transform.to_3x3().determinant() < 0 else (0, 1, 2)
        mesh = obj.data
        mesh.calc_loop_triangles()
        paint = mesh.color_attributes.get('Vera_Color')
        if paint is None:
            raise ValueError(f'{obj.name} has no Vera_Color attribute')
        has_wine_fabric = obj.name in ('Bodice', 'Overskirt', 'Left_Upper_Arm', 'Right_Upper_Arm')
        for triangle in mesh.loop_triangles:
            material = mesh.materials[triangle.material_index]
            # The lips are part of the head and share its skin vertex paint.
            lip_color = material.diffuse_color[:3] if obj.name == 'Head' and material.name in ('Gem', 'Lip') else None
            for i in order:
                vertex, corner = triangle.vertices[i], triangle.loops[i]
                pos = transform @ mesh.vertices[vertex].co
                norm = (normal_transform @ mesh.corner_normals[corner].vector).normalized()
                rgb = lip_color or paint.data[corner if paint.domain == 'CORNER' else vertex].color[:3]
                # Burgundy fabric has more blue than green. The adjacent skin
                # and ivory are warm, even when they share the same mesh.
                dye = has_wine_fabric and rgb[0] > rgb[2] > rgb[1]
                if edit is not None:
                    pos = edit(pos, material.name)
                key = tuple(round(value, 6) for value in (*pos, *norm, *rgb)) + (dye,)
                index = seen.get(key)
                if index is None:
                    index = seen[key] = len(vertices)
                    vertices.append(tuple(pos)); normals.append(tuple(norm)); colors.append(rgb)
                    dye_mask.append(dye)
                indices.append(index)
    return vertices, normals, colors, indices, dye_mask


def encode(values, kind):
    return b64encode(struct.pack(f'<{len(values)}{kind}', *values)).decode('ascii')


def pack(asset):
    vertices, normals, colors, elements, dye = asset
    attributes = {
        'position': encode([component for v in vertices for component in v], 'f'),
        'normal': encode([component for n in normals for component in n], 'f'),
        'color': encode([component for c in colors for component in c], 'f'),
        'index': encode(elements, 'H'),
    }
    if any(dye):
        attributes['dye'] = encode(dye, 'B')
    return attributes


source_digest = sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
status = bpy.ops.import_scene.fbx(filepath=str(SOURCE), colors_type='SRGB')
if status != {'FINISHED'}:
    raise RuntimeError(status)
bpy.context.view_layer.update()
objects = bpy.data.objects
root = objects.get('Vera_Root')
# FBX axis conversion can land on the root Empty. Bake its children in the
# model's own space so the same parts still line up with the game rig.
from_world = root.matrix_world.inverted() if root is not None else Matrix.Identity(4)


def world(*names, anchor=None):
    parts = []
    for name in names:
        obj = objects[name]
        placement = from_world @ obj.matrix_world
        parts.append((obj, placement if anchor is None else anchor @ placement))
    return parts


head = geometry(world('Head', anchor=HEAD_PIVOT))
points, _, _, elements, _ = head
surface = BVHTree.FromPolygons(points, list(zip(elements[::3], elements[1::3], elements[2::3])), all_triangles=True)


def expression(point, material):
    if material not in ('Brow', 'Lip'):
        return point
    x, y, z = point
    direction = Vector((0, 0, -1))
    before, *_ = surface.ray_cast(Vector((x, y, 1)), direction)
    if material == 'Brow':
        y -= .030 * max(0, min(1, (.162 - abs(x)) / .087))
    else:
        y += .013 * (1 - 2 * min(1, abs(x) / .075))
    after, *_ = surface.ray_cast(Vector((x, y, 1)), direction)
    return Vector((x, y, z + after.z - before.z)) if before is not None and after is not None else point


marks = world('Face_Details', anchor=HEAD_PIVOT)
accessories = ('Ears', 'Earrings') if 'Ears' in objects else ('Earrings',)
assets = {
    'outfit': geometry(world('Bodice', 'Skirt', 'Overskirt', 'Waist_Clasp', 'Collar', 'Heart_Brooch', 'Boots')),
    'hair': geometry(world('Hair', anchor=HEAD_PIVOT)),
    'accessories': geometry(world(*accessories, anchor=HEAD_PIVOT)),
    'head': head,
    'neutral': geometry(marks),
    'angry': geometry(marks, expression),
}

# The two hand names can be interchanged on export. Fit the physical sides to
# the same wrist positions used by the action rig, including mirrored scale.
hands = [(obj, from_world @ obj.matrix_world) for obj in (objects['Left_Hand'], objects['Right_Hand'])]
hands.sort(key=lambda entry: entry[1].translation.x)
if not hands[0][1].translation.x < 0 < hands[1][1].translation.x:
    raise ValueError('Expected one hand on each side of Vera')
for side, label, (hand, placement) in zip((-1, 1), ('Right', 'Left'), hands, strict=True):
    for segment in ('Upper_Arm', 'Forearm'):
        name = f'{label}_{segment}'
        assets[name] = geometry([(objects[name], Matrix.Identity(4))])
    wrist = Matrix.Translation((-side * .47, .96, -1.8))
    assets[f'{label}_Hand'] = geometry([(hand, wrist @ placement)])

source_triangles = sum(len(obj.data.loop_triangles) for obj in objects if obj.type == 'MESH')
game_triangles = sum(len(asset[3]) // 3 for key, asset in assets.items() if key != 'angry')
if game_triangles != source_triangles:
    raise ValueError(f'Triangle count changed from {source_triangles} to {game_triangles}')
packed = {name: pack(asset) for name, asset in assets.items()}
with NamedTemporaryFile('w', encoding='utf-8', dir=DESTINATION.parent, delete=False) as output:
    temporary = Path(output.name)
    output.write('// Generated by scripts/bake-vera-fbx.py from art/models/vera-seated.fbx.\n'
                 f'// Source SHA-256: {source_digest}\n'
                 'export default ' + json.dumps(packed, indent=2) + ';\n')
try:
    if sha256(SOURCE.read_bytes()).hexdigest() != source_digest:
        raise RuntimeError('The source FBX changed during export. Run the bake again.')
    temporary.replace(DESTINATION)
finally:
    temporary.unlink(missing_ok=True)
print(f'Baked {game_triangles} triangles with vertex colors to {DESTINATION.name}')
