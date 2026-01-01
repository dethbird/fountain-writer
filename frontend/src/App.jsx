import React, { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import CodeMirrorEditor from './components/CodeMirrorEditor'
import Login from './components/Login'
import ScriptSelector from './components/ScriptSelector'
import { usePreviewWorker } from './hooks/usePreviewWorker'
import { usePlayerWorker } from './hooks/usePlayerWorker'
import defaultScriptContent from './assets/defaultScript.fountain?raw'

// Main App component
function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [user, setUser] = useState(null)
  const [showDesktopSuggestion, setShowDesktopSuggestion] = useState(false)
  const [code, setCode] = useState('')
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false)
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState('edit') // 'edit' or 'preview'
  const [currentLine, setCurrentLine] = useState(0)
  const [hasSavedScript, setHasSavedScript] = useState(false)
  const [lastSavedDate, setLastSavedDate] = useState(null)
  const [showScriptSelector, setShowScriptSelector] = useState(false)
  const [currentScriptId, setCurrentScriptId] = useState(null)
  const [currentScriptTitle, setCurrentScriptTitle] = useState('Untitled Script')
  const [currentScriptUpdated, setCurrentScriptUpdated] = useState(null)
  const previewRef = useRef(null)
  const editorRef = useRef(null)
  const blocksRef = useRef([])
  const appRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Check authentication status on mount
  useEffect(() => {
    fetch('/api/me', {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setUser(data.user)
        }
        setAuthChecked(true)
      })
      .catch(err => {
        console.error('Auth check failed:', err)
        setAuthChecked(true)
      })
  }, [])

  // Load script content on component mount - check localStorage for script ID
  useEffect(() => {
    const loadInitialScript = async () => {
      const currentScriptIdStr = localStorage.getItem('fountain-current-script-id')
      
      if (currentScriptIdStr && user) {
        // Load script from database
        try {
          const response = await fetch(`/api/scripts/${currentScriptIdStr}`, {
            credentials: 'include'
          })
          
          if (response.ok) {
            const data = await response.json()
            const script = data.script
            setCode(script.source)
            processText(script.source)
            try { if (typeof parsePanels === 'function') parsePanels(script.source) } catch (e) {}
            setCurrentScriptId(script.id)
            setCurrentScriptTitle(script.title)
            setCurrentScriptUpdated(new Date(script.updated_at))
            return
          }
        } catch (error) {
          console.error('Error loading script from DB:', error)
          localStorage.removeItem('fountain-current-script-id')
        }
      }
      
      // Load default script if no ID or loading failed
      setCode(defaultScriptContent)
      processText(defaultScriptContent)
      try { if (typeof parsePanels === 'function') parsePanels(defaultScriptContent) } catch (e) {}
    }
    
    if (user) {
      loadInitialScript()
    } else if (authChecked && !user) {
      // Not logged in, just load default
      setCode(defaultScriptContent)
      processText(defaultScriptContent)
      try { if (typeof parsePanels === 'function') parsePanels(defaultScriptContent) } catch (e) {}
    }
  }, [user, authChecked])

  // Detect mobile-like clients and suggest enabling the browser "Desktop site" option
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('desktopSuggestionDismissed') === '1'
      if (dismissed) return
      const ua = navigator.userAgent || ''
      const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|BB10|IEMobile|Opera Mini/i.test(ua)
      const isTouch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches
      const smallScreen = (window.innerWidth || screen.width || 0) < 1024
      if (isMobileUA || (isTouch && smallScreen)) {
        setShowDesktopSuggestion(true)
      }
    } catch (e) {
      // ignore detection errors
    }
  }, [])

  const { blocks, characters, characterLineCounts, processText } = usePreviewWorker('')
  const { panels, parsePanels } = usePlayerWorker()
  const [playerIndex, setPlayerIndex] = useState(0)
  // Preview pane selector: 'screenplay' shows the existing preview, 'player' will show the media player
  const [previewPane, setPreviewPane] = useState('screenplay')
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const mediaPlayerRef = useRef(null)
  const playbackTimerRef = useRef(null)
  const [playbackEnded, setPlaybackEnded] = useState(false)
  const navSourceRef = useRef(null) // 'user' | 'auto' | null
  const [showNestingTooltip, setShowNestingTooltip] = useState(false)

  // Keep blocks ref in sync
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  const handleCodeChange = (newCode) => {
    setCode(newCode)
    processText(newCode)
    try { if (typeof parsePanels === 'function') parsePanels(newCode) } catch (e) {}
  }

  // Player navigation helpers
  const gotoPrev = () => {
    if (!Array.isArray(panels) || panels.length === 0) return
    // stop any active playback/timers
    stopPlayback()
    setPlaybackEnded(false)
  navSourceRef.current = 'user'
  setPlayerIndex((idx) => {
      const n = panels.length
      return ((idx - 1) % n + n) % n
    })
  }

  // next; if userInitiated is true (default) stop playback timers. If false, this is programmatic auto-advance.
  const gotoNext = (userInitiated = true) => {
    if (!Array.isArray(panels) || panels.length === 0) return
    navSourceRef.current = userInitiated ? 'user' : 'auto'
    if (userInitiated) {
      stopPlayback()
      setPlaybackEnded(false)
    }
    setPlayerIndex((idx) => {
      const n = panels.length
      return (idx + 1) % n
    })
  }

  // Audio control handlers
  // Start playback sequence
  const handlePlay = async () => {
    // if we finished playback previously, restart from first panel
    if (playbackEnded) {
      setPlayerIndex(0)
      setPlaybackEnded(false)
    }
    // If currently paused on a panel, start audio from the beginning
    try {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.currentTime = 0
      }
    } catch (e) {}
    setIsPlaying(true)
  }

  const handlePause = () => {
  if (!audioRef.current) return
  // mark this as a user-initiated pause so the onPause handler knows
  navSourceRef.current = 'user'
  try { audioRef.current.pause() } catch (e) {}
  setIsPlaying(false)
  }

  const handleStop = () => {
  // Stop playback and reset to first panel
  stopPlayback()
  setPlaybackEnded(false)
  try { setPlayerIndex(0) } catch (e) {}
  }

  // Stop playback helper: clear timers, pause audio, reset time, set isPlaying false
  function stopPlayback() {
    try {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    } catch (e) {}
    try {
      if (audioRef.current) {
        // mark as user stop so pause handlers don't mistakenly clear playing state
        navSourceRef.current = 'user'
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    } catch (e) {}
    setIsPlaying(false)
  }

  // Sync audio element events to state and auto-advance on end
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      // Only treat pause as stopping playback when it was user-initiated.
      if (navSourceRef.current === 'user') setIsPlaying(false)
    }
    const onEnded = () => {
      // Do not set isPlaying to false here; keep playing state so programmatic
      // navigation (auto-advance) continues playback into the next panel.
      // programmatic advance (not user initiated)
      gotoNext(false)
    }
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    return () => {
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
    }
  }, [playerIndex, panels])

  // Drive playback sequence: when isPlaying is true start timer for current panel
  useEffect(() => {
    // clear any existing timer first
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current)
      playbackTimerRef.current = null
    }

    if (!isPlaying) return

    const p = (panels && panels.length > 0) ? (panels[playerIndex] || panels[0]) : null
    if (!p) {
      setIsPlaying(false)
      return
    }

    // try to play audio for this panel (if audio element present)
    try {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {})
      }
    } catch (e) {}

    const durMs = Math.max(1000, (typeof p.duration === 'number' ? p.duration * 1000 : 3000))
    playbackTimerRef.current = setTimeout(() => {
      // if this is the last panel, end playback and show black screen
      if (!panels || playerIndex >= panels.length - 1) {
        setIsPlaying(false)
        setPlaybackEnded(true)
        playbackTimerRef.current = null
      } else {
        // advance to next panel; the effect will pick up and continue playback
        setPlayerIndex((idx) => idx + 1)
      }
    }, durMs)

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    }
  }, [isPlaying, playerIndex, panels])

  // Pause/reset audio when switching panels
  useEffect(() => {
    // If navigation was user-initiated, pause/reset audio. For programmatic navigation (auto-advance)
    // we want playback to continue.
    if (audioRef.current) {
      try {
        if (navSourceRef.current === 'user') {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          setIsPlaying(false)
        }
      } catch (e) {}
    }
    // reset nav source marker
    navSourceRef.current = null
    try {
      if (mediaPlayerRef.current && typeof mediaPlayerRef.current.scrollTo === 'function') {
        mediaPlayerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e) {}
  }, [playerIndex])

  // cleanup timers on unmount
  useEffect(() => {
    return () => {
      try { if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current) } catch (e) {}
    }
  }, [])

  // Debug: log which panel the player will render
  useEffect(() => {
    try {
      const panel = (panels && panels.length > 0 && panels[playerIndex]) ? panels[playerIndex] : null
    } catch (e) {}
  }, [panels, playerIndex])

  // hide tooltip when moving between panels
  useEffect(() => {
    setShowNestingTooltip(false)
  }, [playerIndex])

  // Save script to database
  const saveScript = async () => {
    if (!code.trim()) return
    setIsSaving(true)
    
    try {
      if (currentScriptId) {
        // Update existing script
        const response = await fetch(`/api/scripts/${currentScriptId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source: code
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          setCurrentScriptUpdated(new Date(data.script.updated_at))
        } else {
          alert('Failed to save script')
        }
      } else {
        // Create new script - prompt for title
        const title = prompt('Enter a title for your script:', 'Untitled Script')
        if (!title) {
          setIsSaving(false)
          return
        }
        
        const response = await fetch('/api/scripts', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: title,
            source: code
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          setCurrentScriptId(data.script.id)
          setCurrentScriptTitle(data.script.title)
          setCurrentScriptUpdated(new Date(data.script.updated_at))
          localStorage.setItem('fountain-current-script-id', data.script.id.toString())
        } else {
          alert('Failed to save script')
        }
      }
    } catch (error) {
      console.error('Error saving script:', error)
      alert('Error saving script')
    } finally {
      setIsSaving(false)
    }
  }

  const handleNewScript = () => {
    setCode(defaultScriptContent)
    processText(defaultScriptContent)
    try { if (typeof parsePanels === 'function') parsePanels(defaultScriptContent) } catch (e) {}
    setCurrentScriptId(null)
    setCurrentScriptTitle('Untitled Script')
    setCurrentScriptUpdated(null)
    localStorage.removeItem('fountain-current-script-id')
  }

  const handleDeleteScript = async () => {
    if (!currentScriptId) return
    
    const confirmed = confirm(`Are you sure you want to delete "${currentScriptTitle}"? This cannot be undone.`)
    if (!confirmed) return
    
    try {
      const response = await fetch(`/api/scripts/${currentScriptId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (response.ok) {
        handleNewScript()
      } else {
        alert('Failed to delete script')
      }
    } catch (error) {
      console.error('Error deleting script:', error)
      alert('Error deleting script')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
      setUser(null)
      // Optionally reload to clear any app state
      window.location.href = '/'
    } catch (err) {
      console.error('Logout failed:', err)
      alert('Logout failed. Please try again.')
    }
  }

  const handleSelectScript = (script) => {
    setCode(script.source)
    processText(script.source)
    try { if (typeof parsePanels === 'function') parsePanels(script.source) } catch (e) {}
    setCurrentScriptId(script.id)
    setCurrentScriptTitle(script.title)
    setCurrentScriptUpdated(new Date(script.updated_at))
    localStorage.setItem('fountain-current-script-id', script.id.toString())
    setShowScriptSelector(false)
  }

  // Handle cursor position changes from CodeMirror
  const handleCursorChange = useCallback((lineNumber) => {
    const currentBlocks = blocksRef.current
    setCurrentLine(lineNumber)
    
    // Find the corresponding preview block and scroll to it within the preview container
    if (previewRef.current && currentBlocks.length > 0) {
      // Find the block that corresponds to this line or the closest one before it
      let targetBlock = null
      for (let i = currentBlocks.length - 1; i >= 0; i--) {
        if (currentBlocks[i].index <= lineNumber) {
          targetBlock = currentBlocks[i]
          break
        }
      }
      
      if (targetBlock) {
        const blockElement = previewRef.current.querySelector(`[data-line-id="${targetBlock.id}"]`)
        if (blockElement) {
          // Get the preview container dimensions
          const previewContainer = previewRef.current
          const containerRect = previewContainer.getBoundingClientRect()
          const elementRect = blockElement.getBoundingClientRect()
          
          // Calculate the scroll position to center the element in the preview container
          const elementTop = elementRect.top - containerRect.top
          const containerHeight = containerRect.height
          const elementHeight = elementRect.height
          const targetScrollTop = previewContainer.scrollTop + elementTop - (containerHeight / 2) + (elementHeight / 2)
          
          // Smooth scroll within the preview container only
          previewContainer.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
          })
        }
      }
    }
  }, []) // Remove blocks dependency since we're using ref

  // Handle clicks on preview blocks to scroll editor
  const handlePreviewClick = useCallback((lineIndex) => {
    if (editorRef.current && editorRef.current.scrollToLine) {
      editorRef.current.scrollToLine(lineIndex)
    }
  }, [])

  // Handle escape key for modals
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (isHelpModalOpen) {
          setIsHelpModalOpen(false)
        } else if (isCharacterModalOpen) {
          setIsCharacterModalOpen(false)
        }
      }
    }
    
    if (isHelpModalOpen || isCharacterModalOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isHelpModalOpen, isCharacterModalOpen])

  // Fullscreen change handling
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (appRef.current && appRef.current.requestFullscreen) {
          await appRef.current.requestFullscreen()
          setIsFullscreen(true)
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen()
          setIsFullscreen(true)
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
          setIsFullscreen(false)
        }
      }
    } catch (e) {
      // ignore fullscreen errors
      console.error('Fullscreen toggle failed', e)
    }
  }

  // Show loading state while checking auth
  if (!authChecked) {
    return (
      <div className="fountain-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!user) {
    return <Login />
  }

  // Show script selector if open
  if (showScriptSelector) {
    return (
      <ScriptSelector 
        onSelectScript={handleSelectScript}
        onCancel={() => setShowScriptSelector(false)}
      />
    )
  }

  return (
  <div className="fountain-app" ref={appRef}>
      {showDesktopSuggestion && (
        <div className="modal-overlay" onClick={() => { localStorage.setItem('desktopSuggestionDismissed','1'); setShowDesktopSuggestion(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Tip: enable Desktop site for a better layout</h2>
              <button className="modal-close" onClick={() => { localStorage.setItem('desktopSuggestionDismissed','1'); setShowDesktopSuggestion(false); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>For the best editing experience on phones, enable your browser's "Desktop site" option from the browser menu. This prevents the toolbar from wrapping and provides the full desktop layout.</p>
              <p style={{ marginTop: '1rem' }}><strong>How to:</strong> open your browser menu (⋮) and choose "Desktop site" or "Request desktop site".</p>
            </div>
            <div className="modal-header" style={{ borderTop: '1px solid #404040', justifyContent: 'flex-end' }}>
              <button className="toolbar-btn" onClick={() => { localStorage.setItem('desktopSuggestionDismissed','1'); setShowDesktopSuggestion(false); }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Persistence Toolbar */}
      <div className="persistence-toolbar">
        <div className="toolbar-group">
          <button 
            className="toolbar-btn"
            title="New script"
            onClick={handleNewScript}
          >
            <i className="fas fa-file"></i>
            New
          </button>

          <button 
            className={`toolbar-btn ${isSaving ? 'disabled' : ''}`}
            title="Save current script"
            onClick={saveScript}
            disabled={isSaving}
          >
                <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i>
                Save
              </button>
              
              <button 
                className="toolbar-btn"
                title="Load saved script"
                onClick={() => setShowScriptSelector(true)}
              >
                <i className="fas fa-folder-open"></i>
                Load
              </button>

          {currentScriptId && (
            <button 
              className="toolbar-btn danger"
              title="Delete current script"
              onClick={handleDeleteScript}
            >
              <i className="fas fa-trash"></i>
            </button>
          )}

          <div className="toolbar-divider"></div>

          {/* Script Title and Last Saved Info */}
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '8px', marginRight: '8px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f5f5f5' }}>{currentScriptTitle}</span>
            <span style={{ fontSize: '0.7rem', color: '#999' }}>
              {currentScriptUpdated ? `Last saved: ${currentScriptUpdated.toLocaleDateString()} ${currentScriptUpdated.toLocaleTimeString()}` : 'Last saved: Never'}
            </span>
          </div>

          <div className="toolbar-divider"></div>
          
          {/* Character List Button */}
          <button 
            className={`toolbar-btn character-btn ${characters.length === 0 ? 'disabled' : ''}`}
            onClick={() => characters.length > 0 && setIsCharacterModalOpen(true)}
            title={characters.length > 0 ? 'Character List' : 'No characters found'}
            disabled={characters.length === 0}
          >
            <i className="fas fa-user"></i>
            Characters
            {characters.length > 0 && (
              <span className="character-count-badge">{characters.length}</span>
            )}
          </button>

          {/* Help Button (writing help) */}
          <button 
            className="toolbar-btn help-btn"
            onClick={() => setIsHelpModalOpen(true)}
            title="Writing help (Fountain syntax & tips)"
            aria-label="Open writing help"
          >
            <i className="fas fa-pen" aria-hidden="true"></i>
            Help
          </button>
          {/* Demo Button */}
          <button
            className="toolbar-btn demo-btn"
            onClick={() => setIsDemoModalOpen(true)}
            title="Show demo scripts"
            aria-label="Open demo scripts modal"
            style={{ backgroundColor: '#e75480', color: 'white', marginLeft: 0 }}
          >
            <i className="fas fa-download" aria-hidden="true"></i>
            Demo
          </button>

          {/* Logout Button */}
          {user && (
            <>
              <div className="toolbar-divider"></div>
              <button
                className="toolbar-btn"
                onClick={handleLogout}
                title={`Logged in as ${user.email}`}
                aria-label="Logout"
                style={{ marginLeft: 'auto' }}
              >
                <i className="fas fa-sign-out-alt" aria-hidden="true"></i>
                Logout
              </button>
            </>
          )}

          {/* Move last-saved next to Characters button for better discoverability */}
          {lastSavedDate && (
            <div className="last-saved" style={{ marginLeft: 8 }}>
              Last saved: {lastSavedDate.toLocaleDateString()} at {lastSavedDate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Demo Scripts Modal */}
      {isDemoModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDemoModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '0.03em', color: '#fff', marginBottom: '0.5em' }}>Demo Scripts</h2>
              <button className="modal-close" onClick={() => setIsDemoModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <style>{`
                .modal-content, .modal-header, .modal-body, .demo-section h2, .demo-section p {
                  color: #fff !important;
                }
                .demo-section h2 {
                  font-size: 1.3rem;
                  font-weight: 600;
                  margin-bottom: 0.25em;
                  margin-top: 1.2em;
                  letter-spacing: 0.02em;
                }
                .demo-section p {
                  padding: 0.5em 0 0.75em 0;
                  line-height: 1.6;
                  color: #b0b0b0 !important;
                }
                .demo-section .toolbar-btn {
                  background-color: #e75480;
                  color: #fff;
                  border: none;
                  font-weight: 600;
                  box-shadow: 0 2px 8px rgba(231,84,128,0.08);
                }
                .demo-section .toolbar-btn:hover {
                  background-color: #c63c6e;
                }
              `}</style>
              <div className="demo-section">
                <h2>🎬 Film</h2>
                <p>A short live-action sample set in a street café. Demonstrates panels, dialogue, and images.</p>
                <button className="toolbar-btn" onClick={() => {
                  fetch("/demo-scripts/film_the_coffee_deal.fountain")
                    .then(r => r.text())
                    .then(txt => { setCode(txt); processText(txt); setIsDemoModalOpen(false); });
                }}><span style={{marginRight: '0.5em'}}><i className="fas fa-download" aria-hidden="true"></i></span>Load Film Demo</button>
              </div>
              <hr style={{borderColor: '#444', opacity: 0.5}} />
              <div className="demo-section">
                <h2>🎬 Animation</h2>
                <p>A musical animation sample featuring a singing squirrel. Shows lyrics, musical cues, and character interaction.</p>
                <button className="toolbar-btn" onClick={() => {
                  fetch("/demo-scripts/animation_the_singing_squirrel.fountain")
                    .then(r => r.text())
                    .then(txt => { setCode(txt); processText(txt); setIsDemoModalOpen(false); });
                }}><span style={{marginRight: '0.5em'}}><i className="fas fa-download" aria-hidden="true"></i></span>Load Animation Demo</button>
              </div>
              <hr style={{borderColor: '#444', opacity: 0.5}} />
              <div className="demo-section">
                <h2>🎬 Advertising</h2>
                <p>A playful ad script for Happy Fun Ball. Demonstrates panels, mock disclaimers, and ad-style dialogue.</p>
                <button className="toolbar-btn" onClick={() => {
                  fetch("/demo-scripts/ad_happy_fun_ball.fountain")
                    .then(r => r.text())
                    .then(txt => { setCode(txt); processText(txt); setIsDemoModalOpen(false); });
                }}><span style={{marginRight: '0.5em'}}><i className="fas fa-download" aria-hidden="true"></i></span>Load Advertising Demo</button>
              </div>
              <hr style={{borderColor: '#444', opacity: 0.5}} />
              <div className="demo-section">
                <h2>🎬 Documentary</h2>
                <p>A documentary sample with voice-over, captions, and subtitles. Shows non-fiction structure and panel usage.</p>
                <button className="toolbar-btn" onClick={() => {
                  fetch("/demo-scripts/documentary_voices_of_the_river.fountain")
                    .then(r => r.text())
                    .then(txt => { setCode(txt); processText(txt); setIsDemoModalOpen(false); });
                }}><span style={{marginRight: '0.5em'}}><i className="fas fa-download" aria-hidden="true"></i></span>Load Documentary Demo</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile View Toggle */}
      <div className="mobile-view-toggle">
        <div className="tabs is-centered">
          <ul>
            <li className={viewMode === 'edit' ? 'is-active' : ''}>
              <a onClick={() => setViewMode('edit')}>
                <span className="icon is-small">
                  <i className="fas fa-edit" aria-hidden="true"></i>
                </span>
                <span>Edit</span>
              </a>
            </li>
            <li className={viewMode === 'preview' ? 'is-active' : ''}>
              <a onClick={() => setViewMode('preview')}>
                <span className="icon is-small">
                  <i className="fas fa-eye" aria-hidden="true"></i>
                </span>
                <span>Preview</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Editor Layout */}
      <div className="editor-layout">
        {/* Fullscreen toggle shown when side-by-side (hidden on small screens via CSS) */}
        <button
          className={`toolbar-btn fullscreen-btn ${isFullscreen ? 'is-active' : ''}`}
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`} aria-hidden="true"></i>
        </button>
        <div className="columns is-gapless">
          {/* Code Editor - Left Side */}
          <div className={`column is-half-desktop ${viewMode === 'preview' ? 'mobile-hidden' : ''}`}>
            <div className="box editor-box">
              <h3 className="title is-6">Editor</h3>
              <CodeMirrorEditor
                ref={editorRef}
                value={code}
                onChange={handleCodeChange}
                onCursorChange={handleCursorChange}
                placeholder="Type your fountain screenplay here..."
              />
            </div>
          </div>

          {/* Preview - Right Side */}
          <div className={`column is-half-desktop ${viewMode === 'edit' ? 'mobile-hidden' : ''}`}>
            <div className="box preview-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 className="title is-6" style={{ margin: 0 }}>Live Preview:</h3>
                  <div className="pane-toggle" style={{ display: 'flex' }}>
                    <button
                      className={`toolbar-btn pane-toggle-btn ${previewPane === 'screenplay' ? 'is-active' : ''}`}
                      onClick={() => setPreviewPane('screenplay')}
                      aria-pressed={previewPane === 'screenplay'}
                      title="Show screenplay preview"
                    >
                      Screenplay
                    </button>
                    <button
                      className={`toolbar-btn pane-toggle-btn ${previewPane === 'player' ? 'is-active' : ''}`}
                      onClick={() => setPreviewPane('player')}
                      aria-pressed={previewPane === 'player'}
                      title="Show media player"
                    >
                      Player
                    </button>
                  </div>
                </div>
                <div />
              </div>

              {previewPane === 'screenplay' ? (
                <div className="preview-content" ref={previewRef}>
                  {blocks.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                      Loading preview...
                    </div>
                  ) : (
                    blocks.map((block) => (
                      <div 
                        key={block.id} 
                        className={`preview-line ${block.className || ''} ${block.index === currentLine ? 'current-line' : ''}`}
                        data-type={block.type}
                        data-line-id={block.id}
                        data-line-index={block.index}
                        onClick={() => handlePreviewClick(block.index)}
                        style={{ cursor: 'pointer' }}
                      >
                        {block.type === 'image' || block.type === 'audio' || block.type === 'title_page' || block.type === 'page_break' || block.type === 'page_number' ? (
                          <div dangerouslySetInnerHTML={{ __html: block.text }} />
                        ) : (
                          block.text || '\u00A0'
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="media-player" ref={mediaPlayerRef} style={{ padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }}>
                  {/* Panel header: title + duration */}
                  {(() => {
                    const p = (panels && panels.length > 0) ? (panels[playerIndex] || panels[0]) : null
                    const dur = p && typeof p.duration === 'number' ? p.duration : null
                    const total = (panels && panels.length) ? panels.length : 0

                    // Normalize title: strip leading "Panel N:" if present, default to 'untitled'
                    const rawTitle = p && p.title ? String(p.title) : ''
                    let titleText = 'untitled'
                    if (rawTitle && rawTitle.trim()) {
                      titleText = rawTitle.replace(/^\s*Panel\s*\d+\s*[:\-]\s*/i, '').trim()
                      if (!titleText) titleText = 'untitled'
                    }

                    return (
                      <div className="player-header" style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div>
                          {/* Title (prominent) with inline index/total indicator */}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                              <div className="panel-title-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
                                <div
                                  className="panel-title"
                                  style={{ fontSize: '1.05rem', fontWeight: 700 }}
                                  onMouseEnter={() => setShowNestingTooltip(true)}
                                  onMouseLeave={() => setShowNestingTooltip(false)}
                                  onClick={() => setShowNestingTooltip((v) => !v)}
                                  aria-haspopup="true"
                                  aria-expanded={showNestingTooltip}
                                >
                                  {titleText}
                                </div>
                                {p && p.nesting && (showNestingTooltip) ? (
                                  <div className="panel-nesting-tooltip" role="tooltip">
                                    {p.nesting.act ? <div><strong>Act:</strong> {p.nesting.act}</div> : null}
                                    {p.nesting.scene ? <div><strong>Scene:</strong> {p.nesting.scene}</div> : null}
                                    {p.nesting.sequence ? <div><strong>Sequence:</strong> {p.nesting.sequence}</div> : null}
                                    {!p.nesting.act && !p.nesting.sequence && !p.nesting.scene ? <div style={{ color: '#999' }}>No nesting</div> : null}
                                  </div>
                                ) : null}
                              </div>
                            <div style={{ fontSize: '0.85rem', color: '#bdbdbd' }}>{`(${playerIndex + 1} / ${total})`}</div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 12, marginTop: '0.25rem', fontSize: '0.85rem', color: '#999' }}>
                            <div style={{ color: '#999' }}>lines {p && typeof p.startLine === 'number' ? p.startLine : '?'}–{p && typeof p.endLine === 'number' ? p.endLine : '?'}</div>
                          </div>
                          </div>

                          {/* Top-right controls (smaller) with duration floated right */}
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.85rem', color: '#999', display: 'flex', alignItems: 'center', gap: 6, marginRight: 6 }}><span style={{ fontSize: '0.95rem' }}>⏱</span>{dur ? `${dur}s` : 'n/a'}</div>
                          <button className="toolbar-btn" title="Stop" aria-label="Stop" onClick={handleStop} style={{ padding: '0.25rem 0.4rem', fontSize: '0.9rem' }}>⏹</button>
                          <button className={`toolbar-btn ${isPlaying ? 'is-active' : ''}`} title="Play" aria-label="Play" onClick={handlePlay} style={{ padding: '0.25rem 0.4rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {isPlaying ? <span className="playing-indicator" aria-hidden="true" /> : null}
                            ▶︎
                          </button>
                          <button className="toolbar-btn" title="Pause" aria-label="Pause" onClick={handlePause} style={{ padding: '0.25rem 0.4rem', fontSize: '0.9rem' }}>⏸</button>
                          <button className="toolbar-btn" title="Previous" aria-label="Previous" onClick={gotoPrev} style={{ padding: '0.25rem 0.4rem', fontSize: '0.9rem' }}>⏮</button>
                          <button className="toolbar-btn" title="Next" aria-label="Next" onClick={gotoNext} style={{ padding: '0.25rem 0.4rem', fontSize: '0.9rem' }}>⏭</button>
                          </div>
                        </div>

                        {/* Progress bar placed under the title/line area and just above the header bottom border */}
                        {isPlaying && (() => {
                          const p = (panels && panels.length > 0) ? (panels[playerIndex] || panels[0]) : null
                          const dur = p && typeof p.duration === 'number' ? p.duration : null
                          const durMs = Math.max(1000, (typeof dur === 'number' ? dur * 1000 : 3000))
                          return (
                            <div className="player-header-progress-wrapper" style={{ position: 'relative' }}>
                              <div
                                key={`player-progress-${playerIndex}-${durMs}`}
                                className={`player-progress`}
                                style={{
                                  animationDuration: `${durMs}ms`
                                }}
                                aria-hidden="true"
                              />
                            </div>
                          )
                        })()}

                      </div>
                    )
                  })()}
                  

                  {/* Image area (or black end slide if playback ended) */}
                  {(() => {
                    if (playbackEnded) {
                      return (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ width: '100%', maxWidth: 640, borderRadius: 6, background: '#000', aspectRatio: '16/9' }} />
                        </div>
                      )
                    }
                    const p = (panels && panels.length > 0) ? (panels[playerIndex] || panels[0]) : null
                    const img = p && p.imageUrl ? p.imageUrl : null
                    return (
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                        {img ? (
                          <img src={img} alt="panel" style={{ width: '100%', maxWidth: 640, borderRadius: 6 }} />
                        ) : (
                          <div style={{ width: '100%', maxWidth: 640, borderRadius: 6, background: '#f0f0f0', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a9a' }}>
                            <span>No image</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Audio element */}
                  {(() => {
                    const p = (panels && panels.length > 0) ? (panels[playerIndex] || panels[0]) : null
                    const aud = p && p.audioUrl ? p.audioUrl : null
                    return (
                      <div style={{ marginBottom: '0.75rem' }}>
                        {aud ? (
                          <audio ref={audioRef} controls src={aud} style={{ width: '100%' }} />
                        ) : (
                          <audio ref={audioRef} controls disabled style={{ width: '100%' }} />
                        )}

                        {/* controls are in header */}
                      </div>
                    )
                  })()}

                  {/* Panel script snippet (rendered like the preview) */}
                  <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: '0.75rem' }}>
                    {(!panels || panels.length === 0) ? (
                      <div style={{ color: '#999' }}>No panel content found in the script. Add '####' headings to create panels.</div>
                    ) : (
                      (() => {
                        const p = (panels && panels.length > 0) ? (panels[playerIndex] || panels[0]) : null
                        return (
                          <div>
                            <div style={{ padding: '0.5rem' }}>
                              <div className="preview-content player-preview-content" style={{ margin: 0 }}>
                                {p && p.blocks && p.blocks.length > 0 ? (
                                  p.blocks.map((b) => (
                                    <div key={b.id} className={`preview-line ${b.className || ''}`} dangerouslySetInnerHTML={{ __html: b.text || '\u00A0' }} />
                                  ))
                                ) : p && p.snippet ? (
                                  p.snippet.split(/\r?\n/).map((ln, i) => (
                                    <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{ln || '\u00A0'}</div>
                                  ))
                                ) : (
                                  <div style={{ color: '#999' }}>No content for this panel.</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })()
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {isHelpModalOpen && (
        <div className="modal-overlay" onClick={() => setIsHelpModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Fountain.ext Format Reference</h2>
              <button 
                className="modal-close"
                onClick={() => setIsHelpModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="help-section">
                <h3>Title Page</h3>
                <div className="help-example">
                  <code>
                    Title: THE GREAT FOUNTAIN SCRIPT<br/>
                    Credit: Written by<br/>
                    Author: John Dope<br/>
                    Authors: John Dope and Jane Smith<br/>
                    Source: Based on the novel by Famous Writer<br/>
                    Draft Date: October 4, 2025<br/>
                    Date: 10/04/2025<br/>
                    Contact:<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;John Dope<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;555-123-4567<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;john@example.com<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;Literary Agent<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;Agency Name<br/>
                    &nbsp;&nbsp;&nbsp;&nbsp;agent@agency.com<br/>
                    Notes: This is a sample script<br/>
                    Copyright: (c) 2025 John Dope
                  </code>
                  <p>
                    Title page elements appear at the top of your script. All are optional.
                    The parser recognizes a wide range of common title-page keys (case-insensitive). Examples include:
                    <ul>
                      <li><strong>title</strong>, <strong>credit</strong></li>
                      <li><strong>author</strong>, <strong>authors</strong>, <strong>writer</strong>, <strong>writers</strong></li>
                      <li><strong>written by</strong>, <strong>screenplay by</strong>, <strong>teleplay by</strong></li>
                      <li><strong>story by</strong>, <strong>adaptation by</strong></li>
                      <li><strong>source</strong>, <strong>based on</strong>, <strong>based on characters by</strong></li>
                      <li><strong>notes</strong>, <strong>draft</strong>, <strong>draft date</strong>, <strong>draft #</strong></li>
                      <li><strong>revision</strong>, <strong>revision date</strong>, <strong>revision color</strong></li>
                      <li><strong>date</strong>, <strong>contact</strong>, <strong>copyright</strong></li>
                      <li><strong>wga</strong>, <strong>wga registration</strong>, <strong>registration</strong>, <strong>registration #</strong></li>
                      <li><strong>series</strong>, <strong>episode</strong>, <strong>episode title</strong>, <strong>showrunner</strong></li>
                      <li><strong>production</strong>, <strong>production company</strong></li>
                    </ul>
                    The parser accepts alternate spacing (for example <code>written by:</code>) and is case-insensitive. Use "Author" for a single writer and "Authors" for multiple. Contact blocks may be multi-line (indent subsequent lines). End the title page with <code>===</code> (page break).
                  </p>
                </div>
              </div>

              <div className="help-section">
                <h3>Scene Headings</h3>
                <div className="help-example">
                  <code>
                    EXT. PARKING LOT - DAY<br/>
                    INT. COFFEE SHOP - NIGHT<br/>
                    .MONTAGE - CODING AND COFFEE
                  </code>
                  <p>Scene headings start with INT./EXT./EST./I\/E or a period (.) for special scenes.</p>
                </div>
              </div>

              <div className="help-section">
                <h3>Characters & Dialogue</h3>
                <div className="help-example">
                  <code>
                    MENTOR<br/>
                    Welcome to the team!<br/><br/>
                    @MENTOR<br/>
                    (power user syntax)<br/><br/>
                    USER #1<br/>
                    Thanks for having me.<br/><br/>
                    BOB O'SHAUNNESSY<br/>
                    (whispering)<br/>
                    This is a parenthetical.
                  </code>
                  <p>
                    Characters are normally written in ALL CAPS (e.g., <code>BOB</code>, <code>DR. SMITH</code>), but the editor also supports a power-user <code>@</code> prefix for mixed-case or unusual names (for example <code>@John Doe</code>).
                    Character matching is Unicode-aware: a character name must start with an uppercase Unicode letter and may contain Unicode letters, numbers, apostrophes (<code>'</code>), hyphens (<code>-</code>), spaces or tabs. The power-user <code>@</code> form (<code>@Name</code>) allows mixed case and additional punctuation where needed.
                    Parentheticals (for example <code>(whispering)</code>) are recognized when placed immediately after a character name and are rendered as parentheticals; the lines that follow are treated as dialogue. For dual dialogue, append <code>^</code> to stacked character names—these must appear consecutively above the dialogue block.
                    Edge cases: the lexer intentionally requires the name to begin with an uppercase Unicode letter to avoid accidental matches inside action text; use the <code>@</code> prefix for names that don't follow the all-caps convention or that start with non-letter characters. This supports non-ASCII names (for example: <strong>ÉLODIE</strong>, <strong>ŁUKASZ</strong>, <strong>张伟</strong>) and matches uppercase letters across many scripts.
                  </p>
                </div>
              </div>

              <div className="help-section">
                <h3>Dual Dialogue</h3>
                <div className="help-example">
                  <code>
                    ALICE^<br/>
                    BOB^<br/>
                    CHARLIE^<br/>
                    I can't believe it!<br/>
                    <br/>
                    CHARLIE ^<br/>
                    DAVE ^<br/>
                    (disgusted)<br/>
                    Eew. no it's nooot!<br/><br/>
                  </code>
                  <p>For dual dialogue, all character names with ^ must be stacked consecutively at the top, then their dialogue follows in order. This creates side-by-side dialogue spoken simultaneously.</p>
                </div>
              </div>

              <div className="help-section">
                <h3>Action Lines</h3>
                <div className="help-example">
                  <code>
                    Bob walks into the room and looks around nervously.<br/><br/>
                    The computer screen flickers to life.
                  </code>
                  <p>Action lines describe what happens on screen.</p>
                </div>
              </div>

              <div className="help-section">
                <h3>Transitions</h3>
                <div className="help-example">
                  <code>
                    FADE IN:<br/>
                    CUT TO:<br/>
                    FADE TO BLACK.<br/>
                    &gt; CUT TO BLACK.
                  </code>
                  <p>
                    Transitions control scene changes. The matcher supports a wider set of transition phrases (for example: <code>FADE IN:</code>, <code>FADE OUT.</code>, <code>CUT TO:</code>, <code>SMASH CUT TO:</code>, <code>MATCH CUT TO:</code>, <code>DISSOLVE TO:</code>, <code>WIPE TO:</code>, <code>BACK TO:</code>, and other common variants). Use <code>&gt;</code> for the power-user transition syntax.
                  </p>
                </div>
              </div>

              <div className="help-section">
                <h3>Centered Text</h3>
                <div className="help-example">
                  <code>
                    &gt;INTERMISSION&lt;<br/>
                    &gt;THE END&lt;
                  </code>
                  <p>Text wrapped in &gt; and &lt; appears centered (great for titles or breaks).</p>
                </div>
              </div>

              <div className="help-section">
                <h3>Act/Scene/Sequence/Panel Hierarchy</h3>
                <div className="help-example">
                  <code>
                    # Act I<br/>
                    ## Scene 1: The Beginning<br/>
                    ### Sequence A: Setup<br/>
                    #### Panel 1<br/>
                    02:30<br/>
                    [i]https://example.com/storyboard1.jpg<br/>
                    [a]https://example.com/dialogue.mp3<br/><br/>
                    #### Panel 2<br/>
                    01:15<br/>
                    [i]https://example.com/storyboard2.jpg
                  </code>
                  <p>Use # for Acts, ## for Scenes, ### for Sequences, #### for Panels. This hierarchy is designed for storyboarding workflows. Durations (mm:ss format) are only used with #### Panels. Images and audio are typically used at the #### Panel level for detailed storyboard frames and audio references.</p>
                </div>
              </div>

              <div className="help-section">
                <h3>Notes & Comments</h3>
                <div className="help-example">
                  <code>
                    [[This is a note for the writer]]<br/><br/>
                    Some action here [[with an inline note]] continues.
                  </code>
                  <p>Notes wrapped in [[ ]] are for writer reference and don't appear in final script.</p>
                </div>
              </div>

              <div className="help-section">
                <h3>Special Elements</h3>
                <div className="help-example">
                  <code>
                    = Synopsis: Brief scene description<br/><br/>
                    ===<br/>
                    (Page Break)<br/><br/>
                    ~Lyrics:<br/>
                    ~"Happy birthday to you"<br/>
                    ~"Happy birthday to you"
                  </code>
                  <p>Use = for synopsis notes, === for page breaks, ~ for lyrics. Each lyric line must begin with ~.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Character List Modal */}
      {isCharacterModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCharacterModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Character List</h2>
              <button 
                className="modal-close"
                onClick={() => setIsCharacterModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {characters.length === 0 ? (
                <p>No characters found in the script.</p>
              ) : (
                <div className="character-list">
                  {characters.map((character) => (
                    <div key={character} className="character-item">
                      <div className="character-name">{character}</div>
                      <div className="character-count">
                        {characterLineCounts.get(character) || 0} dialogue lines
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App