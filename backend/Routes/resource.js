const express = require('express');
const router = express.Router();

// Upstream source (server-side only — never exposed to clients)
const UPSTREAM_API = 'https://api.github.com';
const UPSTREAM_RAW = 'https://raw.githubusercontent.com';

const fetchUpstream = async (url, res) => {
    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ResourceProxy/1.0'
        };

        if (process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Project or resource not found' });
            }
            if (response.status === 403) {
                return res.status(403).json({ error: 'Request limit exceeded. Try again later.' });
            }
            return res.status(response.status).json({ error: 'Upstream resource error' });
        }

        return await response.json();
    } catch (error) {
        console.error('Resource proxy error:', error);
        return res.status(500).json({ error: 'Failed to fetch resource' });
    }
};

// GET /api/resource/project/:owner/:name
router.get('/project/:owner/:name', async (req, res) => {
    try {
        const { owner, name } = req.params;
        const url = `${UPSTREAM_API}/repos/${owner}/${name}`;

        const data = await fetchUpstream(url, res);
        if (!data) return;

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
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/resource/tree/:owner/:name/:branch?
router.get('/tree/:owner/:name/:branch?', async (req, res) => {
    try {
        const { owner, name, branch = 'main' } = req.params;

        let actualBranch = branch;
        if (branch === 'main') {
            const projectUrl = `${UPSTREAM_API}/repos/${owner}/${name}`;
            const projectData = await fetchUpstream(projectUrl, res);
            if (!projectData) return;
            actualBranch = projectData.default_branch || 'main';
        }

        const url = `${UPSTREAM_API}/repos/${owner}/${name}/git/trees/${actualBranch}?recursive=1`;
        const data = await fetchUpstream(url, res);
        if (!data) return;

        const tree = data.tree
            .filter(item => item.type === 'blob' || item.type === 'tree')
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

// GET /api/resource/file/:owner/:name/:branch/*path
router.get('/file/:owner/:name/:branch/*', async (req, res) => {
    try {
        const { owner, name, branch } = req.params;
        const filePath = req.params[0];

        if (!filePath) {
            return res.status(400).json({ error: 'File path is required' });
        }

        const url = `${UPSTREAM_RAW}/${owner}/${name}/${branch}/${filePath}`;

        const headers = {
            'User-Agent': 'ResourceProxy/1.0'
        };

        if (process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN || process.env.RESOURCE_TOKEN}`;
        }

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
