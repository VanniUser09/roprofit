export const BRAND_GREEN: [number, number, number, number] = [0.13, 0.77, 0.37, 1]

export type ModelViewerElement = HTMLElement & {
  model?: {
    materials: {
      pbrMetallicRoughness: {
        setBaseColorFactor: (rgba: [number, number, number, number]) => void
        setMetallicFactor: (value: number) => void
        setRoughnessFactor: (value: number) => void
      }
    }[]
  }
}

function tintModel(el: ModelViewerElement, rgba: [number, number, number, number]) {
  const apply = () => {
    const material = el.model?.materials[0]?.pbrMetallicRoughness
    material?.setBaseColorFactor(rgba)
    // Matte finish: obj2gltf's default material is glossy, which washes out flat colors under studio lighting.
    material?.setMetallicFactor(0)
    material?.setRoughnessFactor(1)
  }
  el.addEventListener("load", apply)
  return () => el.removeEventListener("load", apply)
}

export function attachModelViewer(
  el: ModelViewerElement | null,
  options: { interactive?: boolean; tint?: [number, number, number, number] } = {}
) {
  if (!el) return

  const cleanups: (() => void)[] = []
  if (options.tint) cleanups.push(tintModel(el, options.tint))

  if (options.interactive) {
    const resumeSpin = () => {
      el.removeAttribute("auto-rotate")
      el.setAttribute("auto-rotate", "")
    }
    el.addEventListener("pointerup", resumeSpin)
    el.addEventListener("pointercancel", resumeSpin)
    cleanups.push(() => {
      el.removeEventListener("pointerup", resumeSpin)
      el.removeEventListener("pointercancel", resumeSpin)
    })
  }

  return () => cleanups.forEach((cleanup) => cleanup())
}
