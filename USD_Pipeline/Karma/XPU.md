---
type: concept
status: draft
summary: What the XPU engine is, what it does not support, and what slows it down.
---

# XPU

XPU renders on the GPU and the CPU together. It is not a replacement for Karma CPU: it trades features for speed.

## Structure

```
devices      one OptiX device per NVIDIA GPU, plus one Embree CPU device
memory       per device, never pooled across GPUs
shaders      MaterialX, USD Preview Surface, some Karma VOPs
convergence  path traced only
```

## Notes

- The CPU device contributes little next to the GPUs. Time machines with and without it.
- Two 24 GB GPUs still give a 24 GB limit for the scene.
- When GPU memory fills, textures are evicted and swapped back in. The render slows sharply without an error. Render stats show memory use.
- Shaders compile for each device the first time, which can take a minute or two after an install or a driver update. The result is cached. Pre-compile Karma XPU Render Kernels, in the Render menu, does it ahead of time.
- Rendering several frames in one husk process pays the compile once.
- Viewport renders are slower than offline renders. Time XPU with husk or an offline render, never in the viewport.
- IPR Reserve Threads at 2 or 3 makes interactive renders more responsive.
- Many AOVs slow XPU down. Raising `KARMA_XPU_NUM_PER_DEVICE_BLENDING_THREADS` above 1 can help.
- Not supported: MaterialX PBR nodes, Ptex, and dome lights with anything but a lat-long map. Other shaders, such as Principled Shader, are converted to USD Preview Surface or fail.
- `KARMA_XPU_DISABLE_OPTIX_DEVICE` and `KARMA_XPU_DISABLE_EMBREE_DEVICE` turn device types off, for testing.

## Sources

- [Karma XPU](https://www.sidefx.com/docs/houdini/solaris/karma_xpu.html)
- [Reducing noise: Karma XPU](https://www.sidefx.com/docs/houdini/solaris/kug/noise_xpu.html)
- [Forum: dual 4090 XPU performance](https://www.sidefx.com/forum/topic/92993/)
