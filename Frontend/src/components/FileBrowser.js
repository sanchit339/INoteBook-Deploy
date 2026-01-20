import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './FileBrowser.css';
import {
  initializeEncryption,
  saveEncrypted,
  loadEncrypted,
  isEncryptionAvailable
} from '../utils/cryptoUtils';

const FileBrowser = () => {
  const [repos, setRepos] = useState([]); // Array of loaded repos
  const [activeRepoIndex, setActiveRepoIndex] = useState(null);
  const [repoInput, setRepoInput] = useState('');
  const [fileTree, setFileTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [encryptionReady, setEncryptionReady] = useState(false);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4001';

  // Initialize encryption and load saved repositories
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize encryption
        await initializeEncryption();
        const isReady = await isEncryptionAvailable();
        setEncryptionReady(isReady);

        // Load saved repositories from encrypted storage
        if (isReady) {
          const savedRepos = await loadEncrypted('repositories');
          if (savedRepos && Array.isArray(savedRepos) && savedRepos.length > 0) {
            setRepos(savedRepos);
            setActiveRepoIndex(0);
            setFileTree(savedRepos[0].tree);
          }
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    initializeApp();
  }, []);

  // Save repositories to encrypted storage whenever they change
  useEffect(() => {
    const saveRepos = async () => {
      if (encryptionReady && repos.length > 0) {
        try {
          await saveEncrypted('repositories', repos);
        } catch (error) {
          console.error('Failed to save repositories:', error);
        }
      }
    };

    saveRepos();
  }, [repos, encryptionReady]);

  // Load a repository
  const loadRepository = async () => {
    const trimmedInput = repoInput.trim();

    // Validate input format (username/repository)
    if (!trimmedInput || !trimmedInput.includes('/')) {
      setError('Please enter repository in format: username/repository');
      return;
    }

    const [owner, repo] = trimmedInput.split('/');
    if (!owner || !repo) {
      setError('Invalid repository format');
      return;
    }

    // Check if repo is already loaded
    const existingIndex = repos.findIndex(r => r.fullName === trimmedInput);
    if (existingIndex !== -1) {
      setActiveRepoIndex(existingIndex);
      setRepoInput('');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch repository metadata
      const repoResponse = await fetch(`${API_BASE}/api/github/repo/${owner}/${repo}`);
      if (!repoResponse.ok) {
        const errorData = await repoResponse.json();
        throw new Error(errorData.error || 'Failed to fetch repository');
      }
      const repoData = await repoResponse.json();

      // Fetch file tree
      const treeResponse = await fetch(`${API_BASE}/api/github/tree/${owner}/${repo}/${repoData.defaultBranch}`);
      if (!treeResponse.ok) {
        const errorData = await treeResponse.json();
        throw new Error(errorData.error || 'Failed to fetch file tree');
      }
      const treeData = await treeResponse.json();

      // Add repo to list
      const newRepo = {
        owner,
        repo,
        fullName: trimmedInput,
        branch: treeData.branch,
        metadata: repoData,
        tree: treeData.tree
      };

      const newRepos = [...repos, newRepo];
      setRepos(newRepos);
      setActiveRepoIndex(newRepos.length - 1);
      setFileTree(treeData.tree);
      setRepoInput('');
      setSelectedFile(null);
      setExpandedFolders(new Set());

      // Auto-save to encrypted storage
      if (encryptionReady) {
        await saveEncrypted('repositories', newRepos);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Switch to a different repo
  const switchRepo = (index) => {
    setActiveRepoIndex(index);
    setFileTree(repos[index].tree);
    setSelectedFile(null);
    setExpandedFolders(new Set());
  };

  // Remove a repo
  const removeRepo = async (index, e) => {
    e.stopPropagation();
    const newRepos = repos.filter((_, i) => i !== index);
    setRepos(newRepos);

    if (activeRepoIndex === index) {
      setActiveRepoIndex(newRepos.length > 0 ? 0 : null);
      setFileTree(newRepos.length > 0 ? newRepos[0].tree : []);
      setSelectedFile(null);
    } else if (activeRepoIndex > index) {
      setActiveRepoIndex(activeRepoIndex - 1);
    }

    // Update encrypted storage
    if (encryptionReady) {
      if (newRepos.length > 0) {
        await saveEncrypted('repositories', newRepos);
      } else {
        // Clear storage if no repos left
        localStorage.removeItem('cloudnote_encrypted_repositories');
      }
    }
  };

  // Load file content
  const loadFile = async (filePath) => {
    if (!repos[activeRepoIndex]) return;

    const { owner, repo, branch } = repos[activeRepoIndex];
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/github/file/${owner}/${repo}/${branch}/${filePath}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch file');
      }
      const data = await response.json();
      setSelectedFile({
        path: filePath,
        content: data.content
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle folder expansion
  const toggleFolder = (folderPath) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  // Build tree structure from flat list
  const buildTreeStructure = () => {
    const root = {};

    fileTree.forEach(item => {
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

  // Render tree recursively
  const renderTree = (node, parentPath = '') => {
    return Object.entries(node)
      .sort(([, a], [, b]) => {
        // Folders first, then files
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return 0;
      })
      .map(([name, item]) => {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;

        if (item.type === 'file') {
          return (
            <div
              key={fullPath}
              className={`tree-item file ${selectedFile?.path === item.path ? 'active' : ''}`}
              onClick={() => loadFile(item.path)}
            >
              <span className="icon">📄</span>
              <span className="name">{name}</span>
            </div>
          );
        } else {
          const isExpanded = expandedFolders.has(fullPath);
          return (
            <div key={fullPath} className="tree-folder">
              <div
                className="tree-item folder"
                onClick={() => toggleFolder(fullPath)}
              >
                <span className="icon">{isExpanded ? '📂' : '📁'}</span>
                <span className="name">{name}</span>
              </div>
              {isExpanded && (
                <div className="tree-children">
                  {renderTree(item.children, fullPath)}
                </div>
              )}
            </div>
          );
        }
      });
  };

  // Detect language from file extension
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
    };
    return langMap[ext] || 'text';
  };

  const treeStructure = fileTree.length > 0 ? buildTreeStructure() : {};

  return (
    <div className="github-browser">
      {/* Input Section */}
      <div className="repo-input-section">
        <input
          type="text"
          className="repo-input"
          placeholder="Enter resource path (e.g., team/docs)"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && loadRepository()}
          disabled={loading}
        />
        <button
          className="load-btn"
          onClick={loadRepository}
          disabled={loading}
        >
          {loading ? '⏳ Loading...' : '➕ Load'}
        </button>
        {encryptionReady && (
          <div className="encryption-badge" title="Data is encrypted in browser storage">
            🔒 Secure
          </div>
        )}
      </div>

      {/* Active Repos Tabs */}
      {repos.length > 0 && (
        <div className="repo-tabs">
          {repos.map((repo, index) => (
            <div
              key={repo.fullName}
              className={`repo-tab ${activeRepoIndex === index ? 'active' : ''}`}
              onClick={() => switchRepo(index)}
            >
              <span className="tab-name">{repo.fullName}</span>
              <button
                className="close-tab"
                onClick={(e) => removeRepo(index, e)}
                title="Remove repository"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Main Content */}
      {repos.length > 0 && activeRepoIndex !== null ? (
        <div className="browser-content">
          {/* File Tree */}
          <div className="file-tree">
            <div className="tree-header">
              <h3>📁 {repos[activeRepoIndex].fullName}</h3>
              <small>Branch: {repos[activeRepoIndex].branch}</small>
            </div>
            <div className="tree-content">
              {renderTree(treeStructure)}
            </div>
          </div>

          {/* Code Viewer */}
          <div className="code-viewer">
            {selectedFile ? (
              <>
                <div className="file-header">
                  <h4>📝 {selectedFile.path}</h4>
                </div>
                <div className="code-content">
                  {selectedFile.path.toLowerCase().endsWith('.md') ? (
                    // Render markdown files
                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneDark}
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
                          }
                        }}
                      >
                        {selectedFile.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    // Render other files with syntax highlighting
                    <SyntaxHighlighter
                      language={getLanguage(selectedFile.path)}
                      style={oneDark}
                      showLineNumbers
                      wrapLines
                    >
                      {selectedFile.content}
                    </SyntaxHighlighter>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>👈 Select a file to view its content</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="welcome-state">
          <h2>📂 Resource Library</h2>
          <p>Browse project documentation and resources</p>
          <small>Enter path to load content</small>
        </div>
      )}
    </div>
  );
};

export default FileBrowser;