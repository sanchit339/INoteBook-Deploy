import React from 'react';
import { Link } from 'react-router-dom';
import Notes from './Notes';

const Home = ({ showAlert }) => {
  const isAuthenticated = Boolean(localStorage.getItem('token'));

  if (isAuthenticated) {
    return <Notes showAlert={showAlert} />;
  }

  return (
    <section className="home-layout">
      <article className="home-hero card">
        <p className="home-kicker">Clean. Private. Searchable.</p>
        <h1 className="section-title">A polished notebook for your daily engineering flow.</h1>
        <p className="section-subtitle">
          Capture notes, revisit decisions, and keep code resources in one place. Designed for
          clarity first, with a documentation-inspired interface.
        </p>
        <div className="home-cta-row">
          <Link className="btn-primary" to="/signup">Start free</Link>
          <Link className="btn-ghost" to="/code">Explore resources</Link>
        </div>
      </article>

      <article className="home-side card">
        <h3>What you get</h3>
        <ul>
          <li>Fast note CRUD with secure auth</li>
          <li>Repository-backed resource browser</li>
          <li>Readable layouts tuned for long sessions</li>
        </ul>
      </article>
    </section>
  );
};

export default Home;
