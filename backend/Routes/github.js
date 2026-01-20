const express = require('express');
const router = express.Router();

// GitHub API base URL
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

// Helper function to fetch from GitHub API
const fetchGitHub = async (url, res) => {
    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CloudNote-GitHub-Proxy'
        };

        // Add GitHub token if available (optional, for higher rate limits)
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Repository or resource not found' });
            }
            if (response.status === 403) {
                return res.status(403).json({ error: 'GitHub API rate limit exceeded. Try again later.' });
            }
            return res.status(response.status).json({ error: 'GitHub API error' });
        }

        return await response.json();
    } catch (error) {
        console.error('GitHub API Error:', error);
        return res.status(500).json({ error: 'Failed to fetch from GitHub API' });
    }
};

// GET /api/github/repo/:owner/:repo - Get repository metadata
router.get('/repo/:owner/:repo', async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;

        const data = await fetchGitHub(url, res);
        if (!data) return; // Error already handled in fetchGitHub

        // Return essential repo info
        res.json({
            name: data.name,
            fullName: data.full_name,
            description: data.description,
            defaultBranch: data.default_branch,
            language: data.language,
            stars: data.stargazers_count,
            forks: data.forks_count,
            isPrivate: data.private
        });
    } catch (error) {
        console.error('Error fetching repo:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/github/tree/:owner/:repo/:branch? - Get repository file tree
router.get('/tree/:owner/:repo/:branch?', async (req, res) => {
    try {
        const { owner, repo, branch = 'main' } = req.params;

        // First, try to get the default branch if 'main' doesn't exist
        let actualBranch = branch;
        if (branch === 'main') {
            const repoUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
            const repoData = await fetchGitHub(repoUrl, res);
            if (!repoData) return;
            actualBranch = repoData.default_branch || 'main';
        }

        // Get the tree recursively
        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${actualBranch}?recursive=1`;
        const data = await fetchGitHub(url, res);
        if (!data) return;

        // Filter and organize the tree
        const tree = data.tree
            .filter(item => item.type === 'blob' || item.type === 'tree') // Only files and folders
            .map(item => ({
                path: item.path,
                type: item.type === 'blob' ? 'file' : 'folder',
                size: item.size,
                sha: item.sha
            }));

        res.json({
            branch: actualBranch,
            tree: tree
        });
    } catch (error) {
        console.error('Error fetching tree:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/github/file/:owner/:repo/:branch/*path - Get file content
router.get('/file/:owner/:repo/:branch/*', async (req, res) => {
    try {
        const { owner, repo, branch } = req.params;
        const filePath = req.params[0]; // Everything after /branch/

        if (!filePath) {
            return res.status(400).json({ error: 'File path is required' });
        }

        // Fetch raw file content
        const url = `${GITHUB_RAW_BASE}/${owner}/${repo}/${branch}/${filePath}`;

        const headers = {
            'User-Agent': 'CloudNote-GitHub-Proxy'
        };

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'File not found' });
            }
            return res.status(response.status).json({ error: 'Failed to fetch file' });
        }

        const content = await response.text();

        res.json({
            path: filePath,
            content: content
        });
    } catch (error) {
        console.error('Error fetching file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
