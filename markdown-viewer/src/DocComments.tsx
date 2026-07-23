import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getCommentAnchorSortKey } from './documents/commentAnchorUtils'
import { resolveSelectionAnchor, type TocEntryLike } from './commentAnchors'
import {
  buildViewportConnector,
  type ViewportConnector,
} from './commentLayout'
import type { CommentAnchor, DocumentComment } from './documentComments'

type DraftState = {
  anchor: CommentAnchor
}

type RailItem =
  | { kind: 'draft'; anchor: CommentAnchor }
  | { kind: 'comment'; comment: DocumentComment }

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
  resolveSelectionAnchor?: (
    selection: Selection,
    scope: HTMLElement,
  ) => CommentAnchor | null
  scrollToAnchor?: (commentId: string, anchor: CommentAnchor) => void
  /** Draft anchor resolved externally (selection menu) before comment mode
   *  re-rendered the document and cleared the selection. */
  externalDraft?: { anchor: CommentAnchor; tick: number } | null
}

function getCommentHighlightElement(scope: HTMLElement, commentId: string) {
  return scope.querySelector<HTMLElement>(
    `mark.comment-highlight[data-comment-id="${CSS.escape(commentId)}"], [data-comment-id="${CSS.escape(commentId)}"].csv-comment-hit, [data-comment-id="${CSS.escape(commentId)}"].code-comment-hit`,
  )
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
  resolveSelectionAnchor: resolveSelectionAnchorOverride,
  scrollToAnchor,
  externalDraft,
}: DocCommentsProps) {
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const railScrollRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [editingId, setEditingId] = useState('')
  const [connectors, setConnectors] = useState<ViewportConnector[]>([])

  const railItems = useMemo((): RailItem[] => {
    const items: RailItem[] = comments.map((comment) => ({ kind: 'comment', comment }))
    if (draft) {
      items.push({ kind: 'draft', anchor: draft.anchor })
      items.sort((left, right) => {
        const leftStart =
          left.kind === 'draft'
            ? getCommentAnchorSortKey(left.anchor)
            : getCommentAnchorSortKey(left.comment.anchor)
        const rightStart =
          right.kind === 'draft'
            ? getCommentAnchorSortKey(right.anchor)
            : getCommentAnchorSortKey(right.comment.anchor)
        return leftStart - rightStart
      })
    }
    return items
  }, [comments, draft])

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
      setConnectors([])
    }
  }, [clearDraft, open])

  const scrollToComment = useCallback(
    (commentId: string) => {
      const comment = comments.find((entry) => entry.id === commentId)
      if (comment && scrollToAnchor) {
        scrollToAnchor(commentId, comment.anchor)
        return
      }

      const scope = docColRef.current
      if (!scope) {
        return
      }

      const highlight = getCommentHighlightElement(scope, commentId)

      if (highlight) {
        highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setActiveCommentId(commentId)
        return
      }

      if (
        comment?.anchor.kind !== 'pdf' &&
        comment?.anchor.kind !== 'csv' &&
        comment?.anchor.kind !== 'code' &&
        comment?.anchor.headingId
      ) {
        const heading = scope.querySelector<HTMLElement>(
          `#${CSS.escape(comment.anchor.headingId)}`,
        )
        heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      setActiveCommentId(commentId)
    },
    [comments, docColRef, scrollToAnchor, setActiveCommentId],
  )

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
      const highlight = getCommentHighlightElement(scope, activeCommentId)
      if (card && highlight) {
        lines.push(
          buildViewportConnector(activeCommentId, highlight.getBoundingClientRect(), card),
        )
      }
    }

    setConnectors(lines)
  }, [activeCommentId, docColRef, draft, open])

  useLayoutEffect(() => {
    updateConnectors()
  }, [updateConnectors, comments, draft, activeCommentId, open, editingId, draftBody, railItems])

  useEffect(() => {
    if (!open) {
      return
    }

    const onReflow = () => {
      window.requestAnimationFrame(() => {
        updateConnectors()
      })
    }

    window.addEventListener('scroll', onReflow, { passive: true })
    window.addEventListener('resize', onReflow, { passive: true })

    return () => {
      window.removeEventListener('scroll', onReflow)
      window.removeEventListener('resize', onReflow)
    }
  }, [open, updateConnectors])

  useEffect(() => {
    if (!open) {
      return
    }

    const rail = railScrollRef.current
    if (!rail) {
      return
    }

    const onRailScroll = () => {
      window.requestAnimationFrame(updateConnectors)
    }

    rail.addEventListener('scroll', onRailScroll, { passive: true })
    return () => rail.removeEventListener('scroll', onRailScroll)
  }, [open, updateConnectors, railItems.length])

  useEffect(() => {
    if (!open || !activeCommentId) {
      return
    }

    const card = cardRefs.current.get(activeCommentId)
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeCommentId, comments.length, draftBody, editingId, open, railItems.length])

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

      const anchor = resolveSelectionAnchorOverride
        ? resolveSelectionAnchorOverride(selection, scope)
        : resolveSelectionAnchor(markdown, selection, scope, toc)
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
  }, [docColRef, editingId, markdown, open, resolveSelectionAnchorOverride, setActiveCommentId, toc])

  // Consume an externally resolved draft anchor exactly once per tick.
  const lastExternalDraftTickRef = useRef(0)
  useEffect(() => {
    if (
      !open ||
      !externalDraft ||
      externalDraft.tick === lastExternalDraftTickRef.current
    ) {
      return
    }

    lastExternalDraftTickRef.current = externalDraft.tick
    setDraft({ anchor: externalDraft.anchor })
    setDraftBody('')
    setEditingId('')
    setActiveCommentId('draft')
  }, [externalDraft, open, setActiveCommentId])

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
        'mark.comment-highlight[data-comment-id], [data-comment-id].csv-comment-hit, [data-comment-id].code-comment-hit',
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
        <div className="comment-rail-panel">
          <div ref={railScrollRef} className="comment-rail-scroll">
            {comments.length === 0 && !draft ? (
              <p className="comments-rail-hint">
                Comment mode is on. Select text in the document to add a comment.
              </p>
            ) : null}

            {railItems.map((item) => {
              if (item.kind === 'draft') {
                return (
                  <article
                    key="draft"
                    ref={(node) => registerCardRef('draft', node)}
                    className={
                      activeCommentId === 'draft'
                        ? 'comment-rail-card draft active'
                        : 'comment-rail-card draft'
                    }
                    onClick={() => setActiveCommentId('draft')}
                  >
                    <p className="comment-card-quote">“{item.anchor.quote}”</p>
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
                )
              }

              const comment = item.comment
              const isActive = comment.id === activeCommentId
              const isEditing = comment.id === editingId

              return (
                <article
                  key={comment.id}
                  ref={(node) => registerCardRef(comment.id, node)}
                  data-comment-card={comment.id}
                  className={isActive ? 'comment-rail-card active' : 'comment-rail-card'}
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
          </div>

          <button
            type="button"
            className="comment-rail-close"
            aria-label="Exit comment mode"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </aside>
    </>
  )
}

export default DocComments
