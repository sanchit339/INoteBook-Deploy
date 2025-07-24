import React, { useState } from 'react';
import data from '../data/dsa-repo.json';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const FileBrowser = () => {
  const [selectedFile, setSelectedFile] = useState(null);

  const files = data;

  // Convert flat paths into a nested object
  const grouped = {};
  files.forEach(file => {
    const parts = file.path.split('/');
    let current = grouped;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        current[part] = file.content;
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    });
  });

  const renderTree = (node, parentPath = '') => {
    return Object.entries(node).map(([key, value]) => {
      const fullPath = parentPath ? `${parentPath}/${key}` : key;

      if (typeof value === 'string') {
        return (
          <div key={fullPath} className="ml-4">
            <button
              onClick={() => setSelectedFile({ name: fullPath, content: value })}
              className="text-blue-600 hover:underline"
            >
              📄 {key}
            </button>
          </div>
        );
      } else {
        return (
          <div key={fullPath} className="ml-4 mt-2">
            <div className="font-semibold">📁 {key}</div>
            {renderTree(value, fullPath)}
          </div>
        );
      }
    });
  };

  return (
    <div className="flex h-screen">
      <div className="w-1/3 border-r p-3 overflow-auto">
        <h2 className="font-bold text-lg mb-3">📚 Repo Files</h2>
        {renderTree(grouped)}
      </div>
      <div className="w-2/3 p-4 overflow-auto">
        {selectedFile ? (
          <>
            <h3 className="font-semibold mb-2">📝 {selectedFile.name}</h3>
            <SyntaxHighlighter language="javascript" style={oneDark}>
              {selectedFile.content}
            </SyntaxHighlighter>
          </>
        ) : (
          <p className="text-gray-500">Select a file to view its content</p>
        )}
      </div>
    </div>
  );
};

export default FileBrowser;