"""
Studio HIP saver tool for Houdini.

Entry points:
- studio_save_new(): shelf tool for first save
- studio_save_ctrl_s(): Ctrl+S override handler
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional, Tuple

import hou

try:
    from PySide2 import QtCore, QtWidgets  # type: ignore
except ImportError:
    try:
        # Preferred fallback in Houdini builds where PySide modules are not directly exposed.
        from hutil.Qt import QtCore, QtWidgets  # type: ignore
    except ImportError:
        # Final fallback for environments exposing Qt6 directly.
        from PySide6 import QtCore, QtWidgets  # type: ignore


SIDECAR_NAME = ".studiomanaged"
PIPELINE_JSON_NAME = "pipeline.json"

ASSET_TASKS = ["model", "rig", "lookdev", "assembly"]
SET_TASKS = ["dressing", "lighting", "lookdev", "fx"]
SHOT_TASKS = ["layout", "anim", "fx", "lighting"]
ASSET_PREFIXES = ["char", "prop", "env", "veh", "fx"]
SET_PREFIX = "set"

ARTIST_RE = re.compile(r"^[a-z0-9]{2,}$")
DESCRIPTOR_RE = re.compile(r"^[a-z0-9-]+$")
VERSION_RE = re.compile(r"^v\d{3}$")
ASSET_SET_NAME_RE = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
SHOT_NAME_RE = re.compile(r"^[a-z0-9]+_[0-9]{4}$")


class Category(str, Enum):
    ASSET = "Asset"
    SET = "Set"
    SHOT = "Shot"


@dataclass
class ParsedHipName:
    category: Category
    name: str
    task: str
    descriptor: str
    artist: str
    version: str


@dataclass
class PipelineData:
    project_root: str
    software_houdini: str
    team: List[str]
    assets: List[str]
    sets: List[str]
    shots: List[str]


def _normalize(path: str) -> str:
    return os.path.normpath(path).replace("\\", "/")


def _is_valid_artist(value: str) -> bool:
    return bool(ARTIST_RE.fullmatch(value))


def _descriptor_error(value: str) -> Optional[str]:
    if not value:
        return None
    if "_" in value:
        return "Descriptor cannot contain underscores."
    if " " in value:
        return "Descriptor cannot contain spaces."
    if value.startswith("-") or value.endswith("-"):
        return "Descriptor cannot start or end with a hyphen."
    if "--" in value:
        return "Descriptor cannot contain double hyphens."
    if not DESCRIPTOR_RE.fullmatch(value):
        return "Descriptor allows lowercase letters, numbers, and hyphens only."
    return None


def _artist_error(value: str) -> Optional[str]:
    if not value:
        return "Artist is required."
    if not _is_valid_artist(value):
        return "Artist must be lowercase alphanumeric only, min 2 chars."
    return None


def _name_error(category: Category, value: str) -> Optional[str]:
    if not value:
        return "Name is required."
    if "__" in value:
        return "Name cannot contain double underscores."
    if category == Category.SHOT:
        if not SHOT_NAME_RE.fullmatch(value):
            return "Shot name must be <sequence>_<shot>, e.g. neon_0010."
        return None
    if not ASSET_SET_NAME_RE.fullmatch(value):
        return "Name must be lowercase alphanumeric words separated by single underscores."
    return None


def _default_hip_extension() -> str:
    try:
        license_category = hou.licenseCategory()
    except Exception:  # pylint: disable=broad-except
        return ".hip"

    indie_enum = getattr(getattr(hou, "licenseCategoryType", object), "Indie", None)
    apprentice_enum = getattr(getattr(hou, "licenseCategoryType", object), "Apprentice", None)
    if indie_enum is not None and license_category == indie_enum:
        return ".hiplc"
    if apprentice_enum is not None and license_category == apprentice_enum:
        return ".hipnc"

    category_name = str(license_category).lower()
    if "indie" in category_name:
        return ".hiplc"
    if "apprentice" in category_name or "noncommercial" in category_name:
        return ".hipnc"
    return ".hip"


def _hip_extension_from_path(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in {".hip", ".hiplc", ".hipnc"}:
        return ext
    return _default_hip_extension()


def _is_unsaved_hip(path: str) -> bool:
    if not path:
        return True
    base = os.path.basename(path).lower()
    return base.startswith("untitled.")


def _find_project_root(start_path: str) -> Optional[str]:
    cursor = os.path.abspath(start_path)
    if os.path.isfile(cursor):
        cursor = os.path.dirname(cursor)
    while True:
        candidate = os.path.join(cursor, PIPELINE_JSON_NAME)
        if os.path.isfile(candidate):
            return cursor
        parent = os.path.dirname(cursor)
        if parent == cursor:
            return None
        cursor = parent


def _load_pipeline_data(project_root: str) -> PipelineData:
    pipeline_path = os.path.join(project_root, PIPELINE_JSON_NAME)
    with open(pipeline_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    assets = [entry["name"] for entry in data.get("assets", []) if "name" in entry]
    sets = [entry["name"] for entry in data.get("sets", []) if "name" in entry]
    shots: List[str] = []
    if isinstance(data.get("shots"), list):
        for shot in data.get("shots", []):
            seq_code = shot.get("sequence")
            shot_number = shot.get("shot")
            if seq_code and shot_number:
                shots.append(f"{seq_code}_{shot_number}")
    else:
        for sequence in data.get("sequences", []):
            seq_code = sequence.get("code")
            if not seq_code:
                continue
            for shot in sequence.get("shots", []):
                shot_number = shot.get("shot")
                if shot_number:
                    shots.append(f"{seq_code}_{shot_number}")

    software = data.get("software", {})
    return PipelineData(
        project_root=project_root,
        software_houdini=str(software.get("houdini", "")).strip(),
        team=[str(name) for name in data.get("team", [])],
        assets=sorted(assets),
        sets=sorted(sets),
        shots=sorted(shots),
    )


def _category_from_path(path: str) -> Optional[Category]:
    parts = _normalize(path).split("/")
    if "assets" in parts:
        return Category.ASSET
    if "sets" in parts:
        return Category.SET
    if "shots" in parts:
        return Category.SHOT
    return None


def _split_filename_tokens(filename: str) -> List[str]:
    stem, ext = os.path.splitext(filename)
    if ext.lower() not in {".hip", ".hiplc", ".hipnc"}:
        raise ValueError("Current file is not a HIP file.")
    return stem.split("_")


def _parse_hip_filename(filename: str, category: Category, expected_name: str) -> ParsedHipName:
    tokens = _split_filename_tokens(filename)
    if len(tokens) < 4:
        raise ValueError("Filename does not match studio naming convention.")
    version = tokens[-1]
    artist = tokens[-2]
    task = tokens[-3]
    descriptor_tokens = tokens[:-3]

    if not VERSION_RE.fullmatch(version):
        raise ValueError("Filename version token is invalid.")

    if category == Category.SHOT:
        expected_tokens = expected_name.split("_")
        if len(expected_tokens) != 2:
            raise ValueError("Shot context is invalid.")
        if len(descriptor_tokens) < 2:
            raise ValueError("Shot filename is too short.")
        seq, shot = descriptor_tokens[0], descriptor_tokens[1]
        if [seq, shot] != expected_tokens:
            raise ValueError("Filename does not match current shot context.")
        descriptor = "_".join(descriptor_tokens[2:])
    else:
        name_tokens = expected_name.split("_")
        if descriptor_tokens[: len(name_tokens)] != name_tokens:
            raise ValueError("Filename does not match current context name.")
        descriptor = "_".join(descriptor_tokens[len(name_tokens) :])

    if descriptor and "_" in descriptor:
        raise ValueError("Descriptor cannot include underscores.")

    return ParsedHipName(
        category=category,
        name=expected_name,
        task=task,
        descriptor=descriptor,
        artist=artist,
        version=version,
    )


def _increment_version(version: str) -> str:
    num = int(version[1:]) + 1
    return f"v{num:03d}"


def _build_filename(
    parsed: ParsedHipName, version_override: Optional[str] = None, file_extension: Optional[str] = None
) -> str:
    version = version_override or parsed.version
    if parsed.category == Category.SHOT:
        seq, shot = parsed.name.split("_", 1)
        tokens = [seq, shot, parsed.task]
    else:
        tokens = [parsed.name, parsed.task]
    if parsed.descriptor:
        tokens.append(parsed.descriptor)
    tokens.extend([parsed.artist, version])
    name = "_".join(tokens)
    if "__" in name:
        raise ValueError("Filename cannot contain double underscores.")
    ext = file_extension or _default_hip_extension()
    return f"{name}{ext}"


def _destination_dir(project_root: str, parsed: ParsedHipName) -> str:
    if parsed.category == Category.ASSET:
        return os.path.join(project_root, "assets", parsed.name, parsed.task, "hip")
    if parsed.category == Category.SET:
        return os.path.join(project_root, "sets", parsed.name, parsed.task, "hip")
    seq, shot = parsed.name.split("_", 1)
    return os.path.join(project_root, "shots", seq, shot, parsed.task, "hip")


def _build_destination(
    project_root: str,
    parsed: ParsedHipName,
    version_override: Optional[str] = None,
    file_extension: Optional[str] = None,
) -> str:
    filename = _build_filename(parsed, version_override=version_override, file_extension=file_extension)
    return os.path.join(_destination_dir(project_root, parsed), filename)


def _create_sidecar_for_path(hip_path: str) -> None:
    folder = os.path.dirname(hip_path)
    os.makedirs(folder, exist_ok=True)
    marker = os.path.join(folder, SIDECAR_NAME)
    if not os.path.exists(marker):
        with open(marker, "w", encoding="utf-8"):
            pass


def _show_error(message: str) -> None:
    hou.ui.displayMessage(message, severity=hou.severityType.Error, title="Studio Save")


class BaseSaveDialog(QtWidgets.QDialog):
    def __init__(self, pipeline: PipelineData, parent: Optional[QtWidgets.QWidget] = None):
        super().__init__(parent=parent)
        self.pipeline = pipeline
        self.setMinimumWidth(900)
        self.setStyleSheet(
            """
            QLineEdit[readOnly="true"] {
                background-color: #3a3a3a;
                color: #c9c9c9;
                border: 1px solid #5c5c5c;
            }
            QComboBox:disabled, QLineEdit:disabled {
                background-color: #3a3a3a;
                color: #c9c9c9;
                border: 1px solid #5c5c5c;
            }
            """
        )
        self.main_layout = QtWidgets.QVBoxLayout(self)
        self.warning_label = QtWidgets.QLabel("")
        self.warning_label.setStyleSheet("background:#4f3f1f;color:#ffd27f;padding:6px;border:1px solid #6d5420;")
        self.warning_label.setWordWrap(True)
        self.warning_label.setVisible(False)
        self.main_layout.addWidget(self.warning_label)

        self._build_version_warning()

    def _build_version_warning(self) -> None:
        self.warning_label.setVisible(False)
        self.warning_label.setText("")
        required = self.pipeline.software_houdini
        running = hou.applicationVersionString()
        if required and required != running:
            self.warning_label.setText(
                f"Warning: you are running Houdini {running} but this project requires {required}"
            )
            self.warning_label.setVisible(True)


class NewSaveDialog(BaseSaveDialog):
    def __init__(self, pipeline: Optional[PipelineData], parent: Optional[QtWidgets.QWidget] = None):
        self._empty_pipeline = PipelineData(
            project_root="",
            software_houdini="",
            team=[],
            assets=[],
            sets=[],
            shots=[],
        )
        super().__init__(pipeline or self._empty_pipeline, parent=parent)
        self.setWindowTitle("Studio Save - New File")
        self._save_path: Optional[str] = None
        self._project_valid = bool(pipeline)
        self._target_extension = _default_hip_extension()
        self._build_ui()
        self._refresh_name_and_task()
        self._sync_prefix_visibility()
        self._refresh_preview()

    def _build_ui(self) -> None:
        self.form = QtWidgets.QFormLayout()
        self.main_layout.addLayout(self.form)

        root_wrap = QtWidgets.QHBoxLayout()
        self.project_root_display = QtWidgets.QLineEdit(self.pipeline.project_root)
        self.project_root_display.setReadOnly(True)
        self.browse_button = QtWidgets.QPushButton("Browse")
        self.browse_button.clicked.connect(self._on_browse_project)
        root_wrap.addWidget(self.project_root_display)
        root_wrap.addWidget(self.browse_button)
        container = QtWidgets.QWidget()
        container.setLayout(root_wrap)
        self.form.addRow("Project Root", container)

        self.root_error = QtWidgets.QLabel("")
        self.root_error.setStyleSheet("color:#ff8a8a;")
        self.form.addRow("", self.root_error)

        self.category_combo = QtWidgets.QComboBox()
        self.category_combo.addItems([Category.ASSET.value, Category.SET.value, Category.SHOT.value])
        self.category_combo.currentTextChanged.connect(self._on_context_changed)
        self.form.addRow("Category", self.category_combo)

        self.prefix_combo = QtWidgets.QComboBox()
        self.prefix_combo.currentTextChanged.connect(self._refresh_name_and_task)
        self.prefix_combo.currentTextChanged.connect(self._refresh_preview)
        self.form.addRow("Prefix", self.prefix_combo)
        self.prefix_error = QtWidgets.QLabel("")
        self.prefix_error.setStyleSheet("color:#ff8a8a;")
        self.form.addRow("", self.prefix_error)

        self.name_combo = QtWidgets.QComboBox()
        self.name_combo.setEditable(True)
        self.name_combo.setInsertPolicy(QtWidgets.QComboBox.NoInsert)
        self.name_combo.completer().setCaseSensitivity(QtCore.Qt.CaseInsensitive)
        self.name_combo.currentTextChanged.connect(self._refresh_preview)
        self.form.addRow("Name", self.name_combo)
        self.name_error = QtWidgets.QLabel("")
        self.name_error.setStyleSheet("color:#ff8a8a;")
        self.form.addRow("", self.name_error)

        self.task_combo = QtWidgets.QComboBox()
        self.task_combo.currentTextChanged.connect(self._refresh_preview)
        self.form.addRow("Task", self.task_combo)

        self.descriptor_edit = QtWidgets.QLineEdit()
        self.descriptor_edit.textChanged.connect(self._on_descriptor_changed)
        self.form.addRow("Descriptor", self.descriptor_edit)
        self.descriptor_error = QtWidgets.QLabel("")
        self.descriptor_error.setStyleSheet("color:#ff8a8a;")
        self.form.addRow("", self.descriptor_error)

        self.artist_combo = QtWidgets.QComboBox()
        self.artist_combo.setEditable(True)
        self.artist_combo.setInsertPolicy(QtWidgets.QComboBox.NoInsert)
        self.artist_combo.addItems(sorted(self.pipeline.team))
        self.artist_combo.completer().setCaseSensitivity(QtCore.Qt.CaseInsensitive)
        self.artist_combo.currentTextChanged.connect(self._on_artist_changed)
        self.form.addRow("Artist", self.artist_combo)
        self.artist_error = QtWidgets.QLabel("")
        self.artist_error.setStyleSheet("color:#ff8a8a;")
        self.form.addRow("", self.artist_error)

        self.version_display = QtWidgets.QLineEdit("v001")
        self.version_display.setReadOnly(True)
        self.form.addRow("Version", self.version_display)

        self.filename_preview = QtWidgets.QLineEdit("")
        self.filename_preview.setReadOnly(True)
        self.form.addRow("Assembled filename preview", self.filename_preview)

        self.destination_preview = QtWidgets.QLineEdit("")
        self.destination_preview.setReadOnly(True)
        self.form.addRow("Save destination preview", self.destination_preview)

        button_row = QtWidgets.QHBoxLayout()
        button_row.addStretch(1)
        self.save_button = QtWidgets.QPushButton("Save")
        self.save_button.clicked.connect(self._on_save)
        self.cancel_button = QtWidgets.QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        button_row.addWidget(self.save_button)
        button_row.addWidget(self.cancel_button)
        self.main_layout.addLayout(button_row)

    def _selected_category(self) -> Category:
        return Category(self.category_combo.currentText())

    def _names_for_category(self, category: Category) -> List[str]:
        if not self._project_valid:
            return []
        if category == Category.ASSET:
            prefix = self.prefix_combo.currentText().strip()
            names: List[str] = []
            for full_name in self.pipeline.assets:
                if full_name.startswith(f"{prefix}_"):
                    names.append(full_name[len(prefix) + 1 :])
            return sorted(set(names))
        if category == Category.SET:
            names = []
            for full_name in self.pipeline.sets:
                if full_name.startswith(f"{SET_PREFIX}_"):
                    names.append(full_name[len(SET_PREFIX) + 1 :])
                else:
                    names.append(full_name)
            return sorted(set(names))
        return self.pipeline.shots

    def _tasks_for_category(self, category: Category) -> List[str]:
        if not self._project_valid:
            return []
        if category == Category.ASSET:
            return ASSET_TASKS
        if category == Category.SET:
            return SET_TASKS
        return SHOT_TASKS

    def _refresh_name_and_task(self) -> None:
        category = self._selected_category()
        if self.prefix_combo.count() == 0:
            self._reset_prefix_for_category()
        self._sync_prefix_visibility()
        names = self._names_for_category(category)
        tasks = self._tasks_for_category(category)

        self.name_combo.blockSignals(True)
        typed_name = self.name_combo.currentText().strip()
        self.name_combo.clear()
        self.name_combo.addItems(names)
        if typed_name and typed_name not in names:
            self.name_combo.setEditText(typed_name)
        self.name_combo.blockSignals(False)

        self.task_combo.blockSignals(True)
        self.task_combo.clear()
        self.task_combo.addItems(tasks)
        self.task_combo.blockSignals(False)

    def _on_context_changed(self) -> None:
        self._reset_prefix_for_category()
        self._refresh_name_and_task()
        self._refresh_preview()

    def _reset_prefix_for_category(self) -> None:
        category = self._selected_category()
        self.prefix_combo.blockSignals(True)
        self.prefix_combo.clear()
        if category == Category.ASSET:
            self.prefix_combo.addItems(ASSET_PREFIXES)
        elif category == Category.SET:
            self.prefix_combo.addItem(SET_PREFIX)
        self.prefix_combo.blockSignals(False)

    def _sync_prefix_visibility(self) -> None:
        category = self._selected_category()
        show_prefix = category in {Category.ASSET, Category.SET}
        self.prefix_combo.setVisible(show_prefix)
        self.prefix_error.setVisible(show_prefix)
        prefix_label = self.form.labelForField(self.prefix_combo)
        prefix_error_label = self.form.labelForField(self.prefix_error)
        if prefix_label is not None:
            prefix_label.setVisible(show_prefix)
        if prefix_error_label is not None:
            prefix_error_label.setVisible(show_prefix)

    def _on_browse_project(self) -> None:
        directory = QtWidgets.QFileDialog.getExistingDirectory(self, "Select Project Root", self.pipeline.project_root)
        if not directory:
            return
        test_path = os.path.join(directory, PIPELINE_JSON_NAME)
        if not os.path.isfile(test_path):
            self.root_error.setText("Selected folder does not contain pipeline.json.")
            self._project_valid = False
            self._refresh_preview()
            return
        self.root_error.setText("")
        self.pipeline = _load_pipeline_data(directory)
        self._project_valid = True
        self.project_root_display.setText(directory)
        typed_artist = self.artist_combo.currentText().strip()
        team_sorted = sorted(self.pipeline.team)
        self.artist_combo.blockSignals(True)
        self.artist_combo.clear()
        self.artist_combo.addItems(team_sorted)
        if typed_artist and typed_artist not in team_sorted:
            self.artist_combo.setEditText(typed_artist)
        self.artist_combo.blockSignals(False)
        self._build_version_warning()
        self._refresh_name_and_task()
        self._refresh_preview()

    def _on_descriptor_changed(self) -> None:
        self._refresh_preview()

    def _on_artist_changed(self) -> None:
        self._refresh_preview()

    def _parsed(self) -> Optional[ParsedHipName]:
        name_value = self.name_combo.currentText().strip()
        task = self.task_combo.currentText().strip()
        artist = self.artist_combo.currentText().strip()
        descriptor = self.descriptor_edit.text().strip()
        if not name_value or not task:
            return None
        category = self._selected_category()
        if category == Category.ASSET:
            prefix = self.prefix_combo.currentText().strip()
            name = f"{prefix}_{name_value}" if prefix else name_value
        elif category == Category.SET:
            name = f"{SET_PREFIX}_{name_value}"
        else:
            name = name_value
        return ParsedHipName(
            category=category,
            name=name,
            task=task,
            descriptor=descriptor,
            artist=artist,
            version="v001",
        )

    def _refresh_preview(self) -> None:
        parsed = self._parsed()
        valid = True

        if not self._project_valid:
            self.root_error.setText("Select a project root containing pipeline.json.")
            valid = False
        elif not os.path.isfile(os.path.join(self.pipeline.project_root, PIPELINE_JSON_NAME)):
            self.root_error.setText("Project root must contain pipeline.json.")
            self._project_valid = False
            valid = False
        else:
            self.root_error.setText("")

        descriptor = self.descriptor_edit.text().strip()
        desc_err = _descriptor_error(descriptor)
        self.descriptor_error.setText(desc_err or "")
        if desc_err:
            valid = False

        category = self._selected_category()
        if category in {Category.ASSET, Category.SET}:
            prefix = self.prefix_combo.currentText().strip()
            if category == Category.ASSET and prefix not in ASSET_PREFIXES:
                self.prefix_error.setText("Select an asset prefix.")
                valid = False
            else:
                self.prefix_error.setText("")
            name_for_validation = self.name_combo.currentText().strip()
        else:
            self.prefix_error.setText("")
            name_for_validation = self.name_combo.currentText().strip()

        name_err = _name_error(category, name_for_validation)
        self.name_error.setText(name_err or "")
        if name_err:
            valid = False

        artist = self.artist_combo.currentText().strip()
        art_err = _artist_error(artist)
        self.artist_error.setText(art_err or "")
        if art_err:
            valid = False

        if parsed is None:
            valid = False
            self.filename_preview.setText(f"<name>_<task>[_descriptor]_<artist>_v001{self._target_extension}")
            self.destination_preview.setText(f"<project>/.../hip/<filename>{self._target_extension}")
            self.save_button.setEnabled(False)
            return

        try:
            filename = _build_filename(parsed, file_extension=self._target_extension)
            path = _build_destination(self.pipeline.project_root, parsed, file_extension=self._target_extension)
            self.filename_preview.setText(filename)
            self.destination_preview.setText(_normalize(path))
            self._save_path = path
        except Exception as exc:  # pylint: disable=broad-except
            self.filename_preview.setText(f"Invalid: {exc}")
            self.destination_preview.setText("<invalid>")
            self._save_path = None
            valid = False

        self.save_button.setEnabled(valid and self._save_path is not None)

    def _on_save(self) -> None:
        if not self._save_path:
            return
        os.makedirs(os.path.dirname(self._save_path), exist_ok=True)
        hou.hipFile.save(file_name=self._save_path)
        _create_sidecar_for_path(self._save_path)
        self.accept()


class ManagedSaveDialog(BaseSaveDialog):
    def __init__(
        self,
        pipeline: PipelineData,
        current_path: str,
        parsed: ParsedHipName,
        parent: Optional[QtWidgets.QWidget] = None,
    ):
        super().__init__(pipeline, parent=parent)
        self.setWindowTitle("Studio Save")
        self.current_path = current_path
        self._target_extension = _hip_extension_from_path(current_path)
        self.original = parsed
        self.pending_mode = "save"
        self.pending_save_path = current_path
        self._build_ui()
        self._refresh_preview()

    def _build_ui(self) -> None:
        form = QtWidgets.QFormLayout()
        self.main_layout.addLayout(form)

        self.current_file_display = QtWidgets.QLineEdit(_normalize(self.current_path))
        self.current_file_display.setReadOnly(True)
        form.addRow("Current file", self.current_file_display)

        self.category_display = QtWidgets.QLineEdit(self.original.category.value)
        self.category_display.setReadOnly(True)
        form.addRow("Category", self.category_display)

        self.name_display = QtWidgets.QLineEdit(self.original.name)
        self.name_display.setReadOnly(True)
        form.addRow("Name", self.name_display)

        self.task_display = QtWidgets.QLineEdit(self.original.task)
        self.task_display.setReadOnly(True)
        form.addRow("Task", self.task_display)

        self.descriptor_edit = QtWidgets.QLineEdit(self.original.descriptor)
        self.descriptor_edit.textChanged.connect(self._refresh_preview)
        form.addRow("Descriptor", self.descriptor_edit)
        self.descriptor_error = QtWidgets.QLabel("")
        self.descriptor_error.setStyleSheet("color:#ff8a8a;")
        form.addRow("", self.descriptor_error)

        self.artist_combo = QtWidgets.QComboBox()
        self.artist_combo.setEditable(True)
        self.artist_combo.setInsertPolicy(QtWidgets.QComboBox.NoInsert)
        self.artist_combo.addItems(sorted(self.pipeline.team))
        self.artist_combo.setEditText(self.original.artist)
        self.artist_combo.completer().setCaseSensitivity(QtCore.Qt.CaseInsensitive)
        self.artist_combo.currentTextChanged.connect(self._refresh_preview)
        form.addRow("Artist", self.artist_combo)
        self.artist_error = QtWidgets.QLabel("")
        self.artist_error.setStyleSheet("color:#ff8a8a;")
        form.addRow("", self.artist_error)

        self.version_display = QtWidgets.QLineEdit(self.original.version)
        self.version_display.setReadOnly(True)
        form.addRow("Version", self.version_display)

        self.filename_preview = QtWidgets.QLineEdit("")
        self.filename_preview.setReadOnly(True)
        form.addRow("Assembled filename preview", self.filename_preview)

        self.destination_preview = QtWidgets.QLineEdit("")
        self.destination_preview.setReadOnly(True)
        form.addRow("Save destination preview", self.destination_preview)

        button_row = QtWidgets.QHBoxLayout()
        button_row.addStretch(1)
        self.save_button = QtWidgets.QPushButton("Save")
        self.save_button.clicked.connect(self._on_save_current)
        self.increment_button = QtWidgets.QPushButton("Save Incremental")
        self.increment_button.clicked.connect(self._on_save_incremental)
        self.cancel_button = QtWidgets.QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        button_row.addWidget(self.save_button)
        button_row.addWidget(self.increment_button)
        button_row.addWidget(self.cancel_button)
        self.main_layout.addLayout(button_row)

    def _active_parsed(self) -> ParsedHipName:
        return ParsedHipName(
            category=self.original.category,
            name=self.original.name,
            task=self.original.task,
            descriptor=self.descriptor_edit.text().strip(),
            artist=self.artist_combo.currentText().strip(),
            version=self.original.version,
        )

    def _refresh_preview(self) -> None:
        parsed = self._active_parsed()
        valid = True

        desc_err = _descriptor_error(parsed.descriptor)
        self.descriptor_error.setText(desc_err or "")
        if desc_err:
            valid = False

        art_err = _artist_error(parsed.artist)
        self.artist_error.setText(art_err or "")
        if art_err:
            valid = False

        try:
            increment_filename = _build_filename(
                parsed, version_override=_increment_version(parsed.version), file_extension=self._target_extension
            )
            increment_path = _build_destination(
                self.pipeline.project_root,
                parsed,
                version_override=_increment_version(parsed.version),
                file_extension=self._target_extension,
            )
            if self.pending_mode == "incremental":
                self.filename_preview.setText(increment_filename)
                self.destination_preview.setText(_normalize(increment_path))
                self.pending_save_path = increment_path
            else:
                self.filename_preview.setText(os.path.basename(self.current_path))
                self.destination_preview.setText(_normalize(self.current_path))
                self.pending_save_path = self.current_path
        except Exception as exc:  # pylint: disable=broad-except
            self.filename_preview.setText(f"Invalid: {exc}")
            self.destination_preview.setText("<invalid>")
            valid = False

        self.save_button.setEnabled(valid)
        self.increment_button.setEnabled(valid)

    def _on_save_current(self) -> None:
        self.pending_mode = "save"
        self._refresh_preview()
        if not self.save_button.isEnabled():
            return
        hou.hipFile.save(file_name=self.current_path)
        self.accept()

    def _on_save_incremental(self) -> None:
        self.pending_mode = "incremental"
        self._refresh_preview()
        if not self.increment_button.isEnabled():
            return
        os.makedirs(os.path.dirname(self.pending_save_path), exist_ok=True)
        hou.hipFile.save(file_name=self.pending_save_path)
        _create_sidecar_for_path(self.pending_save_path)
        self.accept()


def _extract_context_from_path(current_path: str) -> Tuple[Category, str]:
    normalized = _normalize(current_path)
    parts = normalized.split("/")
    category = _category_from_path(normalized)
    if category is None:
        raise ValueError("Could not infer category from current file path.")
    if category == Category.ASSET:
        idx = parts.index("assets")
        return category, parts[idx + 1]
    if category == Category.SET:
        idx = parts.index("sets")
        return category, parts[idx + 1]
    idx = parts.index("shots")
    return category, f"{parts[idx + 1]}_{parts[idx + 2]}"


def _qt_parent() -> Optional[QtWidgets.QWidget]:
    try:
        return hou.qt.mainWindow()
    except Exception:  # pylint: disable=broad-except
        return None


def studio_save_new() -> None:
    dialog = NewSaveDialog(None, parent=_qt_parent())
    dialog.exec_()


def _open_managed_dialog(current_path: str) -> bool:
    project_root = _find_project_root(current_path)
    if not project_root:
        _show_error("Could not find pipeline.json by walking up from current HIP. Save blocked.")
        return False

    pipeline = _load_pipeline_data(project_root)

    try:
        category, context_name = _extract_context_from_path(current_path)
        parsed = _parse_hip_filename(os.path.basename(current_path), category, context_name)
    except Exception as exc:  # pylint: disable=broad-except
        _show_error(f"Could not parse current HIP name/context: {exc}")
        return False

    dialog = ManagedSaveDialog(pipeline, current_path=current_path, parsed=parsed, parent=_qt_parent())
    dialog.exec_()
    return True


def studio_save_ctrl_s() -> None:
    current_path = hou.hipFile.path()
    if _is_unsaved_hip(current_path):
        hou.hipFile.save()
        return

    current_path = os.path.abspath(current_path)
    marker_path = os.path.join(os.path.dirname(current_path), SIDECAR_NAME)
    if not os.path.isfile(marker_path):
        hou.hipFile.save()
        return

    _open_managed_dialog(current_path)


def studio_save_shelf() -> None:
    current_path = hou.hipFile.path()
    if not _is_unsaved_hip(current_path):
        current_path = os.path.abspath(current_path)
        marker_path = os.path.join(os.path.dirname(current_path), SIDECAR_NAME)
        if os.path.isfile(marker_path):
            _open_managed_dialog(current_path)
            return
    studio_save_new()


def run_from_shelf() -> None:
    """Shelf tool entry point."""
    studio_save_shelf()


def run_from_ctrl_s() -> None:
    """Keyboard shortcut entry point."""
    studio_save_ctrl_s()
