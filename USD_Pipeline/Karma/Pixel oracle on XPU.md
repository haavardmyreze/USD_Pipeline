---
type: finding
status: observed
houdini:
engine: XPU
summary: The uniform pixel oracle renders much faster than variance on XPU.
---

# Pixel oracle on XPU

## Finding

- Switching the pixel oracle from variance to uniform made XPU renders much faster.
- Others report the same on the SideFX forum. SideFX says the variance check has overhead on XPU.

## Test

- Not yet measured at matched noise. Uniform sends every pixel the full sample count, so at the same settings it is never noisier.
- To confirm: lower uniform's path traced samples until the noise matches variance, then compare times.
- Also time variance with `KARMA_XPU_NUM_PER_DEVICE_BLENDING_THREADS` at 2, 3 and 4. If that closes the gap, the finding is the variable, not the oracle.
- Time with husk, not the viewport. Record the Houdini build, the GPUs and the scene.

## Consequence

- [[Render settings]] uses the uniform oracle until this is tested.

## Sources

- [Forum: variance oracle slower on XPU](https://sidefx.com/forum/post/430566)
