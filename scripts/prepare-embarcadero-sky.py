import cv2
import numpy as np
from PIL import Image

source = 'public/embarcadero/environment/qwantani-sunset-1k.hdr'
target = 'public/embarcadero/environment/qwantani-sunset-background.webp'
bgr = cv2.imread(source, cv2.IMREAD_UNCHANGED)
if bgr is None:
    raise RuntimeError('HDR sky not found')
linear = bgr[:, :, ::-1] * 0.22
mapped = np.clip(linear * (2.51 * linear + 0.03) / (linear * (2.43 * linear + 0.59) + 0.14), 0, 1)
srgb = np.where(mapped <= 0.0031308, mapped * 12.92, 1.055 * np.power(mapped, 1 / 2.4) - 0.055)
h, w = srgb.shape[:2]
u = (np.arange(w)[None, :] / w)
v = (np.arange(h)[:, None] / h)
du = np.minimum(np.abs(u - 0.5996), 1 - np.abs(u - 0.5996))
glow = np.exp(-((du / 0.14) ** 2 + ((v - 0.4648) / 0.11) ** 2))
weight = np.clip((0.515 - v) / 0.23, 0, 1) * 0.68 * (1 - 0.84 * glow)
height = np.clip((0.5 - v) / 0.45, 0, 1)
low = np.array([0.61, 0.75, 0.85]); high = np.array([0.28, 0.53, 0.80])
tint = low[None, None, :] * (1 - height[:, :, None]) + high[None, None, :] * height[:, :, None]
output = np.clip(srgb * (1 - weight[:, :, None]) + tint * weight[:, :, None], 0, 1)
Image.fromarray(np.uint8(output * 255 + 0.5)).save(target, 'WEBP', quality=88, method=6)
print(target)
