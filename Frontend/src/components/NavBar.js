import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = Boolean(localStorage.getItem('token'));

  const handleLogOut = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header className="top-nav card">
      <div className="top-nav__brand-wrap">
        <Link className="top-nav__brand" to="/">
          <span className="top-nav__dot" />
          CloudNote
        </Link>
        <span className="top-nav__tag">Knowledge Workspace</span>
      </div>

      <nav className="top-nav__links">
        <Link className={`top-nav__link ${location.pathname === '/' ? 'is-active' : ''}`} to="/">
          Home
        </Link>
        <Link className={`top-nav__link ${location.pathname === '/about' ? 'is-active' : ''}`} to="/about">
          About
        </Link>
        <Link className={`top-nav__link ${location.pathname.startsWith('/code') ? 'is-active' : ''}`} to="/code">
          Resources
        </Link>
      </nav>

      <div className="top-nav__actions">
        {!isAuthenticated ? (
          <>
            <Link className="btn-ghost" to="/login">Login</Link>
            <Link className="btn-primary" to="/signup">Create account</Link>
          </>
        ) : (
          <button onClick={handleLogOut} className="btn-primary">Logout</button>
        )}
      </div>
    </header>
  );
};

export default NavBar;
