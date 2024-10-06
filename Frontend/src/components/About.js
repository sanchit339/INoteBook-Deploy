import React, { useEffect, useState } from 'react';
import { FaLinkedin, FaGithub, FaInstagram, FaCode } from 'react-icons/fa';
import './about.css';

const socialLinks = [
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

  // Fetch download count from GitHub API
  const fetchDownloadCount = async () => {
    const owner = "sanchit339"; // Replace with your GitHub username
    const repo = "swadhaya8thclass"; // Replace with your repository name
    const url = `https://api.github.com/repos/sanchit339/swadhaya8thclass/releases`;

    try {
      const response = await fetch(url);
      const releases = await response.json();

      // Calculate total downloads from the latest release
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

  return (
    <div className="futuristic-template">
      <h2>About Me</h2>
      <p>Hii I am Sanchit Ingale Thanks for visiting</p>

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

      {/* Add app visit link */}
      <div className="app-visit">
        <h3>Visit My App</h3>
        <a
          href="https://github.com/sanchit339/swadhaya8thclass/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="app-link"
        >
          Download the App
        </a>
        <p>Total Downloads: {downloadCount}</p>
      </div>
    </div>
  );
};

export default About;
