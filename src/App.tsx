import {
  AlertTriangle,
  Columns2,
  Eye,
  EyeOff,
  Layers3,
  Maximize2,
  Pause,
  Play,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'

type ImageAsset = {
  bitmap: ImageBitmap
  displayHeight: number
  displayWidth: number
  file: File
  height: number
  name: string
  size: number
  url: string
  width: number
}

type Mode = 'side-by-side' | 'blink' | 'difference'

type PairSource = 'good' | 'bad' | 'custom'

type PreviewQuality = '25' | '50' | '75' | 'original'

type DiffResult = {
  height: number
  imageData: ImageData
  width: number
}

type DiffAnalysis = {
  baseGray: Uint8ClampedArray
  colorDifferences: Float32Array
  height: number
  scale: number
  width: number
}

type PanPoint = {
  x: number
  y: number
}

type SyncPointer = {
  source: 'image-1' | 'image-2'
  x: number
  y: number
}

const modes: Array<{ description: string; id: Mode; label: string; icon: typeof Columns2 }> = [
  {
    description: 'Compare both images next to each other.',
    id: 'side-by-side',
    label: 'Side by side',
    icon: Columns2,
  },
  {
    description: 'Rapidly toggle between images.',
    id: 'blink',
    label: 'Blink',
    icon: Eye,
  },
  {
    description: 'Show changed areas in red.',
    id: 'difference',
    label: 'Difference',
    icon: Layers3,
  },
]

const previewQualityOptions: Array<{ id: PreviewQuality; label: string }> = [
  { id: '25', label: '25%' },
  { id: '50', label: '50%' },
  { id: '75', label: '75%' },
  { id: 'original', label: 'Original' },
]

const goodExamples = [
  {
    name: 'Frame shift example 1.webp',
    path: '/examples/frame-example-1.webp',
  },
  {
    name: 'Frame shift example 2.webp',
    path: '/examples/frame-example-2.webp',
  },
]

const badExamples = [
  {
    name: 'Bad frame shift example 1.webp',
    path: '/examples/bad-frame-example-1.webp',
  },
  {
    name: 'Bad frame shift example 2.webp',
    path: '/examples/bad-frame-example-2.webp',
  },
]

const helperText =
  '“Only added people/objects and their natural shadows should be highlighted. If the background, walls, floor, furniture, or fixed scene details light up heavily, check for frame shift, focus shift, exposure change, or white balance shift.”'

const maxColorDistance = Math.sqrt(255 * 255 * 3)
const maxAnalysisPixels = 1_800_000
const maxAnalysisEdge = 2200
const minZoom = 1
const maxZoom = 8
const defaultThreshold = 15
const defaultBlinkSpeed = 250

function App() {
  const [inputImage, setInputImage] = useState<ImageAsset | null>(null)
  const [outputImage, setOutputImage] = useState<ImageAsset | null>(null)
  const [mode, setMode] = useState<Mode>('side-by-side')
  const [threshold, setThreshold] = useState(defaultThreshold)
  const [overlayOpacity, setOverlayOpacity] = useState(72)
  const [blinkSpeed, setBlinkSpeed] = useState(defaultBlinkSpeed)
  const [blinkPlaying, setBlinkPlaying] = useState(true)
  const [blinkShowsOutput, setBlinkShowsOutput] = useState(false)
  const [previewQuality, setPreviewQuality] = useState<PreviewQuality>('75')
  const [activePair, setActivePair] = useState<PairSource>('good')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 })
  const [syncPointer, setSyncPointer] = useState<SyncPointer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerRef = useRef<HTMLElement | null>(null)
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  const wheelDeltaRef = useRef(0)
  const wheelFrameRef = useRef<number | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startPan: PanPoint
    startPointer: PanPoint
  } | null>(null)

  const hasPair = Boolean(inputImage && outputImage)
  const dimensionsMatch =
    Boolean(inputImage && outputImage) &&
    inputImage?.width === outputImage?.width &&
    inputImage?.height === outputImage?.height

  const activeBlinkImage = blinkShowsOutput ? outputImage : inputImage
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
  }, [])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  const applyImagePair = useCallback(
    (firstImage: ImageAsset, secondImage: ImageAsset, source: PairSource) => {
      setError(null)
      setInputImage(firstImage)
      setOutputImage(secondImage)
      setActivePair(source)
      setBlinkShowsOutput(false)
      setThreshold(defaultThreshold)
      resetView()
    },
    [resetView],
  )

  const loadExamplePair = useCallback(
    async (examples: typeof goodExamples, source: PairSource, errorMessage: string) => {
      try {
        const [firstExample, secondExample] = await Promise.all(
          examples.map((example) => loadExampleAsset(example.path, example.name)),
        )
        applyImagePair(firstExample, secondExample, source)
      } catch {
        setError(errorMessage)
      }
    },
    [applyImagePair],
  )

  const loadGoodExample = useCallback(async () => {
    await loadExamplePair(
      goodExamples,
      'good',
      'Good example could not be loaded. Choose two images to compare.',
    )
  }, [loadExamplePair])

  const loadBadExample = useCallback(async () => {
    await loadExamplePair(
      badExamples,
      'bad',
      'Bad example could not be loaded. Choose two images to compare.',
    )
  }, [loadExamplePair])

  useEffect(() => {
    let cancelled = false

    const loadDefaultExamples = async () => {
      try {
        const [firstExample, secondExample] = await Promise.all(
          goodExamples.map((example) => loadExampleAsset(example.path, example.name)),
        )

        if (cancelled) {
          releaseImage(firstExample)
          releaseImage(secondExample)
          return
        }

        applyImagePair(firstExample, secondExample, 'good')
      } catch {
        if (!cancelled) {
          setError('Default examples could not be loaded. Choose two images to compare.')
        }
      }
    }

    void loadDefaultExamples()

    return () => {
      cancelled = true
    }
  }, [applyImagePair])

  const diffAnalysis = useMemo(() => {
    if (!inputImage || !outputImage || !dimensionsMatch) {
      return null
    }

    return createDifferenceAnalysis({
      base: inputImage.bitmap,
      output: outputImage.bitmap,
    })
  }, [dimensionsMatch, inputImage, outputImage])

  const diffResult = useMemo(() => {
    if (!diffAnalysis) {
      return null
    }

    return createDifferenceOverlay({
      analysis: diffAnalysis,
      overlayOpacity: overlayOpacity / 100,
      thresholdPercent: threshold,
    })
  }, [diffAnalysis, overlayOpacity, threshold])

  useEffect(() => {
    return () => {
      if (inputImage) {
        releaseImage(inputImage)
      }
    }
  }, [inputImage])

  useEffect(() => {
    return () => {
      if (outputImage) {
        releaseImage(outputImage)
      }
    }
  }, [outputImage])

  useEffect(() => {
    if (mode !== 'blink' || !blinkPlaying || !hasPair) {
      return
    }

    const timer = window.setInterval(() => {
      setBlinkShowsOutput((current) => !current)
    }, blinkSpeed)

    return () => window.clearInterval(timer)
  }, [blinkPlaying, blinkSpeed, hasPair, mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isFormControl =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if (event.code === 'Space' && mode === 'blink' && hasPair && !isFormControl) {
        event.preventDefault()
        setBlinkShowsOutput((current) => !current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasPair, mode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (mode !== 'difference' || !canvas) {
      return
    }

    if (!diffResult) {
      const context = canvas.getContext('2d')
      context?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    canvas.width = diffResult.width
    canvas.height = diffResult.height
    requireContext(canvas).putImageData(diffResult.imageData, 0, 0)
  }, [diffResult, mode])

  const handleImagesLoad = useCallback(
    async (files: FileList | File[]) => {
      const selectedFiles = Array.from(files).slice(0, 2)

      if (selectedFiles.length < 2) {
        setError('Choose two images to compare.')
        return
      }

      if (selectedFiles.some((file) => !file.type.startsWith('image/'))) {
        setError('Choose PNG, JPEG, or WebP images.')
        return
      }

      try {
        const [firstImage, secondImage] = await Promise.all(
          selectedFiles.map((file) => createImageAsset(file, previewQuality)),
        )
        applyImagePair(firstImage, secondImage, 'custom')
      } catch {
        setError('One of those images could not be opened. Try PNG, JPEG, or WebP files.')
      }
    },
    [applyImagePair, previewQuality],
  )

  const changePreviewQuality = async (nextQuality: PreviewQuality) => {
    if (nextQuality === previewQuality) {
      return
    }

    setPreviewQuality(nextQuality)

    if (!inputImage || !outputImage) {
      return
    }

    try {
      const [nextInputImage, nextOutputImage] = await Promise.all([
        createImageAsset(inputImage.file, nextQuality),
        createImageAsset(outputImage.file, nextQuality),
      ])
      setError(null)
      setInputImage(nextInputImage)
      setOutputImage(nextOutputImage)
      resetView()
    } catch {
      setError('The preview quality could not be changed for those images.')
    }
  }

  const updateZoom = useCallback((nextZoom: number, options: { immediate?: boolean } = {}) => {
    const currentZoom = zoomRef.current
    const clampedZoom = clamp(Number(nextZoom.toFixed(2)), minZoom, maxZoom)
    const nextPan = getMagneticPan(panRef.current, currentZoom, clampedZoom)
    zoomRef.current = clampedZoom
    panRef.current = nextPan
    setPan(nextPan)
    setZoom(clampedZoom)
    if (options.immediate && wheelFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelFrameRef.current)
      wheelFrameRef.current = null
      wheelDeltaRef.current = 0
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }

    const onViewerWheel = (event: WheelEvent) => {
      if (!hasPair) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      wheelDeltaRef.current += event.deltaY

      if (wheelFrameRef.current !== null) {
        return
      }

      wheelFrameRef.current = window.requestAnimationFrame(() => {
        const delta = wheelDeltaRef.current
        wheelDeltaRef.current = 0
        wheelFrameRef.current = null
        const step = clamp(Math.abs(delta) / 360, 0.08, 0.22)
        const direction = delta > 0 ? -step : step
        updateZoom(zoomRef.current + direction)
      })
    }

    viewer.addEventListener('wheel', onViewerWheel, { passive: false })
    return () => {
      viewer.removeEventListener('wheel', onViewerWheel)
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current)
        wheelFrameRef.current = null
      }
      wheelDeltaRef.current = 0
    }
  }, [hasPair, updateZoom])

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode)
    if (nextMode !== 'side-by-side') {
      setSyncPointer(null)
    }
  }

  const zoomIn = () => updateZoom(zoomRef.current + 0.15, { immediate: true })
  const zoomOut = () => updateZoom(zoomRef.current - 0.15, { immediate: true })

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!hasPair || zoom <= minZoom) {
      return
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startPan: pan,
      startPointer: { x: event.clientX, y: event.clientY },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    setPan({
      x: drag.startPan.x + event.clientX - drag.startPointer.x,
      y: drag.startPan.y + event.clientY - drag.startPointer.y,
    })
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Do I have frame shift?</p>
          <h1>Image Comparison Review</h1>
        </div>
        <div className="privacy-note">
          <EyeOff size={18} aria-hidden="true" />
          Images stay in this browser. Nothing is uploaded.
        </div>
      </header>

      <section className="upload-grid" aria-label="Image uploads">
        <PairUploadSlot
          isActive={activePair === 'custom'}
          firstImage={inputImage}
          onFiles={(files) => void handleImagesLoad(files)}
          secondImage={outputImage}
        />
        <ExamplePicker
          activePair={activePair}
          onBadExampleClick={() => void loadBadExample()}
          onGoodExampleClick={() => void loadGoodExample()}
        />
      </section>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="review-toolbar" aria-label="Review controls">
        <div className="mode-area">
          <div className="mode-tabs" role="tablist" aria-label="Comparison mode">
            {modes.map((item) => {
              const Icon = item.icon
              return (
                <button
                aria-selected={mode === item.id}
                aria-label={`${item.label}: ${item.description}`}
                className="mode-button"
                data-tooltip={item.description}
                key={item.id}
                onClick={() => changeMode(item.id)}
                role="tab"
                type="button"
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </button>
              )
            })}
          </div>
        </div>

        <div className="view-actions" aria-label="View controls">
          <PreviewQualityControl
            onChange={(quality) => void changePreviewQuality(quality)}
            value={previewQuality}
          />
          <IconButton label="Zoom out" onClick={zoomOut}>
            <ZoomOut size={18} />
          </IconButton>
          <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" onClick={zoomIn}>
            <ZoomIn size={18} />
          </IconButton>
          <button className="reset-zoom-button" onClick={resetView} type="button">
            <Maximize2 size={18} />
            Reset zoom
          </button>
        </div>
      </section>

      {hasPair && !dimensionsMatch ? (
        <section className="status-row" aria-live="polite">
          <span className="warning-pill">
            <AlertTriangle size={16} aria-hidden="true" />
            Dimensions do not match:{' '}
            {inputImage?.width} x {inputImage?.height} vs {outputImage?.width} x{' '}
            {outputImage?.height}
          </span>
        </section>
      ) : null}

      <section
        className={`viewer viewer-${mode}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        ref={viewerRef}
      >
        {mode === 'side-by-side' ? (
          <div className="side-by-side">
            <ImagePane
              asset={inputImage}
              label="Image 1"
              onPointerChange={setSyncPointer}
              paneId="image-1"
              syncPointer={syncPointer}
              transform={transform}
            />
            <ImagePane
              asset={outputImage}
              label="Image 2"
              onPointerChange={setSyncPointer}
              paneId="image-2"
              syncPointer={syncPointer}
              transform={transform}
            />
          </div>
        ) : null}

        {mode === 'blink' ? (
          <div className="single-viewer">
            {activeBlinkImage ? (
              <img
                alt={blinkShowsOutput ? 'Image 2' : 'Image 1'}
                className="review-image"
                draggable={false}
                src={activeBlinkImage.url}
                style={{ transform }}
              />
            ) : (
              <EmptyViewer />
            )}
            {hasPair ? (
              <span className="viewer-badge">{blinkShowsOutput ? 'Image 2' : 'Image 1'}</span>
            ) : null}
          </div>
        ) : null}

        {mode === 'difference' ? (
          <div className="single-viewer">
            {hasPair && dimensionsMatch ? (
              <canvas
                aria-label="Difference overlay"
                className="diff-canvas"
                ref={canvasRef}
                style={{ transform }}
              />
            ) : (
              <EmptyViewer />
            )}
            {hasPair && dimensionsMatch ? <span className="viewer-badge">Diff overlay</span> : null}
          </div>
        ) : null}
      </section>

      <section className="controls-and-metrics">
        <div className="control-panel">
          {mode === 'blink' ? (
            <>
              <div className="blink-actions">
                <button
                  className="primary-control"
                  disabled={!hasPair}
                  onClick={() => setBlinkPlaying((current) => !current)}
                  type="button"
                >
                  {blinkPlaying ? <Pause size={18} /> : <Play size={18} />}
                  {blinkPlaying ? 'Pause blink' : 'Play blink'}
                </button>
                <button
                  className="secondary-control"
                  disabled={!hasPair}
                  onClick={() => setBlinkShowsOutput((current) => !current)}
                  type="button"
                >
                  Toggle frame
                </button>
              </div>
              <RangeControl
                label="Blink speed"
                max={500}
                min={100}
                onChange={setBlinkSpeed}
                step={25}
                suffix="ms"
                lowerHint="Faster"
                upperHint="Slower"
                value={blinkSpeed}
              />
            </>
          ) : null}

          {mode === 'difference' ? (
            <>
              <RangeControl
                label="Difference threshold"
                max={20}
                min={5}
                onChange={setThreshold}
                step={1}
                suffix="%"
                value={threshold}
              />
              <p className="threshold-guidance">
                Best range: <strong>10-20%</strong>. Under 5% mostly catches noise/compression.
              </p>
              <p className="difference-ideal-note">
                Ideal result: only added subjects/objects and their natural shadows turn red. Heavy
                red in fixed background details usually means frame, focus, lighting, or color
                shifted.
              </p>
              <RangeControl
                label="Red overlay opacity"
                max={100}
                min={10}
                onChange={setOverlayOpacity}
                step={1}
                suffix="%"
                value={overlayOpacity}
              />
              {diffAnalysis ? (
                <p className="panel-hint">
                  Difference mode uses a fast preview at {diffAnalysis.width} x {diffAnalysis.height}
                  px so large files stay responsive.
                </p>
              ) : null}
            </>
          ) : null}

          {mode === 'side-by-side' ? (
            <p className="panel-hint">
              Drag inside the viewer to pan both images together. Scroll or use the zoom buttons to
              inspect fixed scene details.
            </p>
          ) : null}
        </div>

        <aside className="helper-note">
          <AlertTriangle size={20} aria-hidden="true" />
          <p>{helperText}</p>
        </aside>
      </section>

    </main>
  )
}

function PairUploadSlot({
  firstImage,
  isActive,
  onFiles,
  secondImage,
}: {
  firstImage: ImageAsset | null
  isActive: boolean
  onFiles: (files: FileList | File[]) => void
  secondImage: ImageAsset | null
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const openPicker = () => inputRef.current?.click()

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onFiles(event.target.files)
    }
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (event.dataTransfer.files.length) {
      onFiles(event.dataTransfer.files)
    }
  }

  return (
    <label
      aria-current={isActive ? 'true' : undefined}
      className={`upload-slot ${isActive ? 'source-active' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openPicker()
        }
      }}
      tabIndex={0}
    >
      <input
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="file-input"
        multiple
        onChange={onInputChange}
        ref={inputRef}
        type="file"
      />
      <span className="upload-icon">
        <Upload size={20} aria-hidden="true" />
      </span>
      <span className="upload-copy">
        <strong>Click to select two images</strong>
        {firstImage && secondImage ? (
          <span className="selected-pair">
            <span>
              Image 1: {firstImage.name} · {firstImage.width} x {firstImage.height}px ·{' '}
              {formatBytes(firstImage.size)}
            </span>
            <span>
              Image 2: {secondImage.name} · {secondImage.width} x {secondImage.height}px ·{' '}
              {formatBytes(secondImage.size)}
            </span>
          </span>
        ) : (
          <>
            <span>A lightweight example loads by default</span>
            <span>Drop two PNG/JPEG/WebP files here to replace it</span>
            <span>Order usually does not matter for frame shift checks</span>
          </>
        )}
      </span>
    </label>
  )
}

function ExamplePicker({
  activePair,
  onBadExampleClick,
  onGoodExampleClick,
}: {
  activePair: PairSource
  onBadExampleClick: () => void
  onGoodExampleClick: () => void
}) {
  return (
    <div className="example-picker" aria-label="Example image pairs">
      <button
        aria-current={activePair === 'good' ? 'true' : undefined}
        className={`example-card ${activePair === 'good' ? 'source-active' : ''}`}
        onClick={onGoodExampleClick}
        type="button"
      >
        <span className="example-kicker">Good example</span>
        <strong>No frame shift</strong>
        <span>Clean comparison pair.</span>
      </button>
      <button
        aria-current={activePair === 'bad' ? 'true' : undefined}
        className={`example-card ${activePair === 'bad' ? 'source-active' : ''}`}
        onClick={onBadExampleClick}
        type="button"
      >
        <span className="example-kicker">Bad example</span>
        <strong>Lots of frame shift</strong>
        <span>Obvious mismatch pair.</span>
      </button>
    </div>
  )
}

function ImagePane({
  asset,
  label,
  onPointerChange,
  paneId,
  syncPointer,
  transform,
}: {
  asset: ImageAsset | null
  label: string
  onPointerChange: (pointer: SyncPointer | null) => void
  paneId: SyncPointer['source']
  syncPointer: SyncPointer | null
  transform: string
}) {
  const paneRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [dotPosition, setDotPosition] = useState<PanPoint | null>(null)

  useLayoutEffect(() => {
    if (!syncPointer || !imageRef.current || !paneRef.current) {
      setDotPosition(null)
      return
    }

    const imageRect = imageRef.current.getBoundingClientRect()
    const paneRect = paneRef.current.getBoundingClientRect()
    setDotPosition({
      x: imageRect.left - paneRect.left + imageRect.width * syncPointer.x,
      y: imageRect.top - paneRect.top + imageRect.height * syncPointer.y,
    })
  }, [asset, syncPointer, transform])

  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageRef.current) {
      onPointerChange(null)
      return
    }

    const imageRect = imageRef.current.getBoundingClientRect()
    const x = (event.clientX - imageRect.left) / imageRect.width
    const y = (event.clientY - imageRect.top) / imageRect.height

    if (x < 0 || x > 1 || y < 0 || y > 1) {
      onPointerChange(null)
      return
    }

    onPointerChange({ source: paneId, x, y })
  }

  return (
    <div
      className="image-pane"
      onPointerLeave={() => onPointerChange(null)}
      onPointerMove={updatePointer}
      ref={paneRef}
    >
      <span className="viewer-badge">{label}</span>
      {asset ? (
        <>
          <img
            alt={`${label} image`}
            className="review-image"
            draggable={false}
            ref={imageRef}
            src={asset.url}
            style={{ transform }}
          />
          {dotPosition && syncPointer?.source !== paneId ? (
            <span
              aria-hidden="true"
              className="sync-pointer sync-pointer-mirror"
              style={{ left: dotPosition.x, top: dotPosition.y }}
            />
          ) : null}
        </>
      ) : (
        <EmptyViewer />
      )}
    </div>
  )
}

function EmptyViewer() {
  return <div className="empty-viewer">Upload both images to compare.</div>
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button aria-label={label} className="icon-button" onClick={onClick} title={label} type="button">
      {children}
    </button>
  )
}

function PreviewQualityControl({
  onChange,
  value,
}: {
  onChange: (quality: PreviewQuality) => void
  value: PreviewQuality
}) {
  return (
    <div className="preview-quality" aria-label="Preview quality">
      <span>Preview</span>
      <div className="preview-quality-options">
        {previewQualityOptions.map((option) => (
          <button
            aria-pressed={value === option.id}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function RangeControl({
  label,
  lowerHint,
  max,
  min,
  onChange,
  step,
  suffix = '',
  upperHint,
  value,
}: {
  label: string
  lowerHint?: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  suffix?: string
  upperHint?: string
  value: number
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      {lowerHint || upperHint ? (
        <span className="range-hints">
          <span>{lowerHint}</span>
          <span>{upperHint}</span>
        </span>
      ) : null}
    </label>
  )
}

async function createImageAsset(file: File, previewQuality: PreviewQuality): Promise<ImageAsset> {
  const bitmap = await createImageBitmap(file)
  const display = await createDisplayPreview(file, bitmap, previewQuality)
  return {
    bitmap,
    displayHeight: display.height,
    displayWidth: display.width,
    file,
    height: bitmap.height,
    name: file.name,
    size: file.size,
    url: display.url,
    width: bitmap.width,
  }
}

async function loadExampleAsset(path: string, name: string): Promise<ImageAsset> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Could not load ${name}.`)
  }

  const blob = await response.blob()
  const file = new File([blob], name, { type: blob.type || 'image/webp' })
  const bitmap = await createImageBitmap(blob)
  return {
    bitmap,
    displayHeight: bitmap.height,
    displayWidth: bitmap.width,
    file,
    height: bitmap.height,
    name,
    size: blob.size,
    url: URL.createObjectURL(blob),
    width: bitmap.width,
  }
}

function releaseImage(asset: ImageAsset) {
  URL.revokeObjectURL(asset.url)
  asset.bitmap.close()
}

async function createDisplayPreview(file: File, bitmap: ImageBitmap, previewQuality: PreviewQuality) {
  if (previewQuality === 'original') {
    return {
      height: bitmap.height,
      url: URL.createObjectURL(file),
      width: bitmap.width,
    }
  }

  const displaySize = getDisplaySize(bitmap.width, bitmap.height, previewQuality)

  if (displaySize.scale >= 1) {
    return {
      height: bitmap.height,
      url: URL.createObjectURL(file),
      width: bitmap.width,
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = displaySize.width
  canvas.height = displaySize.height
  const context = requireContext(canvas)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, displaySize.width, displaySize.height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.88),
  )

  return {
    height: displaySize.height,
    url: blob ? URL.createObjectURL(blob) : URL.createObjectURL(file),
    width: displaySize.width,
  }
}

function getDisplaySize(width: number, height: number, previewQuality: PreviewQuality) {
  if (previewQuality === 'original') {
    return { height, scale: 1, width }
  }

  const qualitySettings: Record<Exclude<PreviewQuality, 'original'>, { edge: number; pixels: number }> =
    {
      '25': { edge: 1800, pixels: 1_400_000 },
      '50': { edge: 2500, pixels: 3_000_000 },
      '75': { edge: 3200, pixels: 5_000_000 },
    }
  const setting = qualitySettings[previewQuality]
  return getBoundedSize(width, height, setting.pixels, setting.edge)
}

function createDifferenceAnalysis({
  base,
  output,
}: {
  base: ImageBitmap
  output: ImageBitmap
}): DiffAnalysis {
  const analysisSize = getAnalysisSize(base.width, base.height)
  const baseCanvas = document.createElement('canvas')
  const outputCanvas = document.createElement('canvas')
  baseCanvas.width = analysisSize.width
  baseCanvas.height = analysisSize.height
  outputCanvas.width = analysisSize.width
  outputCanvas.height = analysisSize.height

  const baseContext = requireContext(baseCanvas)
  const outputContext = requireContext(outputCanvas)

  baseContext.imageSmoothingEnabled = true
  baseContext.imageSmoothingQuality = 'high'
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  baseContext.drawImage(base, 0, 0, analysisSize.width, analysisSize.height)
  outputContext.drawImage(output, 0, 0, analysisSize.width, analysisSize.height)

  const baseData = baseContext.getImageData(0, 0, analysisSize.width, analysisSize.height)
  const outputData = outputContext.getImageData(0, 0, analysisSize.width, analysisSize.height)
  const totalPixels = analysisSize.width * analysisSize.height
  const baseGray = new Uint8ClampedArray(totalPixels)
  const colorDifferences = new Float32Array(totalPixels)

  for (let pixel = 0, index = 0; index < baseData.data.length; pixel += 1, index += 4) {
    const baseRed = baseData.data[index]
    const baseGreen = baseData.data[index + 1]
    const baseBlue = baseData.data[index + 2]
    const outputRed = outputData.data[index]
    const outputGreen = outputData.data[index + 1]
    const outputBlue = outputData.data[index + 2]

    const redDifference = outputRed - baseRed
    const greenDifference = outputGreen - baseGreen
    const blueDifference = outputBlue - baseBlue
    const colorDifference = Math.sqrt(
      redDifference * redDifference +
        greenDifference * greenDifference +
        blueDifference * blueDifference,
    )
    const baseBrightness = getBrightness(baseRed, baseGreen, baseBlue)

    baseGray[pixel] = baseBrightness
    colorDifferences[pixel] = colorDifference
  }

  return {
    baseGray,
    colorDifferences,
    height: analysisSize.height,
    scale: analysisSize.scale,
    width: analysisSize.width,
  }
}

function createDifferenceOverlay({
  analysis,
  overlayOpacity,
  thresholdPercent,
}: {
  analysis: DiffAnalysis
  overlayOpacity: number
  thresholdPercent: number
}): DiffResult {
  const overlayData = new ImageData(analysis.width, analysis.height)
  const threshold = (thresholdPercent / 100) * maxColorDistance

  for (let pixel = 0, index = 0; pixel < analysis.baseGray.length; pixel += 1, index += 4) {
    const changed = analysis.colorDifferences[pixel] >= threshold
    const gray = analysis.baseGray[pixel]

    if (changed) {
      overlayData.data[index] = blend(gray, 224, overlayOpacity)
      overlayData.data[index + 1] = blend(gray, 48, overlayOpacity)
      overlayData.data[index + 2] = blend(gray, 48, overlayOpacity)
    } else {
      overlayData.data[index] = gray
      overlayData.data[index + 1] = gray
      overlayData.data[index + 2] = gray
    }

    overlayData.data[index + 3] = 255
  }

  return {
    height: analysis.height,
    imageData: overlayData,
    width: analysis.width,
  }
}

function getAnalysisSize(width: number, height: number) {
  return getBoundedSize(width, height, maxAnalysisPixels, maxAnalysisEdge)
}

function getBoundedSize(width: number, height: number, maxPixels: number, maxEdge: number) {
  const longEdge = Math.max(width, height)
  const edgeScale = longEdge > maxEdge ? maxEdge / longEdge : 1
  const pixelScale =
    width * height > maxPixels ? Math.sqrt(maxPixels / (width * height)) : 1
  const scale = Math.min(1, edgeScale, pixelScale)

  return {
    height: Math.max(1, Math.round(height * scale)),
    scale,
    width: Math.max(1, Math.round(width * scale)),
  }
}

function requireContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas is not available.')
  }
  return context
}

function getBrightness(red: number, green: number, blue: number) {
  return 0.299 * red + 0.587 * green + 0.114 * blue
}

function blend(base: number, overlay: number, opacity: number) {
  return Math.round(base * (1 - opacity) + overlay * opacity)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getMagneticPan(currentPan: PanPoint, currentZoom: number, nextZoom: number) {
  if (nextZoom <= minZoom) {
    return { x: 0, y: 0 }
  }

  if (nextZoom >= currentZoom) {
    return currentPan
  }

  const currentDistance = Math.max(currentZoom - minZoom, 0.01)
  const nextDistance = Math.max(nextZoom - minZoom, 0)
  const pullToCenter = nextDistance / currentDistance

  return {
    x: Math.round(currentPan.x * pullToCenter),
    y: Math.round(currentPan.y * pullToCenter),
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default App
