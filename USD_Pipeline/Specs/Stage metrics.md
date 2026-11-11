---
type: spec
status: draft
summary: The units, up axis and timing every published layer states.
---

# Stage metrics

Layer metadata that has to agree across every published file. A mismatch gives no error, only a wrong size or a wrong speed.

## Structure

```
upAxis                "Y"
metersPerUnit         1                           one unit is one metre
timeCodesPerSecond    the project frame rate

startTimeCode         the shot's first frame      shot layers only
endTimeCode           the shot's last frame       shot layers only
```

## Notes

- Every published layer states the up axis, the units and the frame rate.
- USD's own default is centimetres, so `metersPerUnit` has to be authored. It cannot be left out.
- The shot's frame range is authored by the layout block. Every other block takes it from the composed stage.
- In Solaris, all of these are set on the Configure Layer LOP.

## Open

- Where are per-project values recorded, such as the frame rate and the sequence codes?
