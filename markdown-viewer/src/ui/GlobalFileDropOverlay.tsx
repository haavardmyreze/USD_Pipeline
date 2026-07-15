import { useEffect, useRef, useState } from 'react'
import { PlusIcon } from './icons'

type GlobalFileDropOverlayProps = {
  onImportFile: (file: File) => void | Promise<void>
}

function isFileDrag(event: DragEvent) {
  const types = event.dataTransfer?.types
  if (!types) {
    return false
  }

  return Array.from(types).includes('Files')
}

export function GlobalFileDropOverlay({ onImportFile }: GlobalFileDropOverlayProps) {
  const [active, setActive] = useState(false)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    const resetDrag = () => {
      dragDepthRef.current = 0
      setActive(false)
    }

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return
      }

      event.preventDefault()
      dragDepthRef.current += 1
      setActive(true)
    }

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return
      }

      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      setActive(true)
    }

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setActive(false)
      }
    }

    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return
      }

      event.preventDefault()
      resetDrag()

      const file = event.dataTransfer?.files?.[0]
      if (file) {
        void onImportFile(file)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('blur', resetDrag)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('blur', resetDrag)
    }
  }, [onImportFile])

  if (!active) {
    return null
  }

  return (
    <div className="global-drop-overlay" role="presentation">
      <div className="global-drop-panel" role="status" aria-live="polite">
        <div className="global-drop-icon" aria-hidden="true">
          <PlusIcon />
        </div>
        <p className="global-drop-title">Drop to open</p>
        <p className="global-drop-copy">Release anywhere to import your file</p>
      </div>
    </div>
  )
}
