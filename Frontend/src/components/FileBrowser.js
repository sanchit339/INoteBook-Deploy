import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './FileBrowser.css';
import {
  initializeEncryption,
  saveEncrypted,
  loadEncrypted,
  isEncryptionAvailable
} from '../utils/cryptoUtils';
import { getApiBase } from '../utils/apiBase';
import { logClientEvent } from '../utils/clientLogger';

const MENU_ITEMS = [
  {
    label: 'File',
    items: [
      { id: 'open-project', label: 'Open Project…', shortcut: 'Ctrl+O' },
      { id: 'close-project', label: 'Close Project' },
      { id: 'divider' },
      { id: 'refresh', label: 'Refresh', shortcut: 'F5' },
      { id: 'divider' },
      { id: 'exit', label: 'Exit Workbench' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
      { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A' },
    ],
  },
  {
    label: 'Navigate',
    items: [
      { id: 'goto-resource', label: 'Open Resource…', shortcut: 'Ctrl+Shift+R' },
    ],
  },
  {
    label: 'Search',
    items: [
      { id: 'search-file', label: 'Search in Resource…' },
    ],
  },
  {
    label: 'Project',
    items: [
      { id: 'open-project', label: 'Open Project…' },
      { id: 'close-project', label: 'Close Project' },
    ],
  },
  {
    label: 'Run',
    items: [
      { id: 'noop', label: 'Run As…', disabled: true },
    ],
  },
  {
    label: 'Window',
    items: [
      { id: 'show-explorer', label: 'Show View → Package Explorer' },
      { id: 'toggle-explorer', label: 'Toggle Package Explorer' },
    ],
  },
  {
    label: 'Help',
    items: [
      { id: 'about', label: 'About Eclipse IDE' },
    ],
  },
];

const FileBrowser = () => {
  const [projects, setProjects] = useState([]);
  const [activeProjectIndex, setActiveProjectIndex] = useState(null);
  const [projectInput, setProjectInput] = useState('');
  const [fileTree, setFileTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [openEditors, setOpenEditors] = useState([]); // { path, content }
  const [activeEditorPath, setActiveEditorPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(280);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const dialogInputRef = useRef(null);
  const menuBarRef = useRef(null);

  const API_BASE = getApiBase();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeEncryption();
        const isReady = await isEncryptionAvailable();
        setEncryptionReady(isReady);

        if (isReady) {
          const saved = await loadEncrypted('repositories');
          if (saved && Array.isArray(saved) && saved.length > 0) {
            setProjects(saved);
            setActiveProjectIndex(0);
            setFileTree(saved[0].tree);
            setStatusMessage(`Workspace restored · ${saved.length} project(s)`);
          }
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    const saveProjects = async () => {
      if (encryptionReady && projects.length > 0) {
        try {
          await saveEncrypted('repositories', projects);
        } catch (err) {
          console.error('Failed to save workspace:', err);
        }
      }
    };
    saveProjects();
  }, [projects, encryptionReady]);

  useEffect(() => {
    if (showOpenDialog && dialogInputRef.current) {
      dialogInputRef.current.focus();
    }
  }, [showOpenDialog]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setShowOpenDialog(true);
        setOpenMenu(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setShowOpenDialog(true);
        setOpenMenu(null);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        refreshActiveProject();
      }
      if (e.key === 'Escape') {
        setShowOpenDialog(false);
        setShowAbout(false);
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeProjectIndex]);

  const loadProject = async (inputOverride) => {
    const trimmedInput = (inputOverride ?? projectInput).trim();

    if (!trimmedInput || !trimmedInput.includes('/')) {
      setError('Enter path as: team/project');
      setStatusMessage('Invalid project path');
      return;
    }

    const [owner, name] = trimmedInput.split('/');
    if (!owner || !name) {
      setError('Invalid project path');
      return;
    }

    const existingIndex = projects.findIndex((p) => p.fullName === trimmedInput);
    if (existingIndex !== -1) {
      setActiveProjectIndex(existingIndex);
      setFileTree(projects[existingIndex].tree);
      setProjectInput('');
      setShowOpenDialog(false);
      setStatusMessage(`Switched to ${trimmedInput}`);
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage(`Opening project ${trimmedInput}…`);
    await logClientEvent({
      event: 'project_load_start',
      message: 'Project load requested',
      meta: { project: trimmedInput },
    });

    try {
      const projectResponse = await fetch(
        `${API_BASE}/api/resource/project/${owner}/${name}`
      );
      if (!projectResponse.ok) {
        const errorData = await projectResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to open project');
      }
      const projectData = await projectResponse.json();

      const treeResponse = await fetch(
        `${API_BASE}/api/resource/tree/${owner}/${name}/${projectData.defaultBranch}`
      );
      if (!treeResponse.ok) {
        const errorData = await treeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load project structure');
      }
      const treeData = await treeResponse.json();

      const newProject = {
        owner,
        name,
        repo: name,
        fullName: trimmedInput,
        branch: treeData.branch,
        metadata: projectData,
        tree: treeData.tree,
      };

      const next = [...projects, newProject];
      setProjects(next);
      setActiveProjectIndex(next.length - 1);
      setFileTree(treeData.tree);
      setProjectInput('');
      setSelectedFile(null);
      setExpandedFolders(new Set([trimmedInput]));
      setShowOpenDialog(false);
      setStatusMessage(
        `Project ${trimmedInput} opened · ${treeData.tree.length} resources · ${treeData.branch}`
      );

      await logClientEvent({
        event: 'project_load_success',
        message: 'Project loaded',
        meta: { project: trimmedInput, fileCount: treeData.tree.length },
      });

      if (encryptionReady) {
        await saveEncrypted('repositories', next);
      }
    } catch (err) {
      await logClientEvent({
        level: 'error',
        event: 'project_load_error',
        message: err.message || 'Project load failed',
        meta: { project: trimmedInput },
      });
      setError(err.message);
      setStatusMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshActiveProject = async () => {
    if (activeProjectIndex === null || !projects[activeProjectIndex]) return;
    const { fullName, owner, name, repo } = projects[activeProjectIndex];
    const projectName = name || repo;
    setLoading(true);
    setStatusMessage(`Refreshing ${fullName}…`);
    try {
      const projectResponse = await fetch(
        `${API_BASE}/api/resource/project/${owner}/${projectName}`
      );
      if (!projectResponse.ok) throw new Error('Refresh failed');
      const projectData = await projectResponse.json();
      const treeResponse = await fetch(
        `${API_BASE}/api/resource/tree/${owner}/${projectName}/${projectData.defaultBranch}`
      );
      if (!treeResponse.ok) throw new Error('Refresh failed');
      const treeData = await treeResponse.json();
      const next = projects.map((p, i) =>
        i === activeProjectIndex
          ? { ...p, branch: treeData.branch, metadata: projectData, tree: treeData.tree }
          : p
      );
      setProjects(next);
      setFileTree(treeData.tree);
      setStatusMessage(`Refreshed ${fullName}`);
    } catch (err) {
      setError(err.message);
      setStatusMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchProject = (index) => {
    setActiveProjectIndex(index);
    setFileTree(projects[index].tree);
    setSelectedFile(null);
    setExpandedFolders(new Set([projects[index].fullName]));
    setStatusMessage(`Project: ${projects[index].fullName}`);
  };

  const removeProject = async (index, e) => {
    if (e) e.stopPropagation();
    const removed = projects[index];
    const next = projects.filter((_, i) => i !== index);
    setProjects(next);

    if (activeProjectIndex === index) {
      setActiveProjectIndex(next.length > 0 ? 0 : null);
      setFileTree(next.length > 0 ? next[0].tree : []);
      setSelectedFile(null);
      setOpenEditors([]);
      setActiveEditorPath(null);
    } else if (activeProjectIndex > index) {
      setActiveProjectIndex(activeProjectIndex - 1);
    }

    setStatusMessage(removed ? `Closed ${removed.fullName}` : 'Project closed');

    if (encryptionReady) {
      if (next.length > 0) {
        await saveEncrypted('repositories', next);
      } else {
        localStorage.removeItem('cloudnote_encrypted_repositories');
      }
    }
  };

  const loadFile = async (filePath) => {
    if (!projects[activeProjectIndex]) return;

    const existing = openEditors.find((ed) => ed.path === filePath);
    if (existing) {
      setSelectedFile(existing);
      setActiveEditorPath(filePath);
      setStatusMessage(filePath);
      return;
    }

    const { owner, name, repo, branch } = projects[activeProjectIndex];
    const projectName = name || repo;
    setLoading(true);
    setError(null);
    setStatusMessage(`Opening ${filePath}…`);

    try {
      const response = await fetch(
        `${API_BASE}/api/resource/file/${owner}/${projectName}/${branch}/${filePath}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to open resource');
      }
      const data = await response.json();
      const fileObj = { path: filePath, content: data.content };
      setSelectedFile(fileObj);
      setActiveEditorPath(filePath);
      setOpenEditors((prev) => {
        if (prev.some((p) => p.path === filePath)) return prev;
        return [...prev, fileObj];
      });
      setCursorPos({ line: 1, col: 1 });
      setStatusMessage(filePath);
      await logClientEvent({
        event: 'file_load_success',
        message: 'Resource opened',
        meta: { project: `${owner}/${projectName}`, filePath },
      });
    } catch (err) {
      await logClientEvent({
        level: 'error',
        event: 'file_load_error',
        message: err.message || 'Resource open failed',
        meta: { project: `${owner}/${projectName}`, filePath },
      });
      setError(err.message);
      setStatusMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const closeEditor = (path, e) => {
    if (e) e.stopPropagation();
    const next = openEditors.filter((ed) => ed.path !== path);
    setOpenEditors(next);
    if (activeEditorPath === path) {
      const fallback = next[next.length - 1] || null;
      setActiveEditorPath(fallback ? fallback.path : null);
      setSelectedFile(fallback);
    }
  };

  const toggleFolder = (folderPath) => {
    const next = new Set(expandedFolders);
    if (next.has(folderPath)) next.delete(folderPath);
    else next.add(folderPath);
    setExpandedFolders(next);
  };

  const buildTreeStructure = () => {
    const root = {};
    fileTree.forEach((item) => {
      const parts = item.path.split('/');
      let current = root;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          if (item.type === 'file') {
            current[part] = { type: 'file', path: item.path };
          } else {
            current[part] = current[part] || { type: 'folder', children: {} };
          }
        } else {
          current[part] = current[part] || { type: 'folder', children: {} };
          current = current[part].children;
        }
      });
    });
    return root;
  };

  const renderTree = (node, parentPath = '', depth = 0) => {
    return Object.entries(node)
      .sort(([nameA, a], [nameB, b]) => {
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return nameA.localeCompare(nameB);
      })
      .map(([name, item]) => {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        const pad = 8 + depth * 14;

        if (item.type === 'file') {
          const isActive = selectedFile?.path === item.path;
          return (
            <div
              key={fullPath}
              className={`ecl-tree-item ecl-file ${isActive ? 'active' : ''}`}
              style={{ paddingLeft: pad }}
              onClick={() => loadFile(item.path)}
              title={item.path}
            >
              <span className="ecl-tree-icon ecl-file-icon" />
              <span className="ecl-tree-name">{name}</span>
            </div>
          );
        }

        const isExpanded = expandedFolders.has(fullPath);
        return (
          <div key={fullPath} className="ecl-tree-folder">
            <div
              className="ecl-tree-item ecl-folder"
              style={{ paddingLeft: pad }}
              onClick={() => toggleFolder(fullPath)}
              title={fullPath}
            >
              <span className={`ecl-tree-twistie ${isExpanded ? 'open' : ''}`} />
              <span className={`ecl-tree-icon ${isExpanded ? 'ecl-folder-open' : 'ecl-folder-closed'}`} />
              <span className="ecl-tree-name">{name}</span>
            </div>
            {isExpanded && (
              <div className="ecl-tree-children">
                {renderTree(item.children, fullPath, depth + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  const getLanguage = (filePath) => {
    const ext = filePath.split('.').pop().toLowerCase();
    const langMap = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      json: 'json',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      md: 'markdown',
      sh: 'bash',
      yml: 'yaml',
      yaml: 'yaml',
      sql: 'sql',
      properties: 'properties',
      gradle: 'groovy',
    };
    return langMap[ext] || 'text';
  };

  const handleMenuAction = (id) => {
    setOpenMenu(null);
    switch (id) {
      case 'open-project':
      case 'goto-resource':
        setShowOpenDialog(true);
        break;
      case 'close-project':
        if (activeProjectIndex !== null) removeProject(activeProjectIndex);
        break;
      case 'refresh':
        refreshActiveProject();
        break;
      case 'exit':
        window.location.href = '/';
        break;
      case 'copy':
        if (selectedFile?.content) {
          navigator.clipboard?.writeText(selectedFile.content);
          setStatusMessage('Content copied to clipboard');
        }
        break;
      case 'select-all':
        setStatusMessage('Select All');
        break;
      case 'about':
        setShowAbout(true);
        break;
      case 'show-explorer':
        setShowExplorer(true);
        break;
      case 'toggle-explorer':
        setShowExplorer((v) => !v);
        break;
      case 'search-file':
        setShowOpenDialog(true);
        break;
      default:
        break;
    }
  };

  const startResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = explorerWidth;
    const onMove = (ev) => {
      const next = Math.min(480, Math.max(160, startW + (ev.clientX - startX)));
      setExplorerWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [explorerWidth]);

  const activeProject =
    activeProjectIndex !== null ? projects[activeProjectIndex] : null;
  const treeStructure = fileTree.length > 0 ? buildTreeStructure() : {};
  const activeEditor =
    openEditors.find((ed) => ed.path === activeEditorPath) || selectedFile;

  const fileCount = fileTree.filter((t) => t.type === 'file').length;

  return (
    <div className="eclipse-workbench">
      {/* Title bar strip */}
      <div className="ecl-titlebar">
        <span className="ecl-title-text">
          {activeEditor
            ? `${activeEditor.path.split('/').pop()} - ${
                activeProject?.fullName || 'Workspace'
              } - Eclipse IDE`
            : activeProject
            ? `${activeProject.fullName} - Eclipse IDE`
            : 'Eclipse IDE'}
        </span>
      </div>

      {/* Menu bar */}
      <div className="ecl-menubar" ref={menuBarRef}>
        {MENU_ITEMS.map((menu, idx) => (
          <div key={menu.label} className="ecl-menu-item-wrap">
            <button
              type="button"
              className={`ecl-menu-btn ${openMenu === idx ? 'open' : ''}`}
              onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
              onMouseEnter={() => {
                if (openMenu !== null) setOpenMenu(idx);
              }}
            >
              {menu.label}
            </button>
            {openMenu === idx && (
              <div className="ecl-menu-dropdown">
                {menu.items.map((item, i) =>
                  item.id === 'divider' ? (
                    <div key={`d-${i}`} className="ecl-menu-divider" />
                  ) : (
                    <button
                      key={item.id + i}
                      type="button"
                      className={`ecl-menu-entry ${item.disabled ? 'disabled' : ''}`}
                      disabled={item.disabled}
                      onClick={() => handleMenuAction(item.id)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="ecl-shortcut">{item.shortcut}</span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="ecl-toolbar">
        <button
          type="button"
          className="ecl-tool-btn"
          title="Open Project (Ctrl+O)"
          onClick={() => setShowOpenDialog(true)}
        >
          <span className="ecl-tb-icon ecl-tb-open" />
        </button>
        <button
          type="button"
          className="ecl-tool-btn"
          title="Refresh (F5)"
          onClick={refreshActiveProject}
          disabled={!activeProject || loading}
        >
          <span className="ecl-tb-icon ecl-tb-refresh" />
        </button>
        <div className="ecl-tool-sep" />
        <button
          type="button"
          className="ecl-tool-btn"
          title="Toggle Package Explorer"
          onClick={() => setShowExplorer((v) => !v)}
        >
          <span className="ecl-tb-icon ecl-tb-explorer" />
        </button>
        <div className="ecl-tool-sep" />
        <div className="ecl-toolbar-path">
          {activeProject ? (
            <>
              <span className="ecl-path-label">Workspace:</span>
              <span className="ecl-path-value">{activeProject.fullName}</span>
              <span className="ecl-path-branch">[{activeProject.branch}]</span>
            </>
          ) : (
            <span className="ecl-path-label">No project open — File → Open Project…</span>
          )}
        </div>
        {loading && <span className="ecl-toolbar-busy">Working…</span>}
      </div>

      {/* Perspective tabs */}
      <div className="ecl-perspective-bar">
        <div className="ecl-perspective active">Java</div>
        <div className="ecl-perspective">Debug</div>
        <div className="ecl-perspective">Resource</div>
        <div className="ecl-perspective-spacer" />
        {projects.map((p, index) => (
          <div
            key={p.fullName}
            className={`ecl-project-chip ${activeProjectIndex === index ? 'active' : ''}`}
            onClick={() => switchProject(index)}
            title={p.fullName}
          >
            <span className="ecl-chip-icon" />
            <span className="ecl-chip-name">{p.fullName}</span>
            <button
              type="button"
              className="ecl-chip-close"
              onClick={(e) => removeProject(index, e)}
              title="Close Project"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Main body */}
      <div className="ecl-body">
        {showExplorer && (
          <>
            <div className="ecl-view ecl-package-explorer" style={{ width: explorerWidth }}>
              <div className="ecl-view-tabbar">
                <div className="ecl-view-tab active">Package Explorer</div>
                <div className="ecl-view-tab">Outline</div>
              </div>
              <div className="ecl-view-toolbar">
                <button
                  type="button"
                  className="ecl-mini-btn"
                  title="Collapse All"
                  onClick={() => setExpandedFolders(new Set(activeProject ? [activeProject.fullName] : []))}
                >
                  ⊟
                </button>
                <button
                  type="button"
                  className="ecl-mini-btn"
                  title="Open Project"
                  onClick={() => setShowOpenDialog(true)}
                >
                  +
                </button>
              </div>
              <div className="ecl-view-content">
                {activeProject ? (
                  <>
                    <div
                      className="ecl-tree-item ecl-project-root"
                      style={{ paddingLeft: 8 }}
                      onClick={() => toggleFolder(activeProject.fullName)}
                    >
                      <span
                        className={`ecl-tree-twistie ${
                          expandedFolders.has(activeProject.fullName) ? 'open' : ''
                        }`}
                      />
                      <span className="ecl-tree-icon ecl-project-icon" />
                      <span className="ecl-tree-name">{activeProject.fullName}</span>
                    </div>
                    {expandedFolders.has(activeProject.fullName) &&
                      renderTree(treeStructure, '', 1)}
                  </>
                ) : (
                  <div className="ecl-empty-view">
                    <p>No projects in workspace.</p>
                    <button type="button" className="ecl-link-btn" onClick={() => setShowOpenDialog(true)}>
                      Open Project…
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="ecl-sash" onMouseDown={startResize} title="Resize" />
          </>
        )}

        <div className="ecl-editor-area">
          <div className="ecl-editor-tabs">
            {openEditors.length === 0 ? (
              <div className="ecl-editor-tab placeholder">Welcome</div>
            ) : (
              openEditors.map((ed) => (
                <div
                  key={ed.path}
                  className={`ecl-editor-tab ${activeEditorPath === ed.path ? 'active' : ''}`}
                  onClick={() => {
                    setActiveEditorPath(ed.path);
                    setSelectedFile(ed);
                    setStatusMessage(ed.path);
                  }}
                  title={ed.path}
                >
                  <span className="ecl-tab-file-icon" />
                  <span className="ecl-tab-label">{ed.path.split('/').pop()}</span>
                  <button
                    type="button"
                    className="ecl-tab-close"
                    onClick={(e) => closeEditor(ed.path, e)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="ecl-editor-body">
            {error && (
              <div className="ecl-error-banner">
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)}>
                  ×
                </button>
              </div>
            )}

            {activeEditor ? (
              <>
                <div className="ecl-breadcrumb">
                  <span className="ecl-bc-item">{activeProject?.fullName}</span>
                  {activeEditor.path.split('/').map((part, i, arr) => (
                    <React.Fragment key={i}>
                      <span className="ecl-bc-sep">›</span>
                      <span className={i === arr.length - 1 ? 'ecl-bc-item current' : 'ecl-bc-item'}>
                        {part}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                <div className="ecl-code-scroll">
                  {activeEditor.path.toLowerCase().endsWith('.md') ? (
                    <div className="ecl-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneLight}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {activeEditor.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <SyntaxHighlighter
                      language={getLanguage(activeEditor.path)}
                      style={oneLight}
                      showLineNumbers
                      wrapLines
                      customStyle={{
                        margin: 0,
                        padding: '8px 0',
                        background: '#ffffff',
                        fontSize: '12.5px',
                        lineHeight: '1.45',
                        minHeight: '100%',
                      }}
                      lineNumberStyle={{
                        minWidth: '3em',
                        paddingRight: '12px',
                        color: '#8a8a8a',
                        background: '#f5f5f5',
                        borderRight: '1px solid #e0e0e0',
                        marginRight: '12px',
                      }}
                    >
                      {activeEditor.content}
                    </SyntaxHighlighter>
                  )}
                </div>
              </>
            ) : (
              <div className="ecl-welcome">
                <div className="ecl-welcome-card">
                  <div className="ecl-welcome-logo">e</div>
                  <h1>Eclipse IDE</h1>
                  <p className="ecl-welcome-sub">Resource Workbench</p>
                  <div className="ecl-welcome-actions">
                    <button type="button" className="ecl-welcome-btn primary" onClick={() => setShowOpenDialog(true)}>
                      Open Project…
                    </button>
                    <button type="button" className="ecl-welcome-btn" onClick={() => (window.location.href = '/')}>
                      Exit Workbench
                    </button>
                  </div>
                  <ul className="ecl-welcome-tips">
                    <li>
                      <kbd>Ctrl</kbd>+<kbd>O</kbd> Open Project
                    </li>
                    <li>
                      <kbd>F5</kbd> Refresh
                    </li>
                    <li>Path format: <code>team/project</code></li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="ecl-statusbar">
        <div className="ecl-status-left">
          <span className="ecl-status-item">{statusMessage}</span>
        </div>
        <div className="ecl-status-right">
          {encryptionReady && (
            <span className="ecl-status-item" title="Local workspace cache is secured">
              Secure Storage
            </span>
          )}
          {activeProject && (
            <span className="ecl-status-item">
              {fileCount} files · {activeProject.branch}
            </span>
          )}
          {activeEditor && (
            <span className="ecl-status-item">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span className="ecl-status-item">Smart Insert</span>
          <span className="ecl-status-item">UTF-8</span>
          <span className="ecl-status-item">
            {activeEditor ? getLanguage(activeEditor.path).toUpperCase() : 'Text'}
          </span>
        </div>
      </div>

      {/* Open Project dialog */}
      {showOpenDialog && (
        <div className="ecl-modal-overlay" onClick={() => setShowOpenDialog(false)}>
          <div className="ecl-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="ecl-dialog-title">
              <span>Open Project</span>
              <button type="button" className="ecl-dialog-x" onClick={() => setShowOpenDialog(false)}>
                ×
              </button>
            </div>
            <div className="ecl-dialog-body">
              <label className="ecl-field-label" htmlFor="project-path">
                Project path
              </label>
              <input
                id="project-path"
                ref={dialogInputRef}
                type="text"
                className="ecl-field-input"
                placeholder="team/project"
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadProject();
                }}
                disabled={loading}
              />
              <p className="ecl-field-hint">
                Enter the workspace path in the form <strong>owner/name</strong>. Resources are loaded through the application server.
              </p>
              {error && <p className="ecl-field-error">{error}</p>}
            </div>
            <div className="ecl-dialog-footer">
              <button
                type="button"
                className="ecl-dialog-btn primary"
                onClick={() => loadProject()}
                disabled={loading}
              >
                {loading ? 'Opening…' : 'Open'}
              </button>
              <button
                type="button"
                className="ecl-dialog-btn"
                onClick={() => setShowOpenDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About dialog */}
      {showAbout && (
        <div className="ecl-modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="ecl-dialog ecl-about" onClick={(e) => e.stopPropagation()}>
            <div className="ecl-dialog-title">
              <span>About Eclipse IDE</span>
              <button type="button" className="ecl-dialog-x" onClick={() => setShowAbout(false)}>
                ×
              </button>
            </div>
            <div className="ecl-dialog-body ecl-about-body">
              <div className="ecl-welcome-logo small">e</div>
              <h2>Eclipse IDE for Enterprise Java and Web Developers</h2>
              <p>Version 2024-12 (4.34.0)</p>
              <p className="ecl-muted">Resource Workbench · Local workspace client</p>
            </div>
            <div className="ecl-dialog-footer">
              <button type="button" className="ecl-dialog-btn primary" onClick={() => setShowAbout(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
