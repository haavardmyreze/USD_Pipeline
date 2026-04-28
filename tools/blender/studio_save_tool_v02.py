bl_info = {
    "name": "Studio Save Tool",
    "author": "OpenAI / Pipeline Prototype",
    "version": (0, 2, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Studio",
    "description": "Creates and versions Blender work files using the studio USD pipeline folder and naming rules.",
    "category": "Pipeline",
}

import bpy
from bpy.props import StringProperty, EnumProperty, BoolProperty
from pathlib import Path
import re

TASKS = [
    ("model", "Model", "Geometry/modeling work"),
    ("lookdev", "Lookdev", "Materials/lookdev work"),
    ("assembly", "Assembly", "Asset assembly work"),
    ("layout", "Layout", "Shot layout work"),
    ("anim", "Anim", "Animation work"),
    ("fx", "FX", "FX/simulation work"),
    ("lighting", "Lighting", "Lighting/render setup work"),
]

ASSET_TASKS = {"model", "lookdev", "assembly"}
SHOT_TASKS = {"layout", "anim", "fx", "lighting"}
VALID_TOKEN_RE = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
VALID_DESCRIPTOR_RE = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
VALID_ARTIST_RE = re.compile(r"^[a-z]+$")
VALID_SEQ_RE = re.compile(r"^[a-z]{3,5}$")
VALID_SHOT_RE = re.compile(r"^[0-9]{4}$")
VERSION_RE = re.compile(r"_v(\d{3})\.blend$", re.IGNORECASE)

addon_keymaps = []


def clean_token(value: str) -> str:
    """Normalize user-entered names into pipeline-friendly lowercase tokens."""
    value = (value or "").strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^a-z0-9_-]", "", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


def validate_props(props):
    errors = []

    root = Path(bpy.path.abspath(props.project_root)).expanduser() if props.project_root else None
    if not root:
        errors.append("Project Root is required.")

    artist = clean_token(props.artist)
    descriptor = clean_token(props.descriptor)
    task = props.task

    if not VALID_ARTIST_RE.match(artist):
        errors.append("Artist must use lowercase letters only, for example: erik or maria.")

    if descriptor and not VALID_DESCRIPTOR_RE.match(descriptor):
        errors.append("Descriptor may only use lowercase letters, numbers, underscores, or hyphens.")

    if props.context_type == "ASSET":
        asset = clean_token(props.asset_name)
        if not VALID_TOKEN_RE.match(asset):
            errors.append("Asset name must use lowercase letters/numbers with underscores, for example: char_robot.")
        if task not in ASSET_TASKS:
            errors.append("Asset work files should use model, lookdev, or assembly.")
    else:
        seq = clean_token(props.sequence)
        shot = clean_token(props.shot)
        if not VALID_SEQ_RE.match(seq):
            errors.append("Sequence must be 3–5 lowercase letters, for example: neon.")
        if not VALID_SHOT_RE.match(shot):
            errors.append("Shot must be four digits, for example: 0010.")
        if task not in SHOT_TASKS:
            errors.append("Shot work files should use layout, anim, fx, or lighting.")

    return errors


def build_folder(props) -> Path:
    root = Path(bpy.path.abspath(props.project_root)).expanduser()
    task = props.task

    if props.context_type == "ASSET":
        asset = clean_token(props.asset_name)
        return root / "assets" / asset / task / "blend"

    sequence = clean_token(props.sequence)
    shot = clean_token(props.shot)
    return root / "shots" / sequence / shot / task / "blend"


def build_basename(props, version: int) -> str:
    task = props.task
    artist = clean_token(props.artist)
    descriptor = clean_token(props.descriptor)

    if props.context_type == "ASSET":
        context = clean_token(props.asset_name)
    else:
        context = f"{clean_token(props.sequence)}_{clean_token(props.shot)}"

    parts = [context, task]
    if descriptor:
        parts.append(descriptor)
    parts.extend([artist, f"v{version:03d}"])
    return "_".join(parts) + ".blend"


def find_next_version(folder: Path, props) -> int:
    if not folder.exists():
        return 1

    # Match the exact context/task/descriptor/artist prefix, then find the highest v###.
    artist = clean_token(props.artist)
    descriptor = clean_token(props.descriptor)
    task = props.task
    context = clean_token(props.asset_name) if props.context_type == "ASSET" else f"{clean_token(props.sequence)}_{clean_token(props.shot)}"

    prefix_parts = [context, task]
    if descriptor:
        prefix_parts.append(descriptor)
    prefix_parts.append(artist)
    prefix = "_".join(prefix_parts) + "_v"

    highest = 0
    for path in folder.glob(f"{prefix}[0-9][0-9][0-9].blend"):
        match = VERSION_RE.search(path.name)
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def parse_current_filepath(filepath: str):
    path = Path(filepath)
    match = VERSION_RE.search(path.name)
    if not match:
        return None
    return path, int(match.group(1))


def build_preview(props) -> str:
    errors = validate_props(props)
    if errors:
        return "Cannot preview until required fields are valid."
    folder = build_folder(props)
    version = find_next_version(folder, props)
    return str(folder / build_basename(props, version))


class StudioSaveToolProperties(bpy.types.PropertyGroup):
    project_root: StringProperty(
        name="Project Root",
        description="Root project folder containing assets/ and shots/",
        subtype="DIR_PATH",
        default="//",
    )
    context_type: EnumProperty(
        name="Type",
        items=[
            ("ASSET", "Asset", "Create an asset work file"),
            ("SHOT", "Shot", "Create a shot work file"),
        ],
        default="ASSET",
    )
    asset_name: StringProperty(name="Asset", default="char_robot")
    sequence: StringProperty(name="Sequence", default="neon")
    shot: StringProperty(name="Shot", default="0010")
    task: EnumProperty(name="Task", items=TASKS, default="model")
    descriptor: StringProperty(name="Descriptor", description="Optional descriptor, for example blocking", default="")
    artist: StringProperty(name="Artist", default="artist")
    is_studio_managed: BoolProperty(
        name="Studio Managed",
        description="Marks this .blend as managed by the Studio Save Tool. Ctrl+S is blocked so artists use Save New Version instead.",
        default=False,
    )


class STUDIO_OT_save_work_file(bpy.types.Operator):
    bl_idname = "studio.save_work_file"
    bl_label = "Create / Save Work File"
    bl_description = "Create the folder if needed and save this file using the next available version"
    bl_options = {"REGISTER"}

    def execute(self, context):
        props = context.scene.studio_save_tool
        errors = validate_props(props)
        if errors:
            self.report({"ERROR"}, errors[0])
            return {"CANCELLED"}

        folder = build_folder(props)
        folder.mkdir(parents=True, exist_ok=True)
        version = find_next_version(folder, props)
        target = folder / build_basename(props, version)

        bpy.ops.wm.save_as_mainfile(filepath=str(target))
        props.is_studio_managed = True
        self.report({"INFO"}, f"Saved work file: {target.name}")
        return {"FINISHED"}


class STUDIO_OT_save_new_version(bpy.types.Operator):
    bl_idname = "studio.save_new_version"
    bl_label = "Save New Version"
    bl_description = "Increment the current .blend filename from v### to the next version"
    bl_options = {"REGISTER"}

    def execute(self, context):
        current = bpy.data.filepath
        if not current:
            self.report({"ERROR"}, "Current file has not been saved yet. Use Create / Save Work File first.")
            return {"CANCELLED"}

        parsed = parse_current_filepath(current)
        if not parsed:
            self.report({"ERROR"}, "Current filename does not end with _v###.blend.")
            return {"CANCELLED"}

        path, version = parsed
        # Do not overwrite if skipped versions already exist; find the next free filename.
        next_version = version + 1
        while True:
            target_name = VERSION_RE.sub(f"_v{next_version:03d}.blend", path.name)
            target = path.with_name(target_name)
            if not target.exists():
                break
            next_version += 1

        bpy.ops.wm.save_as_mainfile(filepath=str(target))
        context.scene.studio_save_tool.is_studio_managed = True
        self.report({"INFO"}, f"Saved new version: {target.name}")
        return {"FINISHED"}



class STUDIO_OT_guarded_save(bpy.types.Operator):
    bl_idname = "studio.guarded_save"
    bl_label = "Studio Save Guard"
    bl_description = "Intercept regular save for studio-managed files"
    bl_options = {"REGISTER"}

    def invoke(self, context, event):
        props = context.scene.studio_save_tool
        if props.is_studio_managed:
            return context.window_manager.invoke_props_dialog(self, width=460)

        if bpy.data.filepath:
            bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
        else:
            bpy.ops.wm.save_as_mainfile("INVOKE_DEFAULT")
        return {"FINISHED"}

    def draw(self, context):
        layout = self.layout
        layout.label(text="Regular Ctrl+S is disabled for studio-managed files.", icon="ERROR")
        layout.label(text="Use Save New Version in the Studio Save Tool instead.")
        layout.separator()
        layout.label(text="This prevents accidentally overwriting the current version.")

    def execute(self, context):
        self.report({"WARNING"}, "Use Studio Save Tool > Save New Version instead of Ctrl+S.")
        return {"CANCELLED"}

class STUDIO_OT_copy_preview_path(bpy.types.Operator):
    bl_idname = "studio.copy_preview_path"
    bl_label = "Copy Preview Path"
    bl_description = "Copy the generated next save path to the clipboard"
    bl_options = {"REGISTER"}

    def execute(self, context):
        props = context.scene.studio_save_tool
        preview = build_preview(props)
        context.window_manager.clipboard = preview
        self.report({"INFO"}, "Preview path copied to clipboard.")
        return {"FINISHED"}


class STUDIO_PT_save_tool(bpy.types.Panel):
    bl_label = "Studio Save Tool"
    bl_idname = "STUDIO_PT_save_tool"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Studio"

    def draw(self, context):
        layout = self.layout
        props = context.scene.studio_save_tool

        layout.prop(props, "project_root")
        layout.prop(props, "context_type")

        if props.context_type == "ASSET":
            layout.prop(props, "asset_name")
        else:
            row = layout.row(align=True)
            row.prop(props, "sequence")
            row.prop(props, "shot")

        layout.prop(props, "task")
        layout.prop(props, "descriptor")
        layout.prop(props, "artist")

        status = layout.box()
        if props.is_studio_managed:
            status.label(text="Studio-managed file", icon="LOCKED")
            status.label(text="Ctrl+S is blocked. Use Save New Version.")
        else:
            status.label(text="Not studio-managed yet", icon="UNLOCKED")

        box = layout.box()
        box.label(text="Preview")
        errors = validate_props(props)
        if errors:
            for error in errors[:4]:
                box.label(text=error, icon="ERROR")
            if len(errors) > 4:
                box.label(text=f"+ {len(errors) - 4} more issue(s)", icon="ERROR")
        else:
            box.label(text=build_preview(props), icon="FILE_BLEND")
            box.operator("studio.copy_preview_path", icon="COPYDOWN")

        layout.separator()
        layout.operator("studio.save_work_file", icon="FILE_TICK")
        layout.operator("studio.save_new_version", icon="DUPLICATE")


classes = (
    StudioSaveToolProperties,
    STUDIO_OT_save_work_file,
    STUDIO_OT_save_new_version,
    STUDIO_OT_guarded_save,
    STUDIO_OT_copy_preview_path,
    STUDIO_PT_save_tool,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.studio_save_tool = bpy.props.PointerProperty(type=StudioSaveToolProperties)

    wm = bpy.context.window_manager
    kc = wm.keyconfigs.addon
    if kc:
        km = kc.keymaps.new(name="Window", space_type="EMPTY")
        kmi = km.keymap_items.new("studio.guarded_save", type="S", value="PRESS", ctrl=True)
        addon_keymaps.append((km, kmi))


def unregister():
    for km, kmi in addon_keymaps:
        km.keymap_items.remove(kmi)
    addon_keymaps.clear()

    del bpy.types.Scene.studio_save_tool
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
