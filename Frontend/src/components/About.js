import React, { useEffect, useState } from 'react';
import { FaLinkedin, FaGithub, FaInstagram, FaCode, FaLink } from 'react-icons/fa';
import './about.css';

const initialSocialLinks = [
  {
    icon: <FaLinkedin />,
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/in/sanchit339',
  },
  {
    icon: <FaGithub />,
    name: 'GitHub',
    url: 'https://github.com/sanchit339',
  },
  {
    icon: <FaInstagram />,
    name: 'Instagram',
    url: 'https://www.instagram.com/___sanchit_3',
  },
  {
    icon: <FaCode />,
    name: 'Codeforces',
    url: 'https://codeforces.com/profile/panther339',
  },
  {
    icon: <FaCode />,
    name: 'Codechef',
    url: 'https://www.codechef.com/users/sanchit339',
  },
];

const About = () => {
  const [downloadCount, setDownloadCount] = useState(0);
  const [socialLinks, setSocialLinks] = useState(initialSocialLinks);
  const [customLink, setCustomLink] = useState('');
  const [submittedLink, setSubmittedLink] = useState('');

  // Fetch download count from GitHub API
  const fetchDownloadCount = async () => {
    const owner = "sanchit339";
    const repo = "swadhaya8thclass";
    const url = `https://api.github.com/repos/${owner}/${repo}/releases`;

    try {
      const response = await fetch(url);
      const releases = await response.json();
      const totalDownloads = releases.reduce((acc, release) => {
        release.assets.forEach(asset => {
          acc += asset.download_count || 0;
        });
        return acc;
      }, 0);

      setDownloadCount(totalDownloads);
    } catch (error) {
      console.error("Error fetching download count:", error);
    }
  };

  useEffect(() => {
    fetchDownloadCount();
  }, []);

  // Function to determine if the link is a YouTube video
  const getYouTubeEmbedUrl = (url) => {
    const match = url.match(/(?:youtube\.com\/(?:.*v=|.*\/v\/|.*\/embed\/)|youtu\.be\/)([^?&]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  return (
    <div className="futuristic-template">
      <h2>About Me</h2>
      <p>Hii, I am Sanchit Ingale. Thanks for visiting!</p>

      {/* Dynamic Social Links */}
      <div className="links-container">
        {socialLinks.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="link-item"
          >
            <div className="link-icon">{link.icon}</div>
            <div className="link-name">{link.name}</div>
          </a>
        ))}
      </div>

      {/* Custom Link Input */}
      <div className="custom-link-container" style={{ marginTop: '20px', textAlign: 'center' }}>
        <h3 style={{ color: '#00ffcc' }}>Add a Custom Link</h3>
        <input
          type="text"
          placeholder="Enter YouTube or Website link..."
          value={customLink}
          onChange={(e) => setCustomLink(e.target.value)}
          style={{
            padding: '10px',
            width: '80%',
            borderRadius: '5px',
            border: '1px solid #00ffcc',
            backgroundColor: '#222',
            color: '#fff',
            marginRight: '10px',
          }}
        />
        <button
          onClick={() => setSubmittedLink(customLink)}
          style={{
            padding: '10px 15px',
            backgroundColor: '#00ffcc',
            color: '#000',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            transition: '0.3s',
          }}
        >
          Submit
        </button>
      </div>

      {/* Display Submitted Link */}
      {submittedLink && (
        <div className="submitted-link-container" style={{ marginTop: '20px', textAlign: 'center' }}>
          {getYouTubeEmbedUrl(submittedLink) ? (
            // Display YouTube video if it's a valid YouTube link
            <iframe
              width="560"
              height="315"
              src={getYouTubeEmbedUrl(submittedLink)}
              title="YouTube Video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ borderRadius: '10px', boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)' }}
            ></iframe>
          ) : (
            // Otherwise, display a clickable link
            <div>
              <FaLink style={{ color: '#00ffcc', marginRight: '5px' }} />
              <a
                href={submittedLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#00ffcc', textDecoration: 'none', fontSize: '18px' }}
              >
                Visit Link
              </a>
            </div>
          )}
        </div>
      )}

      {/* App Download Section */}
      <div
        style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#1a1a1a',
          borderRadius: '10px',
          textAlign: 'center',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)',
          color: '#f5f5f5'
        }}
      >
        <h3
          style={{
            fontSize: '24px',
            marginBottom: '15px',
            color: '#00ffcc',
            textShadow: '2px 2px 5px rgba(0, 0, 0, 0.5)',
          }}
        >
          Visit My App
        </h3>
        <a
          href="https://github.com/sanchit339/swadhaya8thclass/releases"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#00ffcc',
            color: '#000',
            textDecoration: 'none',
            borderRadius: '5px',
            fontSize: '18px',
            transition: 'background-color 0.3s ease, transform 0.3s ease',
            boxShadow: '0px 4px 8px rgba(0, 255, 204, 0.6)',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#00e6b8';
            e.target.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#00ffcc';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Download the App
        </a>
        <p style={{ marginTop: '10px', fontSize: '16px', color: '#f5f5f5' }}>
          Total Downloads: {downloadCount}
        </p>
      </div>
    </div>
  );
};

export default About;