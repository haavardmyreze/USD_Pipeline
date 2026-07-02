import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { resolveSelectionAnchor, type TocEntryLike } from './commentAnchors'
import {
  buildViewportConnector,
  measureHighlightAnchor,
  measureRangeAnchor,
  stackFixedCardTops,
  type FixedCardPosition,
  type ViewportAnchor,
  type ViewportConnector,
} from './commentLayout'
import type { CommentAnchor, DocumentComment } from './documentComments'

type DraftState = {
  anchor: CommentAnchor
}

type DocCommentsProps = {
  open: boolean
  onClose: () => void
  docColRef: RefObject<HTMLDivElement | null>
  markdown: string
  toc: TocEntryLike[]
  comments: DocumentComment[]
  activeCommentId: string
  setActiveCommentId: (id: string) => void
  onAddComment: (anchor: CommentAnchor, body: string) => DocumentComment | null
  onUpdateComment: (id: string, body: string) => void
  onDeleteComment: (id: string) => void
}

function formatCommentTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function DocComments({
  open,
  onClose,
  docColRef,
  markdown,
  toc,
  comments,
  activeCommentId,
  setActiveCommentId,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
}: DocCommentsProps) {
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [editingId, setEditingId] = useState('')
  const [pinnedLayouts, setPinnedLayouts] = useState<Record<string, FixedCardPosition>>({})
  const [connectors, setConnectors] = useState<ViewportConnector[]>([])

  const clearDraft = useCallback(() => {
    setDraft(null)
    setDraftBody('')
    window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    if (!open) {
      clearDraft()
      setEditingId('')
      setDraftBody('')
      setPinnedLayouts({})
      setConnectors([])
    }
  }, [clearDraft, open])

  const scrollToComment = useCallback(
    (commentId: string) => {
      const scope = docColRef.current
      if (!scope) {
        return
      }

      const highlight = scope.querySelector<HTMLElement>(
        `mark.comment-highlight[data-comment-id="${CSS.escape(commentId)}"]`,
      )

      if (highlight) {
        highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setActiveCommentId(commentId)
        return
      }

      const comment = comments.find((entry) => entry.id === commentId)
      if (comment?.anchor.headingId) {
        const heading = scope.querySelector<HTMLElement>(
          `#${CSS.escape(comment.anchor.headingId)}`,
        )
        heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      setActiveCommentId(commentId)
    },
    [comments, docColRef, setActiveCommentId],
  )

  const measureCardHeights = useCallback(() => {
    const heights = new Map<string, number>()
    for (const [id, card] of cardRefs.current.entries()) {
      heights.set(id, card.offsetHeight)
    }
    return heights
  }, [])

  const collectViewportAnchors = useCallback((): ViewportAnchor[] => {
    const scope = docColRef.current
    if (!scope) {
      return []
    }

    const anchors: ViewportAnchor[] = []

    if (draft) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const measured = measureRangeAnchor(selection.getRangeAt(0), draft.anchor.start)
        if (measured) {
          anchors.push(measured)
        } else {
          anchors.push({
            id: 'draft',
            x: 0,
            y: 0,
            documentOrder: draft.anchor.start,
            inViewport: false,
          })
        }
      } else {
        anchors.push({
          id: 'draft',
          x: 0,
          y: 0,
          documentOrder: draft.anchor.start,
          inViewport: false,
        })
      }
    }

    for (const comment of comments) {
      const highlight = scope.querySelector<HTMLElement>(
        `mark.comment-highlight[data-comment-id="${CSS.escape(comment.id)}"]`,
      )
      if (!highlight) {
        anchors.push({
          id: comment.id,
          x: 0,
          y: 0,
          documentOrder: comment.anchor.start,
          inViewport: false,
        })
        continue
      }

      const measured = measureHighlightAnchor(highlight, comment.anchor.start)
      if (measured) {
        anchors.push(measured)
      }
    }

    return anchors
  }, [comments, docColRef, draft])

  const repinCards = useCallback(() => {
    if (!open) {
      return
    }

    const anchors = collectViewportAnchors()
    const heights = measureCardHeights()
    const tops = stackFixedCardTops(anchors, heights)
    setPinnedLayouts(Object.fromEntries(tops.entries()))
  }, [collectViewportAnchors, measureCardHeights, open])

  const updateConnectors = useCallback(() => {
    if (!open) {
      setConnectors([])
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    const lines: ViewportConnector[] = []

    if (!activeCommentId) {
      setConnectors(lines)
      return
    }

    if (activeCommentId === 'draft') {
      const card = cardRefs.current.get('draft')
      const selection = window.getSelection()
      if (card && selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0)
        lines.push(buildViewportConnector('draft', range.getBoundingClientRect(), card))
      }
    } else {
      const card = cardRefs.current.get(activeCommentId)
      const highlight = scope.querySelector<HTMLElement>(
        `mark.comment-highlight[data-comment-id="${CSS.escape(activeCommentId)}"]`,
      )
      if (card && highlight) {
        lines.push(
          buildViewportConnector(activeCommentId, highlight.getBoundingClientRect(), card),
        )
      }
    }

    setConnectors(lines)
  }, [activeCommentId, docColRef, draft, open])

  useLayoutEffect(() => {
    repinCards()
    const frame = window.requestAnimationFrame(repinCards)
    return () => window.cancelAnimationFrame(frame)
  }, [repinCards, comments, draft, editingId, draftBody, open])

  useLayoutEffect(() => {
    updateConnectors()
  }, [updateConnectors, pinnedLayouts, comments, draft, activeCommentId, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onReflow = () => {
      window.requestAnimationFrame(() => {
        updateConnectors()
      })
    }

    const onResize = () => {
      repinCards()
      updateConnectors()
    }

    window.addEventListener('scroll', onReflow, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('scroll', onReflow)
      window.removeEventListener('resize', onResize)
    }
  }, [open, repinCards, updateConnectors])

  useEffect(() => {
    if (!open) {
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    scope.querySelectorAll<HTMLElement>('mark.comment-highlight').forEach((mark) => {
      mark.classList.toggle('active', mark.dataset.commentId === activeCommentId)
    })
  }, [activeCommentId, comments, docColRef, markdown, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) {
        return
      }

      if (event.target.closest('.comment-rail-card, .comments-rail-hint, .comment-rail-close')) {
        return
      }

      if (event.target.closest('mark.comment-highlight')) {
        return
      }

      setActiveCommentId('')

      if (draft) {
        setDraft(null)
        setDraftBody('')
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [draft, open, setActiveCommentId])

  useEffect(() => {
    if (!open) {
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    const onMouseUp = () => {
      if (editingId) {
        return
      }

      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return
      }

      const anchor = resolveSelectionAnchor(markdown, selection, scope, toc)
      if (!anchor) {
        return
      }

      setDraft({ anchor })
      setDraftBody('')
      setEditingId('')
      setActiveCommentId('draft')
    }

    scope.addEventListener('mouseup', onMouseUp)

    return () => {
      scope.removeEventListener('mouseup', onMouseUp)
    }
  }, [docColRef, editingId, markdown, open, setActiveCommentId, toc])

  useEffect(() => {
    if (!open) {
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        'mark.comment-highlight[data-comment-id]',
      )
      if (!target || !scope.contains(target)) {
        return
      }

      const commentId = target.dataset.commentId
      if (!commentId) {
        return
      }

      event.preventDefault()
      setActiveCommentId(commentId)
      scrollToComment(commentId)
    }

    scope.addEventListener('click', onClick)
    return () => scope.removeEventListener('click', onClick)
  }, [docColRef, open, scrollToComment, setActiveCommentId])

  useEffect(() => {
    if (!draft) {
      return
    }

    draftRef.current?.focus()
  }, [draft])

  const submitDraft = (event?: FormEvent) => {
    event?.preventDefault()
    if (!draft || !draftBody.trim()) {
      return
    }

    const created = onAddComment(draft.anchor, draftBody)
    if (created) {
      clearDraft()
      setActiveCommentId(created.id)
    }
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitDraft()
    }
  }

  const startEditing = (comment: DocumentComment) => {
    setEditingId(comment.id)
    setActiveCommentId(comment.id)
    setDraftBody(comment.body)
    setDraft(null)
  }

  const saveEdit = (commentId: string) => {
    if (!draftBody.trim()) {
      return
    }

    onUpdateComment(commentId, draftBody)
    setEditingId('')
    setDraftBody('')
  }

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, commentId: string) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      saveEdit(commentId)
    }
  }

  const registerCardRef = (id: string, node: HTMLElement | null) => {
    if (node) {
      cardRefs.current.set(id, node)
      return
    }

    cardRefs.current.delete(id)
  }

  const getCardStyle = (
    id: string,
    isActive: boolean,
    stackZ: number = pinnedLayouts[id]?.zIndex ?? 1,
  ): CSSProperties => {
    const layout = pinnedLayouts[id]
    return {
      top: `${layout?.top ?? 96}px`,
      zIndex: isActive ? 1000 + stackZ : stackZ,
    }
  }

  if (!open) {
    return null
  }

  return (
    <>
      <svg className="comment-connectors-fixed" aria-hidden="true">
        {connectors.map((connector) => (
          <path key={connector.id} d={connector.d} className="active" />
        ))}
      </svg>

      <aside className="comment-rail-fixed" aria-label="Document comments">
        {comments.length === 0 && !draft ? (
          <p className="comments-rail-hint">
            Comment mode is on. Select text in the document to add a comment.
          </p>
        ) : null}

        {draft ? (
          <article
            ref={(node) => registerCardRef('draft', node)}
            className={
              activeCommentId === 'draft'
                ? 'comment-rail-card draft active'
                : 'comment-rail-card draft'
            }
            style={getCardStyle(
              'draft',
              activeCommentId === 'draft',
              pinnedLayouts.draft?.zIndex ?? comments.length + 1,
            )}
            onClick={() => setActiveCommentId('draft')}
          >
            <p className="comment-card-quote">“{draft.anchor.quote}”</p>
            <form onSubmit={submitDraft}>
              <textarea
                ref={draftRef}
                className="comment-compose-input"
                rows={3}
                placeholder="Add a comment…"
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                onKeyDown={onDraftKeyDown}
              />
              <div className="comment-compose-actions">
                <button type="button" className="ghost-button" onClick={clearDraft}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="comment-primary-button"
                  disabled={!draftBody.trim()}
                >
                  Comment
                </button>
              </div>
            </form>
          </article>
        ) : null}

        {comments.map((comment) => {
          const isActive = comment.id === activeCommentId
          const isEditing = comment.id === editingId
          const layout = pinnedLayouts[comment.id]
          const stackZ =
            layout?.zIndex ?? comments.findIndex((entry) => entry.id === comment.id) + 1

          return (
            <article
              key={comment.id}
              ref={(node) => registerCardRef(comment.id, node)}
              data-comment-card={comment.id}
              className={isActive ? 'comment-rail-card active' : 'comment-rail-card'}
              style={getCardStyle(comment.id, isActive, stackZ)}
              onClick={(event) => {
                event.stopPropagation()
                setActiveCommentId(comment.id)
                scrollToComment(comment.id)
              }}
            >
              <button
                type="button"
                className="comment-card-quote"
                onClick={(event) => {
                  event.stopPropagation()
                  scrollToComment(comment.id)
                }}
              >
                “{comment.anchor.quote}”
              </button>

              {isEditing ? (
                <div className="comment-edit">
                  <textarea
                    className="comment-compose-input"
                    rows={4}
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                    onKeyDown={(event) => onEditKeyDown(event, comment.id)}
                  />
                  <div className="comment-compose-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setEditingId('')
                        setDraftBody('')
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="comment-primary-button"
                      disabled={!draftBody.trim()}
                      onClick={() => saveEdit(comment.id)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="comment-card-body">{comment.body}</p>
              )}

              <div className="comment-card-meta">
                <time dateTime={new Date(comment.updatedAt).toISOString()}>
                  {formatCommentTime(comment.updatedAt)}
                </time>
                <div className="comment-card-actions">
                  {!isEditing ? (
                    <button
                      type="button"
                      className="ghost-button comment-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        startEditing(comment)
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-button comment-action danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteComment(comment.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          )
        })}

        <button
          type="button"
          className="comment-rail-close"
          aria-label="Exit comment mode"
          onClick={onClose}
        >
          Done
        </button>
      </aside>
    </>
  )
}

export default DocComments
