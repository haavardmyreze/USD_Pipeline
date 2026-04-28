bl_info = {
    "name": "USD Pipeline Publisher",
    "author": "Pipeline Prototype",
    "version": (0, 1, 2),
    "blender": (4, 0, 0),
    "category": "Import-Export",
    "description": "Prototype USD asset model publisher for a small USD pipeline",
}

import bpy
import re
from pathlib import Path
from bpy_extras.io_utils import axis_conversion


# ------------------------------------------------------------
# Naming helpers
# ------------------------------------------------------------

VALID_NAME_RE = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")

KNOWN_DEFAULT_NAMES = {
    "cube",
    "sphere",
    "uv_sphere",
    "ico_sphere",
    "cylinder",
    "cone",
    "torus",
    "plane",
    "circle",
    "monkey",
    "suzanne",
    "bezier_circle",
    "bezier_curve",
    "curve",
    "text",
    "material",
}

DEFAULT_NAME_NUMBER_SUFFIX_RE = re.compile(
    r"^(cube|sphere|uv_sphere|ico_sphere|cylinder|cone|torus|plane|circle|monkey|suzanne|curve|text|material)_[0-9]{3}$"
)


def sanitize_name(name: str) -> str:
    name = name.strip().lower()
    name = name.replace(".", "_")
    name = re.sub(r"[^a-z0-9_]+", "_", name)
    name = re.sub(r"_+", "_", name)
    return name.strip("_")


def is_valid_pipeline_name(name: str) -> bool:
    return bool(VALID_NAME_RE.match(name))


def looks_like_default_name(name: str) -> bool:
    return name in KNOWN_DEFAULT_NAMES or bool(DEFAULT_NAME_NUMBER_SUFFIX_RE.match(name))


# ------------------------------------------------------------
# Validation
# ------------------------------------------------------------


def collect_mesh_objects(collection):
    objects = []

    def walk(col):
        for obj in col.objects:
            if obj.type == "MESH":
                objects.append(obj)
        for child in col.children:
            walk(child)

    walk(collection)
    return objects


def validate_publish_settings(context, props):
    errors = []

    if not props.project_root:
        errors.append("Project root is not set.")

    if not props.source_collection:
        errors.append("Source collection is not set.")
        return errors

    asset_name = sanitize_name(props.source_collection.name)

    if not asset_name:
        add_issue(errors, "Invalid Names", f"Source collection '{props.source_collection.name}' produces an empty asset name after sanitizing.")
    elif asset_name != props.source_collection.name:
        add_issue(
            errors,
            "Invalid Names",
            f"Source collection '{props.source_collection.name}' has an invalid pipeline name. Rename it to '{asset_name}'."
        )
    elif not is_valid_pipeline_name(asset_name):
        add_issue(
            errors,
            "Invalid Names",
            f"Source collection '{props.source_collection.name}' is invalid. Use lowercase letters, numbers, and underscores only."
        )

    props.asset_name = asset_name
    return errors


def add_issue(issue_list: list, category: str, message: str):
    issue_list.append((category, message))


def format_issues(issues):
    grouped = {}
    for issue in issues:
        if isinstance(issue, tuple) and len(issue) == 2:
            category, message = issue
        else:
            category, message = "General", str(issue)
        grouped.setdefault(category, []).append(message)
    return grouped


def flatten_issues(issues):
    lines = []
    for category, messages in format_issues(issues).items():
        lines.append(f"[{category}]")
        for message in messages:
            lines.append(message)
    return "\n".join(lines)


def validate_pipeline_name(label: str, name: str, errors: list, warnings: list):
    clean = sanitize_name(name)

    if clean != name:
        add_issue(
            errors,
            "Invalid Names",
            f"{label} '{name}' has an invalid pipeline name. Rename it to '{clean}'. Use lowercase letters, numbers, and underscores only. No spaces, dots, uppercase letters, or special characters."
        )
        return

    if not clean or not is_valid_pipeline_name(clean):
        add_issue(
            errors,
            "Invalid Names",
            f"{label} '{name}' has an invalid pipeline name. Use lowercase letters, numbers, and underscores only."
        )
        return

    if looks_like_default_name(clean):
        add_issue(
            warnings,
            "Default-Looking Names",
            f"{label} '{name}' looks like a default Blender name. This may be intentional, but descriptive names are recommended."
        )


def validate_source_collection(collection):
    errors = []
    warnings = []
    mesh_objects = collect_mesh_objects(collection)

    if not mesh_objects:
        add_issue(errors, "Unsupported Content", "Source collection contains no mesh objects.")

    seen_object_names = {}

    for obj in mesh_objects:
        validate_pipeline_name("Object", obj.name, errors, warnings)

        if obj.parent:
            add_issue(
                warnings,
                "Flattened Hierarchy",
                f"Object '{obj.name}' is parented to '{obj.parent.name}'. Model publishes are flattened, so this hierarchy will not be preserved in USD."
            )

        clean_obj_name = sanitize_name(obj.name)
        if clean_obj_name:
            if clean_obj_name in seen_object_names:
                add_issue(
                    errors,
                    "Duplicate Export Names",
                    f"Duplicate exported prim name '{clean_obj_name}'. Objects '{seen_object_names[clean_obj_name]}' and '{obj.name}' would export to the same USD path."
                )
            else:
                seen_object_names[clean_obj_name] = obj.name

        for material in obj.data.materials:
            if material:
                validate_pipeline_name(f"Material on object '{obj.name}'", material.name, errors, warnings)

        if (
            abs(obj.scale.x - 1.0) > 0.0001
            or abs(obj.scale.y - 1.0) > 0.0001
            or abs(obj.scale.z - 1.0) > 0.0001
        ):
            add_issue(warnings, "Unapplied Scale", f"Object '{obj.name}' has unapplied scale: {tuple(round(v, 4) for v in obj.scale)}.")

    for obj in collection.all_objects:
        if obj.type in {"CAMERA", "LIGHT"}:
            add_issue(errors, "Unsupported Content", f"Unsupported object in model publish: {obj.type} '{obj.name}'. Remove it from the publish collection.")

    return errors, warnings


# ------------------------------------------------------------
# Export staging
# ------------------------------------------------------------


def get_blender_to_usd_axis_matrix():
    """Fixed Blender -> Houdini/USD axis conversion.

    Pipeline convention:
        Blender: Z-up, -Y forward
        Houdini: Y-up, +Z forward
    """
    return axis_conversion(
        from_forward="-Y",
        from_up="Z",
        to_forward="Z",
        to_up="Y",
    ).to_4x4()


def temporarily_rename_source_objects(source_objects):
    """Avoid .001 suffixes on temporary export objects.

    Blender object names are globally unique across the file. If an original object
    is called 'base', a temporary object also called 'base' would become 'base.001'.
    We rename the originals during export, then restore them afterward.
    """
    backups = []

    for index, obj in enumerate(source_objects):
        mesh = obj.data if obj.type == "MESH" else None
        backups.append((obj, obj.name, mesh, mesh.name if mesh else None))

        obj.name = f"__usdpipe_source_{index:04d}"
        if mesh:
            mesh.name = f"__usdpipe_source_mesh_{index:04d}"

    return backups


def restore_source_object_names(backups):
    for obj, obj_name, mesh, mesh_name in backups:
        obj.name = obj_name
        if mesh and mesh_name:
            mesh.name = mesh_name


def duplicate_mesh_to_publish_scene(source_objects, asset_name, publish_names):
    temp_scene = bpy.data.scenes.new(f"__usd_publish_{asset_name}")

    root_col = bpy.data.collections.new(asset_name)
    geo_col = bpy.data.collections.new("geo")
    root_col.children.link(geo_col)
    temp_scene.collection.children.link(root_col)

    axis_matrix = get_blender_to_usd_axis_matrix()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    for src in source_objects:
        clean_name = publish_names[src]
        eval_obj = src.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(eval_obj, depsgraph=depsgraph)
        mesh.name = clean_name

        new_obj = bpy.data.objects.new(clean_name, mesh)
        new_obj.matrix_world = axis_matrix @ src.matrix_world.copy()
        new_obj.data.name = clean_name

        for material in src.data.materials:
            new_obj.data.materials.append(material)

        geo_col.objects.link(new_obj)

    return temp_scene


def cleanup_collection(collection):
    for child in list(collection.children):
        cleanup_collection(child)

    for obj in list(collection.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)

    bpy.data.collections.remove(collection)


def cleanup_temp_scene(scene):
    for col in list(scene.collection.children):
        cleanup_collection(col)
    bpy.data.scenes.remove(scene)


# ------------------------------------------------------------
# USD cleanup / normalization
# ------------------------------------------------------------


def ensure_geo_scope_in_usd(usd_path: str, asset_name: str):
    try:
        from pxr import Usd, UsdGeom, Sdf
    except Exception:
        return False

    stage = Usd.Stage.Open(usd_path)
    if not stage:
        return False

    root_path = Sdf.Path(f"/{asset_name}")
    geo_path = root_path.AppendChild("geo")
    root_prim = stage.GetPrimAtPath(root_path)

    if not root_prim:
        return False

    if not stage.GetPrimAtPath(geo_path):
        UsdGeom.Scope.Define(stage, geo_path)

    layer = stage.GetRootLayer()
    children_to_move = []

    for child in root_prim.GetChildren():
        name = child.GetName()
        if name in {"geo", "_materials"}:
            continue
        if child.IsA(UsdGeom.Mesh) or child.IsA(UsdGeom.Xform):
            children_to_move.append(child)

    for child in children_to_move:
        old_path = child.GetPath()
        new_path = geo_path.AppendChild(child.GetName())

        if old_path == new_path or stage.GetPrimAtPath(new_path):
            continue

        Sdf.CopySpec(layer, old_path, layer, new_path)
        stage.RemovePrim(old_path)

    stage.GetRootLayer().Save()
    return True


def strip_shader_definitions_from_usd(usd_path: str, asset_name: str):
    try:
        from pxr import Usd
    except Exception:
        return False

    stage = Usd.Stage.Open(usd_path)
    if not stage:
        return False

    material_root = f"/{asset_name}/_materials"
    if stage.GetPrimAtPath(material_root):
        stage.RemovePrim(material_root)

    for prim in stage.Traverse():
        for rel_name in ("material:binding", "material:binding:preview"):
            rel = prim.GetRelationship(rel_name)
            if rel:
                prim.RemoveProperty(rel_name)

    stage.GetRootLayer().Save()
    return True


# ------------------------------------------------------------
# USD export
# ------------------------------------------------------------


def export_usd(props):
    source_objects = collect_mesh_objects(props.source_collection)
    publish_names = {obj: sanitize_name(obj.name) for obj in source_objects}
    source_name_backups = temporarily_rename_source_objects(source_objects)
    temp_scene = None

    output_dir = Path(props.project_root) / "assets" / props.asset_name / "model" / "usd"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{props.asset_name}_model.usdc"

    old_scene = bpy.context.window.scene

    try:
        temp_scene = duplicate_mesh_to_publish_scene(source_objects, props.asset_name, publish_names)
        bpy.context.window.scene = temp_scene

        export_kwargs = dict(
            filepath=str(output_path),
            selected_objects_only=False,
            export_animation=False,
            export_materials=True,
            export_lights=False,
            export_cameras=False,
            export_uvmaps=True,
            export_normals=True,
            export_mesh_colors=True,
            root_prim_path=f"/{props.asset_name}",
            merge_parent_xform=True,
        )

        try:
            bpy.ops.wm.usd_export(**export_kwargs)
        except TypeError:
            export_kwargs.pop("merge_parent_xform", None)
            bpy.ops.wm.usd_export(**export_kwargs)

        ensure_geo_scope_in_usd(str(output_path), props.asset_name)
        strip_shader_definitions_from_usd(str(output_path), props.asset_name)

    finally:
        bpy.context.window.scene = old_scene
        if temp_scene:
            cleanup_temp_scene(temp_scene)
        restore_source_object_names(source_name_backups)

    return str(output_path)


# ------------------------------------------------------------
# Blender UI
# ------------------------------------------------------------


class USDPIPELINE_PublishProperties(bpy.types.PropertyGroup):
    project_root: bpy.props.StringProperty(
        name="Project Root",
        description="Root folder of the project",
        subtype="DIR_PATH",
        default="",
    )

    asset_name: bpy.props.StringProperty(
        name="Asset Name",
        description="Derived from the source collection name",
        default="",
    )

    source_collection: bpy.props.PointerProperty(
        name="Source Collection",
        description="Collection to publish. The collection name becomes the asset name.",
        type=bpy.types.Collection,
    )

    pending_warnings: bpy.props.StringProperty(
        name="Pending Warnings",
        description="Warnings from the last publish validation",
        default="",
    )

    is_validated: bpy.props.BoolProperty(
        name="Validated",
        description="True when the current publish settings have passed validation or warnings were accepted",
        default=False,
    )


class USDPIPELINE_OT_validate_publish(bpy.types.Operator):
    bl_idname = "usdpipeline.validate_publish"
    bl_label = "Validate USD Publish"
    bl_options = {"REGISTER"}

    def execute(self, context):
        props = context.scene.usd_pipeline_publish
        props.pending_warnings = ""
        props.is_validated = False

        errors = validate_publish_settings(context, props)
        warnings = []

        if props.source_collection:
            col_errors, col_warnings = validate_source_collection(props.source_collection)
            errors.extend(col_errors)
            warnings.extend(col_warnings)

        if errors:
            for category, messages in format_issues(errors).items():
                for message in messages:
                    self.report({"ERROR"}, f"{category}: {message}")
            return {"CANCELLED"}

        if warnings:
            props.pending_warnings = flatten_issues(warnings)
            self.report({"WARNING"}, "Validation passed with warnings. Review them in the USD Pipeline panel.")
            return {"FINISHED"}

        props.is_validated = True
        self.report({"INFO"}, "Validation passed. Publish is now enabled.")
        return {"FINISHED"}


class USDPIPELINE_OT_cancel_warning_publish(bpy.types.Operator):
    bl_idname = "usdpipeline.cancel_warning_publish"
    bl_label = "Cancel"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        props = context.scene.usd_pipeline_publish
        props.pending_warnings = ""
        props.is_validated = False
        self.report({"INFO"}, "Pending publish cancelled.")
        return {"FINISHED"}


class USDPIPELINE_OT_proceed_with_warnings(bpy.types.Operator):
    bl_idname = "usdpipeline.proceed_with_warnings"
    bl_label = "Proceed Anyway"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        props = context.scene.usd_pipeline_publish
        props.pending_warnings = ""
        props.is_validated = True
        self.report({"INFO"}, "Warnings accepted. Publish is now enabled.")
        return {"FINISHED"}


class USDPIPELINE_OT_publish_model_usd(bpy.types.Operator):
    bl_idname = "usdpipeline.publish_model_usd"
    bl_label = "Publish Model USD"
    bl_options = {"REGISTER"}

    def execute(self, context):
        props = context.scene.usd_pipeline_publish

        if not props.is_validated:
            self.report({"ERROR"}, "Publish is disabled until validation passes.")
            return {"CANCELLED"}

        try:
            output_path = export_usd(props)
        except Exception as exc:
            self.report({"ERROR"}, f"USD export failed: {exc}")
            return {"CANCELLED"}

        props.is_validated = False
        props.pending_warnings = ""
        self.report({"INFO"}, f"Published USD: {output_path}")
        return {"FINISHED"}


class USDPIPELINE_PT_publish_panel(bpy.types.Panel):
    bl_label = "USD Pipeline Publisher"
    bl_idname = "USDPIPELINE_PT_publish_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "USD Pipeline"

    def draw(self, context):
        layout = self.layout
        props = context.scene.usd_pipeline_publish

        layout.prop(props, "project_root")
        layout.prop(props, "source_collection")

        if props.source_collection:
            derived_name = sanitize_name(props.source_collection.name)
            box = layout.box()
            box.label(text=f"Asset: {derived_name}")

        layout.separator()

        if props.pending_warnings:
            warning_box = layout.box()
            warning_box.label(text="Publish Warnings", icon="ERROR")
            warning_box.label(text="The file can be published, but review these first:")
            warning_box.separator()

            current_category = None
            for warning in props.pending_warnings.split("\n"):
                line = warning.strip()
                if not line:
                    continue
                if line.startswith("[") and line.endswith("]"):
                    current_category = line[1:-1]
                    warning_box.separator()
                    warning_box.label(text=current_category)
                else:
                    row = warning_box.row()
                    row.label(text=line, icon="DOT")

            warning_box.separator()
            row = warning_box.row(align=True)
            row.operator("usdpipeline.proceed_with_warnings", icon="CHECKMARK")
            row.operator("usdpipeline.cancel_warning_publish", icon="CANCEL")

            layout.separator()

        validate_label = "Validated" if props.is_validated else "Validate"
        validate_icon = "CHECKMARK" if props.is_validated else "FILE_REFRESH"
        layout.operator("usdpipeline.validate_publish", text=validate_label, icon=validate_icon)

        row = layout.row()
        row.enabled = props.is_validated
        row.operator("usdpipeline.publish_model_usd", icon="EXPORT")

        if props.project_root and props.source_collection:
            asset_name = sanitize_name(props.source_collection.name)
            output = Path(props.project_root) / "assets" / asset_name / "model" / "usd" / f"{asset_name}_model.usdc"
            box = layout.box()
            box.label(text="Output:")
            box.label(text=str(output))


classes = (
    USDPIPELINE_PublishProperties,
    USDPIPELINE_OT_validate_publish,
    USDPIPELINE_OT_cancel_warning_publish,
    USDPIPELINE_OT_proceed_with_warnings,
    USDPIPELINE_OT_publish_model_usd,
    USDPIPELINE_PT_publish_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.usd_pipeline_publish = bpy.props.PointerProperty(type=USDPIPELINE_PublishProperties)


def unregister():
    if hasattr(bpy.types.Scene, "usd_pipeline_publish"):
        del bpy.types.Scene.usd_pipeline_publish
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
