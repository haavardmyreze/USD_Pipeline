---
type: concept
status: draft
summary: How Karma decides how many samples each pixel gets.
---

# Sampling

How Karma spends samples. Our settings are in [[Render settings]].

## Structure

```
primary samples      rays per pixel; edges, DOF, motion blur, hair
path traced samples  the main noise control on XPU
pixel oracle         variance (default) | uniform
```

## Notes

- The variance oracle stops sampling a pixel once it agrees with its neighbours, within the Variance Threshold.
- The uniform oracle gives every pixel the same number of samples. It wins when DOF or motion blur dominates, since every pixel needs full sampling anyway.
- XPU has used the pixel oracle for path traced samples since Houdini 20.5.
- Measuring variance has a cost. On XPU it can outweigh the samples it saves: see [[Pixel oracle on XPU]].
- The `primarysamples` AOV shows how many samples each pixel got.
- Min and Max Secondary Samples do nothing on XPU.

## Sources

- [Karma User Guide: Sampling](https://www.sidefx.com/docs/houdini/solaris/kug/sampling.html)
- [Reducing noise: Karma CPU](https://www.sidefx.com/docs/houdini/solaris/kug/noise_cpu.html)
