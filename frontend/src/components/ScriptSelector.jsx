import React, { useState, useEffect } from 'react'
import './ScriptSelector.css'

export default function ScriptSelector({ onSelectScript, onCancel }) {
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchScripts()
  }, [])

  const fetchScripts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/scripts', {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch scripts')
      }
      
      const data = await response.json()
      setScripts(data.scripts || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadScript = (script) => {
    onSelectScript(script)
  }

  if (loading) {
    return (
      <div className="script-selector">
        <div className="script-selector-header">
          <h2>Load Script</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        <div className="script-selector-content">
          <p>Loading scripts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="script-selector">
        <div className="script-selector-header">
          <h2>Load Script</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        <div className="script-selector-content">
          <p className="error">Error: {error}</p>
          <button className="toolbar-btn" onClick={onCancel}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="script-selector">
      <div className="script-selector-header">
        <h2>Load Script</h2>
        <button className="close-btn" onClick={onCancel}>×</button>
      </div>
      <div className="script-selector-content">
        {scripts.length === 0 ? (
          <div className="no-scripts">
            <p>No scripts found. Create your first script!</p>
            <button className="toolbar-btn" onClick={onCancel}>Close</button>
          </div>
        ) : (
          <table className="scripts-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Last Modified</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map((script) => (
                <tr key={script.id}>
                  <td className="script-title">{script.title}</td>
                  <td>{new Date(script.updated_at).toLocaleString()}</td>
                  <td>{new Date(script.created_at).toLocaleString()}</td>
                  <td>
                    <button 
                      className="load-script-btn"
                      onClick={() => handleLoadScript(script)}
                    >
                      Load
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
