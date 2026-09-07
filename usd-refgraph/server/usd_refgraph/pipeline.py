"""Read the pipeline bookkeeping that publishing embeds in each layer.

Every published layer carries its own record in `customLayerData`, written by
the USD Publisher HDA:

    artist                "havard"
    status                "placeholder" | "production_ready" | "locked"
    comment               free text
    hip_file              "workfile_havard_v001.hip"
    rop_path              "/stage/Bob_Lookdev/mz_usd_rop2"
    export_datetime_unix  "1788769845"

There is no project-level file: the files *are* the database. Combined with the
naming convention, which says what entity and block a file belongs to, that is
enough to rebuild the whole production picture.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Status = Literal["placeholder", "production_ready", "locked", "unknown"]

#: The publisher's own vocabulary, weakest first. Order is meaningful: it is
#: how an entity's overall state is rolled up from its parts.
STATUS_ORDER: list[Status] = ["placeholder", "production_ready", "locked"]

#: Earlier spellings, kept so older publishes still read correctly. The tool
#: that preceded this one used wip/ready/final.
STATUS_ALIASES: dict[str, Status] = {
    "placeholder": "placeholder",
    "production_ready": "production_ready",
    "productionready": "production_ready",
    "locked": "locked",
    "wip": "placeholder",
    "in_progress": "placeholder",
    "not_started": "placeholder",
    "ready": "production_ready",
    "final": "locked",
    "published": "locked",
    "approved": "locked",
}

STATUS_LABELS: dict[Status, str] = {
    "placeholder": "Placeholder",
    "production_ready": "Production ready",
    "locked": "Locked",
    "unknown": "No status",
}


def normalise_status(value: Any) -> tuple[Status, str | None]:
    """Map an authored status onto the vocabulary, keeping the original."""
    if value is None:
        return "unknown", None
    raw = str(value).strip()
    if not raw:
        return "unknown", None
    return STATUS_ALIASES.get(raw.lower().replace("-", "_"), "unknown"), raw


def status_rank(status: Status) -> int:
    """Position in the weakest-to-strongest order; unknown sorts weakest."""
    return STATUS_ORDER.index(status) if status in STATUS_ORDER else -1


def rollup_status(statuses: list[Status]) -> Status:
    """An entity is only as finished as its least finished part."""
    known = [s for s in statuses if s != "unknown"]
    if not known:
        return "unknown"
    return min(known, key=status_rank)


@dataclass
class PipelineRecord:
    """One published layer's bookkeeping."""

    artist: str | None = None
    status: Status = "unknown"
    statusRaw: str | None = None
    comment: str | None = None
    hipFile: str | None = None
    ropPath: str | None = None
    #: Publish time in epoch milliseconds, from `export_datetime_unix`.
    exportedAt: int | None = None
    #: Keys we did not recognise, so nothing in the file is silently dropped.
    extra: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"status": self.status}
        for key in ("artist", "statusRaw", "comment", "hipFile", "ropPath", "exportedAt"):
            value = getattr(self, key)
            if value not in (None, ""):
                out[key] = value
        if self.extra:
            out["extra"] = self.extra
        return out

    @property
    def is_empty(self) -> bool:
        return (
            self.artist is None
            and self.status == "unknown"
            and not self.comment
            and self.hipFile is None
        )


#: customLayerData keys we lift into typed fields.
KNOWN_KEYS = {
    "artist",
    "status",
    "comment",
    "hip_file",
    "rop_path",
    "export_datetime_unix",
}


def read_record(custom_layer_data: dict[str, Any] | None) -> PipelineRecord:
    """Lift a layer's `customLayerData` into a typed record."""
    record = PipelineRecord()
    if not custom_layer_data:
        return record

    data = dict(custom_layer_data)

    artist = data.get("artist")
    if artist is not None and str(artist).strip():
        record.artist = str(artist).strip()

    record.status, record.statusRaw = normalise_status(data.get("status"))

    comment = data.get("comment")
    if comment is not None and str(comment).strip():
        record.comment = str(comment).strip()

    hip = data.get("hip_file")
    if hip is not None and str(hip).strip():
        record.hipFile = str(hip).strip()

    rop = data.get("rop_path")
    if rop is not None and str(rop).strip():
        record.ropPath = str(rop).strip()

    record.exportedAt = _epoch_ms(data.get("export_datetime_unix"))

    extra = {
        str(k): str(v)
        for k, v in data.items()
        if k not in KNOWN_KEYS and v is not None and str(v).strip()
    }
    if extra:
        record.extra = extra

    return record


def _epoch_ms(value: Any) -> int | None:
    """`export_datetime_unix` is authored as a string of whole seconds."""
    if value is None:
        return None
    try:
        seconds = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if seconds <= 0:
        return None
    return int(seconds * 1000)
