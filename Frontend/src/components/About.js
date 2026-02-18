import React from 'react';
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
  return (
    <section className="about-layout">
      <article className="card about-hero">
        <p className="home-kicker">About the project</p>
        <h2 className="section-title">CloudNote is built for focused engineering notes.</h2>
        <p className="section-subtitle">
          The product blends lightweight note-taking with repository browsing so ideas, references,
          and context stay together.
        </p>
      </article>

      <article className="card about-links">
        <h3>Connect</h3>
        <div className="links-container">
          {socialLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-item"
            >
              <span className="link-icon">{link.icon}</span>
              <span className="link-name">{link.name}</span>
            </a>
          ))}
        </div>
      </article>
    </section>
  );
};

export default About;
